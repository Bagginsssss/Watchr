import { CRYPTO_LIST } from '../data/crypto.js'
import { fetchQuote, fetchHistory } from './yahoo.js'
import { cmcListingsCache, cmcMetadataCache, fearGreedCache } from '../lib/cache.js'

const CMC_BASE = '/cmc'

// ── CMC image URL (public CDN, no API call) ───────────────────────────────────
export function getCmcImageUrl(cmcId) {
  return `https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png`
}

// ── Helper: cached fetch ──────────────────────────────────────────────────────
async function cachedFetch(cache, key, fetchFn) {
  const cached = cache.get(key)
  if (cached && !cached.stale) return cached.value
  try {
    const result = await fetchFn()
    cache.set(key, result)
    return result
  } catch (err) {
    if (cached) return cached.value
    throw err
  }
}

// ── Fetch crypto markets (CMC primary, Yahoo fallback) ────────────────────────
export async function fetchCryptoMarkets() {
  return cachedFetch(cmcListingsCache, 'listings', async () => {
    try {
      return await _fetchViaCMC()
    } catch (err) {
      console.warn('[Crypto] CMC failed, falling back to Yahoo:', err.message)
      return _fetchViaYahoo()
    }
  })
}

async function _fetchViaCMC() {
  const res = await fetch(`${CMC_BASE}/v1/cryptocurrency/listings/latest?limit=50&convert=USD`)
  if (!res.ok) throw new Error(`CMC ${res.status}`)
  const json = await res.json()
  if (json.status?.error_code) throw new Error(json.status.error_message || 'CMC error')
  const cmcData = json.data ?? []

  // Build lookup by CMC ID
  const cmcMap = {}
  for (const d of cmcData) cmcMap[d.id] = d

  // Map to our data shape + fetch sparklines from Yahoo in parallel
  const coins = await Promise.all(CRYPTO_LIST.map(async (crypto) => {
    const d = cmcMap[crypto.cmcId]
    if (!d) return null

    const q = d.quote?.USD ?? {}

    // Sparkline from Yahoo (5-day daily candles)
    let sparkline = null
    try {
      const hist = await fetchHistory(crypto.yahooSymbol, '5d', '1d')
      if (hist.length > 0) sparkline = { price: hist.map(h => h.close) }
    } catch {}

    return {
      id: crypto.id,
      symbol: d.symbol.toLowerCase(),
      name: d.name,
      image: getCmcImageUrl(crypto.cmcId),
      current_price: q.price,
      market_cap: q.market_cap,
      market_cap_rank: d.cmc_rank,
      total_volume: q.volume_24h,
      price_change_percentage_24h: q.percent_change_24h,
      price_change_percentage_7d_in_currency: q.percent_change_7d,
      price_change_percentage_1h_in_currency: q.percent_change_1h,
      circulating_supply: d.circulating_supply,
      total_supply: d.total_supply,
      max_supply: d.max_supply,
      high_24h: null,
      low_24h: null,
      ath: null,
      ath_change_percentage: null,
      sparkline_in_7d: sparkline,
      _source: 'cmc',
    }
  }))

  return coins.filter(Boolean).sort((a, b) => (a.market_cap_rank || 99) - (b.market_cap_rank || 99))
}

async function _fetchViaYahoo() {
  const results = await Promise.all(CRYPTO_LIST.map(async (crypto) => {
    try {
      const [quote, sparkHist] = await Promise.all([
        fetchQuote(crypto.yahooSymbol),
        fetchHistory(crypto.yahooSymbol, '5d', '1d').catch(() => []),
      ])
      const change24h = quote.price - quote.prevClose
      const changePct24h = (change24h / quote.prevClose) * 100
      let pct7d = null
      if (sparkHist.length >= 2) {
        const first = sparkHist[0].close, last = sparkHist[sparkHist.length - 1].close
        if (first > 0) pct7d = ((last - first) / first) * 100
      }
      return {
        id: crypto.id, symbol: crypto.symbol.toLowerCase(), name: crypto.name,
        image: getCmcImageUrl(crypto.cmcId), current_price: quote.price,
        market_cap: null, market_cap_rank: null, total_volume: null,
        price_change_percentage_24h: changePct24h,
        price_change_percentage_7d_in_currency: pct7d,
        price_change_percentage_1h_in_currency: null,
        circulating_supply: null, total_supply: null, max_supply: null,
        high_24h: null, low_24h: null, ath: null, ath_change_percentage: null,
        sparkline_in_7d: sparkHist.length > 0 ? { price: sparkHist.map(d => d.close) } : null,
        _source: 'yahoo',
      }
    } catch { return null }
  }))
  return results.filter(Boolean)
}

