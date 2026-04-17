import { quoteCache, historyCache, metricsCache, newsCache, searchCache, withCache } from '../lib/cache.js'
import { apiUrl } from '../lib/apiBase.js'

const BASE = '/finance'

// Validate stock symbols to prevent injection attacks
const VALID_SYMBOL = /^[A-Za-z0-9\.\-\^=]{1,20}$/
function validateSymbol(symbol) {
  if (!symbol || !VALID_SYMBOL.test(symbol)) throw new Error('Invalid symbol')
  return symbol
}

/* ── Raw fetch functions (uncached) ───────────────────────────────── */

async function _fetchQuote(symbol) {
  validateSymbol(symbol)
  const res = await fetch(apiUrl(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`))
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  const result = json.chart?.result?.[0]
  if (!result) throw new Error('No result')
  const meta = result.meta
  return {
    price: meta.regularMarketPrice,
    prevClose: meta.chartPreviousClose ?? meta.previousClose,
    currency: meta.currency ?? 'CAD',
    exchange: meta.exchangeName,
    marketState: meta.marketState,
  }
}

function _parseChartResult(json, interval) {
  const result = json.chart?.result?.[0]
  if (!result) return { points: [], ohlcv: [] }
  const timestamps = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const closes = quote.close ?? []
  const opens  = quote.open ?? []
  const highs  = quote.high ?? []
  const lows   = quote.low ?? []
  const vols   = quote.volume ?? []
  const isIntraday = /^\d+m$/.test(interval)

  const formatDate = (ts) => isIntraday
    ? new Date(ts * 1000).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
    : new Date(ts * 1000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

  const points = []
  const ohlcv = []

  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue
    const date = formatDate(timestamps[i])
    points.push({ date, close: closes[i] })
    ohlcv.push({
      date,
      timestamp: timestamps[i] * 1000,
      open:   opens[i],
      high:   highs[i],
      low:    lows[i],
      close:  closes[i],
      volume: vols[i],
    })
  }

  return { points, ohlcv }
}

// Returns backwards-compatible array of { date, close } points
async function _fetchHistory(symbol, range, interval) {
  validateSymbol(symbol)
  const res = await fetch(apiUrl(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`))
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  return _parseChartResult(json, interval).points
}

