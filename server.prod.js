import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000

// ── Load .env ─────────────────────────────────────────────────────────────────
try {
  const envFile = readFileSync(resolve(__dirname, '.env'), 'utf-8')
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

// ── Yahoo Finance auth cache ──────────────────────────────────────────────────
let yhoo = { crumb: '', cookie: '', ts: 0 }
let yhooRefreshInProgress = false
let yhooRefreshBackoff = 0

async function refreshYahooAuth() {
  if (yhooRefreshInProgress) return
  // Backoff: skip if last failure was too recent
  if (yhooRefreshBackoff > Date.now()) {
    console.warn(`[Yahoo] Auth refresh skipped (backoff until ${new Date(yhooRefreshBackoff).toISOString()})`)
    return
  }
  yhooRefreshInProgress = true
  try {
    const r1 = await fetch('https://fc.yahoo.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })
    const rawCookies = r1.headers.get('set-cookie') || ''
    const cookiePairs = rawCookies
      .split(/,(?=[^;]+=)/)
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
    const cookieStr = cookiePairs.join('; ')
    if (!cookieStr) throw new Error('No cookies')

    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Cookie': cookieStr,
      },
    })
    const crumb = (await r2.text()).trim()
    if (!crumb || crumb.startsWith('{')) throw new Error('Bad crumb')

    yhoo = { crumb, cookie: cookieStr, ts: Date.now() }
    yhooRefreshBackoff = 0
    console.log(`[Yahoo] Auth OK — crumb: ${crumb.slice(0, 6)}...`)
  } catch (e) {
    // Exponential backoff: 30s, 60s, 120s, max 5min
    yhooRefreshBackoff = Date.now() + Math.min(300_000, 30_000 * Math.pow(2, Math.min(3, yhooRefreshBackoff ? 1 : 0)))
    console.warn('[Yahoo] Auth refresh failed:', e.message, `— backoff until ${new Date(yhooRefreshBackoff).toISOString()}`)
  } finally {
    yhooRefreshInProgress = false
  }
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
const rateLimits = {}
function rateLimit(name, maxPerMin) {
  if (!rateLimits[name]) rateLimits[name] = { count: 0, resetAt: Date.now() + 60000 }
  const rl = rateLimits[name]
  if (Date.now() > rl.resetAt) { rl.count = 0; rl.resetAt = Date.now() + 60000 }
  rl.count++
  return rl.count <= maxPerMin
}

// ── Origin validation (block external abuse of proxy routes) ─────────────────
function validateOrigin(req, res, next) {
  const origin = req.headers.origin || req.headers.referer || ''
  const host = req.headers.host || ''
  // Allow same-origin requests (no Origin header) and requests from our own host
  if (!req.headers.origin || origin.includes(host) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return next()
  }
  return res.status(403).json({ error: 'Forbidden: cross-origin request blocked' })
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express()

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "font-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '))
  next()
})

// ── Anthropic proxy (Claude AI) ───────────────────────────────────────────────
const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
const MAX_ANTHROPIC_TOKENS = 4096