// ── Fetch crypto history (Yahoo Finance — CMC free has no historical data) ────
export async function fetchCryptoHistory(id, days) {
  const crypto = CRYPTO_LIST.find(c => c.id === id)
  if (!crypto) return []
  const rangeMap = { 1: '1d', 7: '5d', 30: '1mo', 90: '3mo', 365: '1y' }
  const intervalMap = { 1: '5m', 7: '15m', 30: '1d', 90: '1d', 365: '1wk' }
  return fetchHistory(crypto.yahooSymbol, rangeMap[days] || '1mo', intervalMap[days] || '1d')
}

// ── Fetch global stats (CMC primary, estimate fallback) ───────────────────────
export async function fetchGlobalStats() {
  return cachedFetch(cmcListingsCache, 'globalStats', async () => {
    try {
      const res = await fetch(`${CMC_BASE}/v1/global-metrics/quotes/latest`)
      if (!res.ok) throw new Error(`CMC global ${res.status}`)
      const json = await res.json()
      const d = json.data
      const q = d?.quote?.USD ?? {}
      return {
        total_market_cap: { usd: q.total_market_cap },
        total_volume: { usd: q.total_volume_24h },
        market_cap_percentage: { btc: d?.btc_dominance, eth: d?.eth_dominance },
        active_cryptocurrencies: d?.total_cryptocurrencies,
        market_cap_change_24h: q.total_market_cap_yesterday_percentage_change,
        _source: 'cmc',
      }
    } catch {
      // Fallback: estimate from Yahoo BTC/ETH prices
      try {
        const btc = await fetchQuote('BTC-USD')
        const eth = await fetchQuote('ETH-USD')
        const btcMcap = btc.price * 19_800_000
        const ethMcap = eth.price * 120_000_000
        const totalMcap = btcMcap * 1.8
        return {
          total_market_cap: { usd: totalMcap },
          total_volume: { usd: null },
          market_cap_percentage: { btc: (btcMcap / totalMcap * 100), eth: (ethMcap / totalMcap * 100) },
          _source: 'yahoo',
        }
      } catch {
        return { total_market_cap: { usd: null }, total_volume: { usd: null }, market_cap_percentage: { btc: null, eth: null } }
      }
    }
  })
}

// ── Fetch coin metadata (CMC — descriptions, links) ──────────────────────────
export async function fetchCoinMetadata(cmcIds) {
  const key = `metadata:${cmcIds.join(',')}`
  return cachedFetch(cmcMetadataCache, key, async () => {
    const res = await fetch(`${CMC_BASE}/v2/cryptocurrency/info?id=${cmcIds.join(',')}`)
    if (!res.ok) throw new Error(`CMC info ${res.status}`)
    const json = await res.json()
    const result = {}
    for (const [id, info] of Object.entries(json.data ?? {})) {
      result[id] = {
        description: info.description,
        logo: info.logo,
        website: info.urls?.website?.[0],
        explorer: info.urls?.explorer?.[0],
        twitter: info.urls?.twitter?.[0],
        category: info.category,
        dateAdded: info.date_added,
      }
    }
    return result
  })
}

// ── Fear & Greed Index (alternative.me — free, no auth) ───────────────────────
export async function fetchFearGreedIndex() {
  return cachedFetch(fearGreedCache, 'fearGreed', async () => {
    const res = await fetch('/fng/fng/?limit=1&format=json')
    if (!res.ok) throw new Error(`F&G ${res.status}`)
    const json = await res.json()
    const d = json.data?.[0]
    return {
      value: parseInt(d?.value ?? 50),
      classification: d?.value_classification ?? 'Neutral',
    }
  })
}