// Returns full OHLCV data for candlestick charts
async function _fetchHistoryFull(symbol, range, interval) {
  validateSymbol(symbol)
  const res = await fetch(apiUrl(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`))
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  return _parseChartResult(json, interval)
}

async function _fetchMetrics(symbol) {
  validateSymbol(symbol)
  const modules = 'summaryDetail,defaultKeyStatistics,financialData,price'
  const res = await fetch(apiUrl(`${BASE}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`))
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  const result = json.quoteSummary?.result?.[0]
  if (!result) throw new Error('No data')
  const sd = result.summaryDetail ?? {}
  const ks = result.defaultKeyStatistics ?? {}
  const fd = result.financialData ?? {}
  const pr = result.price ?? {}
  return {
    marketCap:      pr.marketCap?.raw ?? sd.marketCap?.raw,
    trailingPE:     sd.trailingPE?.raw ?? ks.trailingPE?.raw,
    forwardPE:      sd.forwardPE?.raw ?? ks.forwardPE?.raw,
    eps:            ks.trailingEps?.raw,
    dividendYield:  sd.dividendYield?.raw,
    dividendRate:   sd.dividendRate?.raw,
    beta:           sd.beta?.raw ?? ks.beta?.raw,
    high52w:        sd.fiftyTwoWeekHigh?.raw,
    low52w:         sd.fiftyTwoWeekLow?.raw,
    volume:         sd.volume?.raw ?? pr.regularMarketVolume?.raw,
    avgVolume10d:   sd.averageVolume10days?.raw,
    avgVolume:      sd.averageVolume?.raw,
    profitMargin:   fd.profitMargins?.raw,
    revenueGrowth:  fd.revenueGrowth?.raw,
    grossMargin:    fd.grossMargins?.raw,
    shortRatio:     ks.shortRatio?.raw,
    sharesOut:      ks.sharesOutstanding?.raw,
    bookValue:      ks.bookValue?.raw,
    priceToBook:    ks.priceToBook?.raw,
    targetMeanPrice: fd.targetMeanPrice?.raw,
    recommendation:  fd.recommendationKey,
  }
}

async function _fetchNews(symbol) {
  validateSymbol(symbol)
  const q = symbol.replaceAll('.TO', '').replaceAll('.V', '').replaceAll('^', '').replaceAll('-', '')
  const res = await fetch(apiUrl(`${BASE}/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=6&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`))
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  return (json.news ?? []).map(n => ({
    title: n.title,
    publisher: n.publisher,
    link: n.link,
    time: n.providerPublishTime,
    thumbnail: n.thumbnail?.resolutions?.[0]?.url,
  }))
}

async function _searchSymbol(query) {
  if (!query || query.trim().length < 1) return []
  const res = await fetch(apiUrl(`${BASE}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&enableFuzzyQuery=true&enableEnhancedTrivialQuery=true`))
  if (!res.ok) throw new Error(`${res.status}`)
  const json = await res.json()
  return (json.quotes ?? [])
    .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'MUTUALFUND')
    .map(q => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange || '',
      type: q.quoteType,
    }))
}

/* ── Cached exports ───────────────────────────────────────────────── */

export const fetchQuote = withCache(
  quoteCache,
  (symbol) => `quote:${symbol}`,
  _fetchQuote
)

export const fetchHistory = withCache(
  historyCache,
  (symbol, range, interval) => `history:${symbol}:${range}:${interval}`,
  _fetchHistory
)

export const fetchHistoryFull = withCache(
  historyCache,
  (symbol, range, interval) => `historyFull:${symbol}:${range}:${interval}`,
  _fetchHistoryFull
)

export const fetchMetrics = withCache(
  metricsCache,
  (symbol) => `metrics:${symbol}`,
  _fetchMetrics
)

export const fetchNews = withCache(
  newsCache,
  (symbol) => `news:${symbol}`,
  _fetchNews
)

export const searchSymbol = withCache(
  searchCache,
  (query) => `search:${query?.toLowerCase()}`,
  _searchSymbol
)

/**
 * Bulk fetch quotes for multiple symbols in a SINGLE API call.
 * Returns a Map of symbol → { price, prevClose, change, changePct, marketCap, pe, divYield, high52w, low52w }
 */
export async function fetchQuotesBulk(symbols) {
  if (!symbols || symbols.length === 0) return {}
  const valid = symbols.filter(s => VALID_SYMBOL.test(s))
  if (valid.length === 0) return {}

  const res = await fetch(apiUrl(`${BASE}/v7/finance/quote?symbols=${valid.map(encodeURIComponent).join(',')}`))
  if (!res.ok) throw new Error(`Bulk quote failed: ${res.status}`)
  const json = await res.json()
  const results = json.quoteResponse?.result ?? []

  const map = {}
  for (const q of results) {
    const price = q.regularMarketPrice
    const prevClose = q.regularMarketPreviousClose
    map[q.symbol] = {
      price,
      prevClose,
      change: price - (prevClose || price),
      changePct: q.regularMarketChangePercent ?? 0,
      marketCap: q.marketCap,
      pe: q.trailingPE,
      divYield: q.trailingAnnualDividendYield ? q.trailingAnnualDividendYield * 100 : 0,
      high52w: q.fiftyTwoWeekHigh,
      low52w: q.fiftyTwoWeekLow,
      volume: q.regularMarketVolume,
      currency: q.currency ?? 'USD',
      exchange: q.exchange,
      name: q.longName || q.shortName || q.symbol,
    }
    // Also populate the quote cache so individual fetchQuote calls are instant
    quoteCache.set(`quote:${q.symbol}`, {
      price,
      prevClose,
      currency: q.currency ?? 'USD',
      exchange: q.fullExchangeName || q.exchange,
      marketState: q.marketState,
    })
  }
  return map
}

/** Force-refresh a quote (bypass cache). */
export async function refreshQuote(symbol) {
  quoteCache.invalidate(`quote:${symbol}`)
  return fetchQuote(symbol)
}

/** Force-refresh all quotes for a list of stocks. */
export async function refreshQuotes(symbols) {
  symbols.forEach(s => quoteCache.invalidate(`quote:${s}`))
}

export function fetchLogoUrl(symbol) {
  return `https://financialmodelingprep.com/image-stock/${symbol.toUpperCase()}.png`
}
