import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env manually so process.env has ANTHROPIC_API_KEY for the proxy
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch {}

// ── Yahoo Finance auth cache ───────────────────────────────────────────────────
let yhoo = { crumb: '', cookie: '', ts: 0 }

async function refreshYahooAuth() {
  try {
    // Step 1 — get a Yahoo session cookie from the consent/fc server
    const r1 = await fetch('https://fc.yahoo.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })

    // Parse Set-Cookie — can be one string or multiple (Node fetch joins with ', ')
    const rawCookies = r1.headers.get('set-cookie') || ''
    const cookiePairs = rawCookies
      .split(/,(?=[^;]+=)/)          // split on ", " before "key=" (avoids splitting on dates)
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
    const cookieStr = cookiePairs.join('; ')
    if (!cookieStr) throw new Error('No cookies from fc.yahoo.com')

    // Step 2 — exchange the cookie for a crumb
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Cookie': cookieStr,
      },
    })
    const crumb = (await r2.text()).trim()
    if (!crumb || crumb.startsWith('{')) throw new Error('Bad crumb: ' + crumb.slice(0, 60))

    yhoo = { crumb, cookie: cookieStr, ts: Date.now() }
    console.log('[Yahoo] Auth OK — crumb:', crumb.slice(0, 6) + '...')
    return true
  } catch (e) {
    console.warn('[Yahoo] Auth refresh failed:', e.message)
    return false
  }
}

// ── Rate limiter (simple in-memory per-proxy) ────────────────────────────────
const rateLimits = {}
function rateLimit(name, maxPerMin = 200) {
  if (!rateLimits[name]) rateLimits[name] = { count: 0, resetAt: Date.now() + 60000 }
  const rl = rateLimits[name]
  if (Date.now() > rl.resetAt) { rl.count = 0; rl.resetAt = Date.now() + 60000 }
  rl.count++
  return rl.count <= maxPerMin
}

// ── Vite config ────────────────────────────────────────────────────────────────
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'yahoo-auth',
      configureServer(server) {
        // Kick off crumb fetch on dev-server start
        refreshYahooAuth()
        // Auto-refresh every 25 minutes (crumb expires ~30 min)
        setInterval(refreshYahooAuth, 25 * 60 * 1000)

        // Block /yahoo-crumb in production (debug-only)
        server.middlewares.use('/yahoo-crumb', (_req, res) => {
          if (process.env.NODE_ENV === 'production') {
            res.statusCode = 404
            return res.end()
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ crumb: yhoo.crumb.slice(0, 8) + '...', ageSec: Math.round((Date.now() - yhoo.ts) / 1000) }))
        })

        // Guard the /anthropic proxy: only allow POST to /v1/messages
        server.middlewares.use('/anthropic', (req, res, next) => {
          // Only allow the messages endpoint
          if (!req.url.startsWith('/v1/messages')) {
            res.statusCode = 403
            return res.end(JSON.stringify({ error: 'Forbidden endpoint' }))
          }
          // Only allow POST
          if (req.method !== 'POST') {
            res.statusCode = 405
            return res.end(JSON.stringify({ error: 'Method not allowed' }))
          }
          // Rate limit: max 30 AI requests per minute
          if (!rateLimit('anthropic', 30)) {
            res.statusCode = 429
            return res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
          }
          next()
        })

        // Rate limit Yahoo proxy (50 stocks × 3 calls each + market bar = ~160 requests per load)
        server.middlewares.use('/finance', (req, res, next) => {
          if (!rateLimit('finance', 600)) {
            res.statusCode = 429
            return res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
          }
          next()
        })

        // Rate limit CoinMarketCap proxy
        server.middlewares.use('/cmc', (req, res, next) => {
          if (!rateLimit('cmc', 30)) {
            res.statusCode = 429
            return res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
          }
          next()
        })

        // Rate limit CoinGecko proxy
        server.middlewares.use('/coingecko', (req, res, next) => {
          if (!rateLimit('coingecko', 60)) {
            res.statusCode = 429
            return res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
          }
          next()
        })
      },
    },
  ],

  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    proxy: {
      '/finance': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/finance/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Inject cookie for all Yahoo requests
            if (yhoo.cookie) {
              proxyReq.setHeader('Cookie', yhoo.cookie)
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36')
            }
            // Append crumb to v10 quoteSummary requests
            if (yhoo.crumb && proxyReq.path.includes('/v10/')) {
              const sep = proxyReq.path.includes('?') ? '&' : '?'
              proxyReq.path += `${sep}crumb=${encodeURIComponent(yhoo.crumb)}`
            }
          })
          // If we get an Unauthorized response, trigger a crumb refresh
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.statusCode === 401) {
              refreshYahooAuth()
            }
          })
        },
      },
      '/coingecko': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coingecko/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const cgKey = process.env.COINGECKO_API_KEY
            if (cgKey) {
              proxyReq.setHeader('x-cg-demo-api-key', cgKey)
              const sep = proxyReq.path.includes('?') ? '&' : '?'
              proxyReq.path += `${sep}x_cg_demo_api_key=${cgKey}`
            }
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
      '/fng': {
        target: 'https://api.alternative.me',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fng/, ''),
      },
      '/cmc': {
        target: 'https://pro-api.coinmarketcap.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cmc/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const cmcKey = process.env.CMC_API_KEY
            if (cmcKey) proxyReq.setHeader('X-CMC_PRO_API_KEY', cmcKey)
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
      '/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anthropic/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Inject API key server-side — never exposed to the browser
            const apiKey = process.env.ANTHROPIC_API_KEY
            if (apiKey) {
              proxyReq.setHeader('x-api-key', apiKey)
              proxyReq.setHeader('anthropic-version', '2023-06-01')
            }
            // Strip browser headers so Anthropic treats this as a server request
            proxyReq.removeHeader('anthropic-dangerous-direct-browser-access')
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
    },
  },
})
