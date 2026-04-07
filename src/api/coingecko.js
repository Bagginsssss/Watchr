import { fetchQuote, fetchHistory } from './yahoo.js'

const CG_BASE = '/coingecko/api/v3'

// Yahoo Finance symbols for each crypto
const YAHOO_SYMBOLS = {
  bitcoin: 'BTC-USD', ethereum: 'ETH-USD', solana: 'SOL-USD',
  ripple: 'XRP-USD', dogecoin: 'DOGE-USD', cardano: 'ADA-USD',
  'avalanche-2': 'AVAX-USD', chainlink: 'LINK-USD', polkadot: 'DOT-USD',
  'shiba-inu': 'SHIB-USD', uniswap: 'UNI-USD', litecoin: 'LTC-USD',
}

// Hardcoded ranks (roughly correct, updated periodically)
const RANKS = {
  bitcoin: 1, ethereum: 2, solana: 5, ripple: 4, dogecoin: 8,
  cardano: 9, 'avalanche-2': 12, chainlink: 14, polkadot: 16,
  'shiba-inu': 17, uniswap: 22, litecoin: 20,
}

// Coin image URLs (CoinGecko CDN works without API key)
const COIN_IMAGES = {
  bitcoin: 'https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png',
  ethereum: 'https://coin-images.coingecko.com/coins/images/279/small/ethereum.png',
  solana: 'https://coin-images.coingecko.com/coins/images/4128/small/solana.png',
  ripple: 'https://coin-images.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  dogecoin: 'https://coin-images.coingecko.com/coins/images/5/small/dogecoin.png',
  cardano: 'https://coin-images.coingecko.com/coins/images/975/small/cardano.png',
  'avalanche-2': 'https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  chainlink: 'https://coin-images.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
  polkadot: 'https://coin-images.coingecko.com/coins/images/12171/small/polkadot.png',
  'shiba-inu': 'https://coin-images.coingecko.com/coins/images/11939/small/shiba.png',
  uniswap: 'https://coin-images.coingecko.com/coins/images/12504/small/uniswap.png',
  litecoin: 'https://coin-images.coingecko.com/coins/images/2/small/litecoin.png',
}

// ── Cache + retry ──────────────────────────────────────────────────────────────
const cache = {}
const CACHE_TTL = 60_000

async function fetchWithRetry(url, cacheKey, retries = 2) {
  const cached = cache[cacheKey]
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429) {
        if (cached) return cached.data
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000))
        continue
      }
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      cache[cacheKey] = { data, ts: Date.now() }
      return data
    } catch (e) {
      if (cached) return cached.data
      if (attempt === retries - 1) throw e
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  if (cached) return cached.data
  throw new Error('API unavailable')
}

// ── Yahoo Finance fallback for market data ─────────────────────────────────────
async function fetchMarketsViaYahoo(cryptoList) {
  const results = await Promise.all(
    cryptoList.map(async (crypto) => {
      const yahooSym = YAHOO_SYMBOLS[crypto.id]
      if (!yahooSym) return null
      try {
        // Fetch quote + 7d sparkline in parallel
        const [quote, sparkline7d] = await Promise.all([
          fetchQuote(yahooSym),
          fetchHistory(yahooSym, '5d', '1d').catch(() => []),
        ])

        const change24h = quote.price - quote.prevClose
        const changePct24h = (change24h / quote.prevClose) * 100

        // Calculate 7d change from sparkline data
        let pct7d = null
        if (sparkline7d.length >= 2) {
          const first = sparkline7d[0].close
          const last = sparkline7d[sparkline7d.length - 1].close
          if (first > 0) pct7d = ((last - first) / first) * 100
        }

        // Fetch market cap from Yahoo's full chart metadata
        let marketCap = null
        try {
          const metaRes = await fetch(`/finance/v8/finance/chart/${yahooSym}?interval=1d&range=1d`)
          const metaJson = await metaRes.json()
          const meta = metaJson.chart?.result?.[0]?.meta
          // Yahoo stores market cap in regularMarketVolume * price as rough estimate
          // Actually not available directly, skip for now
        } catch {}

        return {
          id: crypto.id,
          symbol: crypto.symbol.toLowerCase(),
          name: crypto.name,
          image: COIN_IMAGES[crypto.id] || '',
          current_price: quote.price,
          market_cap: null,
          market_cap_rank: RANKS[crypto.id] || null,
          price_change_percentage_24h: changePct24h,
          price_change_percentage_7d_in_currency: pct7d,
          price_change_percentage_1h_in_currency: null,
          sparkline_in_7d: sparkline7d.length > 0
            ? { price: sparkline7d.map(d => d.close) }
            : null,
          _source: 'yahoo',
        }
      } catch { return null }
    })
  )
  return results.filter(Boolean).sort((a, b) => (a.market_cap_rank || 99) - (b.market_cap_rank || 99))
}

// ── Exports ────────────────────────────────────────────────────────────────────

export async function fetchCryptoMarkets(ids) {
  try {
    const url = `${CG_BASE}/coins/markets?vs_currency=usd&ids=${ids.join(',')}&order=market_cap_desc&sparkline=true&price_change_percentage=1h%2C24h%2C7d`
    return await fetchWithRetry(url, 'markets')
  } catch {
    const { CRYPTO_LIST } = await import('../data/crypto.js')
    const list = ids.map(id => CRYPTO_LIST.find(c => c.id === id)).filter(Boolean)
    return fetchMarketsViaYahoo(list)
  }
}

export async function fetchCryptoHistory(id, days) {
  try {
    const interval = days <= 1 ? 'hourly' : 'daily'
    const url = `${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`
    const json = await fetchWithRetry(url, `history_${id}_${days}`)
    return (json.prices ?? []).map(([ts, price]) => ({
      date: days <= 1
        ? new Date(ts).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
        : new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
      close: price,
    }))
  } catch {
    const yahooSym = YAHOO_SYMBOLS[id]
    if (!yahooSym) return []
    const rangeMap = { 1: '1d', 7: '5d', 30: '1mo', 90: '3mo', 365: '1y' }
    const intervalMap = { 1: '5m', 7: '15m', 30: '1d', 90: '1d', 365: '1wk' }
    return fetchHistory(yahooSym, rangeMap[days] || '1mo', intervalMap[days] || '1d')
  }
}

export async function fetchGlobalStats() {
  try {
    const json = await fetchWithRetry(`${CG_BASE}/global`, 'global')
    return json.data ?? {}
  } catch {
    // Build global stats from Yahoo BTC price as rough estimate
    try {
      const btcQuote = await fetchQuote('BTC-USD')
      const ethQuote = await fetchQuote('ETH-USD')
      const btcMcap = btcQuote.price * 19_800_000 // ~19.8M BTC supply
      const ethMcap = ethQuote.price * 120_000_000 // ~120M ETH supply
      const totalMcap = btcMcap * 1.8 // BTC is ~56% of total
      return {
        total_market_cap: { usd: totalMcap },
        total_volume: { usd: null },
        market_cap_percentage: {
          btc: (btcMcap / totalMcap * 100).toFixed(1),
          eth: (ethMcap / totalMcap * 100).toFixed(1),
        },
        _source: 'yahoo',
      }
    } catch {
      return {
        total_market_cap: { usd: null },
        total_volume: { usd: null },
        market_cap_percentage: { btc: null, eth: null },
      }
    }
  }
}