app.use('/anthropic', validateOrigin, express.json({ limit: '1mb' }), (req, res, next) => {
  if (!req.url.startsWith('/v1/messages')) return res.status(403).json({ error: 'Forbidden' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit('anthropic', 30)) return res.status(429).json({ error: 'Rate limit' })

  // Validate request body to prevent cost abuse
  const body = req.body
  if (body) {
    if (body.model && !ALLOWED_MODELS.includes(body.model)) {
      return res.status(400).json({ error: `Model not allowed. Use: ${ALLOWED_MODELS.join(', ')}` })
    }
    if (body.max_tokens && body.max_tokens > MAX_ANTHROPIC_TOKENS) {
      body.max_tokens = MAX_ANTHROPIC_TOKENS
    }
  }
  next()
})

app.use('/anthropic', createProxyMiddleware({
  target: 'https://api.anthropic.com',
  changeOrigin: true,
  pathRewrite: { '^/anthropic': '' },
  on: {
    proxyReq: (proxyReq) => {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (apiKey) {
        proxyReq.setHeader('x-api-key', apiKey)
        proxyReq.setHeader('anthropic-version', '2023-06-01')
      }
      proxyReq.removeHeader('origin')
      proxyReq.removeHeader('referer')
    },
  },
}))

// ── Yahoo Finance proxy ───────────────────────────────────────────────────────
app.use('/finance', validateOrigin, (req, res, next) => {
  if (!rateLimit('finance', 600)) return res.status(429).json({ error: 'Rate limit' })
  next()
})

app.use('/finance', createProxyMiddleware({
  target: 'https://query1.finance.yahoo.com',
  changeOrigin: true,
  pathRewrite: { '^/finance': '' },
  on: {
    proxyReq: (proxyReq) => {
      if (yhoo.cookie) {
        proxyReq.setHeader('Cookie', yhoo.cookie)
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36')
      }
      if (yhoo.crumb && proxyReq.path.includes('/v10/')) {
        const sep = proxyReq.path.includes('?') ? '&' : '?'
        proxyReq.path += `${sep}crumb=${encodeURIComponent(yhoo.crumb)}`
      }
    },
    proxyRes: (proxyRes) => {
      if (proxyRes.statusCode === 401) refreshYahooAuth()
    },
  },
}))

// ── Fear & Greed proxy ────────────────────────────────────────────
app.use('/fng', validateOrigin, (req, res, next) => {
  if (!rateLimit('fng', 30)) return res.status(429).json({ error: 'Rate limit' })
  next()
})

app.use('/fng', createProxyMiddleware({
  target: 'https://api.alternative.me',
  changeOrigin: true,
  pathRewrite: { '^/fng': '' },
}))

// ── CoinMarketCap proxy ───────────────────────────────────────────
app.use('/cmc', validateOrigin, (req, res, next) => {
  if (!rateLimit('cmc', 30)) return res.status(429).json({ error: 'Rate limit' })
  next()
})

app.use('/cmc', createProxyMiddleware({
  target: 'https://pro-api.coinmarketcap.com',
  changeOrigin: true,
  pathRewrite: { '^/cmc': '' },
  on: {
    proxyReq: (proxyReq) => {
      const cmcKey = process.env.CMC_API_KEY
      if (cmcKey) proxyReq.setHeader('X-CMC_PRO_API_KEY', cmcKey)
      proxyReq.removeHeader('origin')
      proxyReq.removeHeader('referer')
    },
  },
}))

// ── CoinGecko proxy ───────────────────────────────────────────────────────────
app.use('/coingecko', validateOrigin, (req, res, next) => {
  if (!rateLimit('coingecko', 60)) return res.status(429).json({ error: 'Rate limit' })
  next()
})

app.use('/coingecko', createProxyMiddleware({
  target: 'https://api.coingecko.com',
  changeOrigin: true,
  pathRewrite: { '^/coingecko': '' },
  on: {
    proxyReq: (proxyReq) => {
      const cgKey = process.env.COINGECKO_API_KEY
      if (cgKey) {
        proxyReq.setHeader('x-cg-demo-api-key', cgKey)
        const sep = proxyReq.path.includes('?') ? '&' : '?'
        proxyReq.path += `${sep}x_cg_demo_api_key=${cgKey}`
      }
      proxyReq.removeHeader('origin')
      proxyReq.removeHeader('referer')
    },
  },
}))

// ── Static files (Vite build output) ──────────────────────────────────────────
app.use(express.static(resolve(__dirname, 'dist')))

// SPA fallback — serve index.html for all non-API routes
app.use((req, res, next) => {
  // Only handle GET requests that didn't match API routes
  if (req.method === 'GET' && !req.path.startsWith('/finance') && !req.path.startsWith('/anthropic') && !req.path.startsWith('/coingecko') && !req.path.startsWith('/cmc') && !req.path.startsWith('/fng')) {
    res.sendFile(resolve(__dirname, 'dist', 'index.html'))
  } else {
    next()
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
await refreshYahooAuth()
setInterval(refreshYahooAuth, 25 * 60 * 1000)

app.listen(PORT, () => {
  console.log(`\n  Watchr production server running at http://localhost:${PORT}\n`)
})
