import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchQuote, fetchMetrics, fetchLogoUrl, searchSymbol, fetchQuotesBulk } from '../api/yahoo.js'
import { MARKETS, MARKET_LIST } from '../data/stocks.js'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { formatMarketCap, formatVolume, formatPct, formatNum } from '../utils/format.js'

/* ── Sector Colors ───────────────────────────────────────────────────── */
const SECTOR_COLORS = {
  'Financials': '#3B82F6',
  'Technology': '#8B5CF6',
  'Energy': '#F97316',
  'Industrials': '#14B8A6',
  'Materials': '#F59E0B',
  'Telecom': '#06B6D4',
  'Cons. Staples': '#22C55E',
  'Cons. Discretionary': '#FB7185',
  'Healthcare': '#38BDF8',
  'Utilities': '#FACC15',
}

const getSectorColor = (sector) => {
  const color = SECTOR_COLORS[sector]
  if (!color) return { bg: 'var(--bg-muted)', text: 'var(--text-secondary)', accent: '#999' }
  return { bg: `${color}15`, text: color, accent: color }
}

/* ── Display Symbol (strip exchange suffixes) ─────────────────────────── */
function displaySymbolText(symbol) {
  return symbol
    .replace(/\.(TO|V|NE|CN|L|DE|T)$/i, '')
    .replace(/-[A-Z]$/, s => ' ' + s.slice(1))
}

/* ── Logo Avatar ─────────────────────────────────────────────────────── */
function LogoAvatar({ symbol, size = 32 }) {
  const [failed, setFailed] = useState(false)
  const letter = (symbol?.[0] ?? '?').toUpperCase()
  const logoUrl = !failed ? fetchLogoUrl(symbol) : null

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={symbol}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          objectFit: 'contain',
          background: 'var(--bg-card)',
          padding: 2,
          boxSizing: 'border-box',
          flexShrink: 0,
          border: '1px solid var(--border)',
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 600,
        color: '#FFFFFF',
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  )
}

/* ── Map market ID to native currency ────────────────────────────────── */
function getMarketCurrency(marketId) {
  const m = MARKETS[marketId]
  return m?.defaultCurrency || 'USD'
}

/* ── 52-Week Range Indicator ─────────────────────────────────────────── */
function WeekRange52({ price, low, high }) {
  if (!low || !high || !price) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</div>

  const range = high - low
  if (range === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</div>

  const percentage = (price - low) / range
  const clampedPercentage = Math.max(0, Math.min(1, percentage))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ position: 'relative', height: 4, background: 'var(--bg-muted)', borderRadius: 2 }}>
        <div
          style={{
            position: 'absolute',
            left: `${clampedPercentage * 100}%`,
            width: 12,
            height: 12,
            background: 'var(--text)',
            borderRadius: '50%',
            top: -4,
            transform: 'translateX(-50%)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{formatNum(low, 2)}</span>
        <span>{formatNum(high, 2)}</span>
      </div>
    </div>
  )
}

/* ── Loading Skeleton ────────────────────────────────────────────────── */
function StockSkeleton() {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div
            style={{
              height: 16,
              background: 'var(--bg-hover)',
              borderRadius: 4,
              animation: 'pulse 2s infinite',
            }}
          />
        </td>
      ))}
    </tr>
  )
}

/* ── Search Detail Card ──────────────────────────────────────────────── */
function SearchDetailCard({ result, onAddWatchlist, isInWatchlist }) {
  const { currency, convert, sym } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([fetchQuote(result.symbol), fetchMetrics(result.symbol)])
      .then(([quote, metrics]) => {
        if (cancelled) return
        setData({ quote, metrics })
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [result.symbol])

  if (loading) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 24, marginTop: 12, animation: 'pulse 2s infinite',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--bg-hover)' }} />
          <div>
            <div style={{ width: 120, height: 20, borderRadius: 4, background: 'var(--bg-hover)', marginBottom: 6 }} />
            <div style={{ width: 200, height: 14, borderRadius: 4, background: 'var(--bg-hover)' }} />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 24, marginTop: 12, color: 'var(--text-muted)', textAlign: 'center',
      }}>
        Failed to load data for {result.symbol}
      </div>
    )
  }

  const { quote, metrics } = data
  const change = quote.price - (quote.prevClose || quote.price)
  const changePct = quote.prevClose ? (change / quote.prevClose) * 100 : 0
  const isPositive = changePct >= 0

  const statItems = [
    { label: 'Market Cap', value: metrics.marketCap ? formatMarketCap(metrics.marketCap, sym) : '—' },
    { label: 'P/E', value: metrics.trailingPE ? formatNum(metrics.trailingPE, 1) : '—' },
    { label: 'Forward P/E', value: metrics.forwardPE ? formatNum(metrics.forwardPE, 1) : '—' },
    { label: 'Div Yield', value: metrics.dividendYield ? `${(metrics.dividendYield * 100).toFixed(2)}%` : '—' },
    { label: 'Beta', value: metrics.beta ? formatNum(metrics.beta, 2) : '—' },
    { label: '52W High', value: metrics.high52w ? `${sym}${formatNum(metrics.high52w, 2)}` : '—' },
    { label: '52W Low', value: metrics.low52w ? `${sym}${formatNum(metrics.low52w, 2)}` : '—' },
    { label: 'Volume', value: metrics.volume ? formatVolume(metrics.volume) : '—' },
  ]

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
      padding: 24, marginTop: 12,
    }}>
      {/* Header: Logo + Symbol + Name + Exchange */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <LogoAvatar symbol={result.symbol} size={48} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
              {displaySymbolText(result.symbol)}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
              background: 'var(--bg-muted)', color: 'var(--text-secondary)',
            }}>
              {result.exchange}
            </span>
            {result.type && result.type !== 'EQUITY' && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                background: '#8B5CF615', color: '#8B5CF6',
              }}>
                {result.type}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
            {result.name}
          </div>
        </div>
      </div>

      {/* Price Row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 32, fontWeight: 700, color: 'var(--text)',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {sym}{formatNum(quote.price, 2)}
        </span>
        <span style={{
          fontSize: 15, fontWeight: 600, color: isPositive ? 'var(--green)' : 'var(--red)',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {isPositive ? '+' : ''}{formatNum(change, 2)}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
          background: isPositive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: isPositive ? 'var(--green)' : 'var(--red)',
        }}>
          {isPositive ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        {statItems.map(item => (
          <div key={item.label} style={{
            padding: '10px 14px', background: 'var(--bg)', borderRadius: 10,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{
              fontSize: 15, fontWeight: 600, color: 'var(--text)',
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Add to Watchlist */}
      <button
        onClick={() => onAddWatchlist(result.symbol)}
        style={{
          padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          border: '1px solid var(--border)', cursor: 'pointer',
          background: isInWatchlist ? 'var(--bg-muted)' : 'var(--bg-card)',
          color: isInWatchlist ? 'var(--text-secondary)' : 'var(--text)',
          transition: 'all 0.15s', width: '100%',
        }}
      >
        {isInWatchlist ? '★ In Watchlist' : '☆ Add to Watchlist'}
      </button>
    </div>
  )
}

/* ── Main Screener Tab ───────────────────────────────────────────────── */
export default function ScreenerTab() {
  const { currency, convert, sym } = useCurrency()

  // ── Search State ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState(null)

  // ── Screener State ────────────────────────────────────────────────────
  const [filterMarket, setFilterMarket] = useState('TSX')
  const [filterSector, setFilterSector] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [sortDesc, setSortDesc] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filterDivYieldMin, setFilterDivYieldMin] = useState(0)
  const [filterDivYieldMax, setFilterDivYieldMax] = useState(100)
  const [filterPEMin, setFilterPEMin] = useState(0)
  const [filterPEMax, setFilterPEMax] = useState(500)
  const [filterMarketCap, setFilterMarketCap] = useState('All')

  const [stocksData, setStocksData] = useState({})
  const [displayLimit, setDisplayLimit] = useState(10)
  const [fetching, setFetching] = useState(false)

  // Watchlist
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('watchlist') || '[]')
    } catch {
      return []
    }
  })

  // ── Search with debounce ──────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }

    const timeout = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const results = await searchSymbol(searchQuery.trim())
        setSearchResults(results)
        setSearchOpen(true)
      } catch {
        setSearchResults([])
      }
      setSearchLoading(false)
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchQuery])

  const handleSearchResultClick = useCallback((result) => {
    setSelectedResult(result)
    setSearchOpen(false)
    setSearchQuery(result.symbol)
  }, [])

  // ── Get all available sectors ────────────────────────────────────────
  const allSectors = useMemo(() => {
    const sectors = new Set()
    Object.values(MARKETS).forEach(market => {
      market.stocks.forEach(stock => {
        if (stock.sector) sectors.add(stock.sector)
      })
    })
    return Array.from(sectors).sort()
  }, [])

  // ── Build the full stock list from selected market + sector ──────────
  const allStocks = useMemo(() => {
    let list = []
    if (filterMarket === 'All') {
      Object.entries(MARKETS).forEach(([id, m]) => {
        m.stocks.forEach(s => list.push({ ...s, market: id }))
      })
    } else {
      const m = MARKETS[filterMarket]
      if (m) list = m.stocks.map(s => ({ ...s, market: filterMarket }))
    }
    // Deduplicate
    const seen = new Set()
    list = list.filter(s => { if (seen.has(s.symbol)) return false; seen.add(s.symbol); return true })
    // Filter by sector
    if (filterSector !== 'All') list = list.filter(s => s.sector === filterSector)
    return list
  }, [filterMarket, filterSector])

  // ── Enrich with fetched data, apply advanced filters, sort ───────────
  const filteredStocks = useMemo(() => {
    let result = allStocks.map(s => ({ ...s, ...(stocksData[s.symbol] || {}) }))

    // Only apply metric filters if advanced mode is on
    if (showAdvanced) {
      result = result.filter(s => {
        if (s.price == null) return true // haven't loaded yet, keep it
        const dy = s.divYield ?? 0
        const pe = s.pe ?? 0
        if (dy < filterDivYieldMin || dy > filterDivYieldMax) return false
        if (pe > 0 && (pe < filterPEMin || pe > filterPEMax)) return false
        if (filterMarketCap !== 'All') {
          const cap = s.marketCap ?? 0
          if (filterMarketCap === 'Mega' && cap <= 200e9) return false
          if (filterMarketCap === 'Large' && (cap < 10e9 || cap > 200e9)) return false
          if (filterMarketCap === 'Mid' && (cap < 2e9 || cap >= 10e9)) return false
          if (filterMarketCap === 'Small' && cap >= 2e9) return false
        }
        return true
      })
    }

    // Sort
    result.sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break
        case 'price':
          aVal = a.price ?? 0; bVal = b.price ?? 0; break
        case 'change':
          aVal = a.change ?? 0; bVal = b.change ?? 0; break
        case 'divYield':
          aVal = a.divYield ?? 0; bVal = b.divYield ?? 0; break
        case 'pe':
          aVal = a.pe ?? 999; bVal = b.pe ?? 999; break
        case 'marketCap':
          aVal = a.marketCap ?? 0; bVal = b.marketCap ?? 0; break
        default:
          aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase()
      }
      if (aVal < bVal) return sortDesc ? 1 : -1
      if (aVal > bVal) return sortDesc ? -1 : 1
      return 0
    })

    return result
  }, [allStocks, stocksData, showAdvanced, filterDivYieldMin, filterDivYieldMax, filterPEMin, filterPEMax, filterMarketCap, sortBy, sortDesc])

  const displayedStocks = useMemo(() => filteredStocks.slice(0, displayLimit), [filteredStocks, displayLimit])

  // ── Bulk fetch — single API call for all stocks ──────────────────────
  const fetchBatch = useCallback(async (stocks) => {
    if (stocks.length === 0) return
    setFetching(true)

    try {
      // ONE request for all symbols — price, P/E, div yield, market cap, 52w range
      const symbols = stocks.map(s => s.symbol)
      const bulkData = await fetchQuotesBulk(symbols)

      setStocksData(prev => {
        const next = { ...prev }
        Object.entries(bulkData).forEach(([symbol, data]) => {
          next[symbol] = data
        })
        return next
      })
    } catch (err) {
      console.error('Bulk fetch failed, falling back to individual:', err)
      // Fallback: fetch individually
      const quoteResults = await Promise.allSettled(
        stocks.map(s => fetchQuote(s.symbol))
      )
      setStocksData(prev => {
        const next = { ...prev }
        stocks.forEach((s, i) => {
          if (quoteResults[i].status === 'fulfilled') {
            const quote = quoteResults[i].value
            next[s.symbol] = {
              ...(prev[s.symbol] || {}),
              price: quote.price,
              prevClose: quote.prevClose,
              change: quote.price - (quote.prevClose || quote.price),
            }
          }
        })
        return next
      })
    }
    setFetching(false)
  }, [])

  // ── Auto-fetch when market/sector changes ────────────────────────────
  useEffect(() => {
    setDisplayLimit(10)
    const toFetch = allStocks.filter(s => !stocksData[s.symbol]).slice(0, 10)
    if (toFetch.length > 0) fetchBatch(toFetch)
  }, [filterMarket, filterSector]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── "Show More" handler ──────────────────────────────────────────────
  const showMore = useCallback(() => {
    const newLimit = displayLimit + 10
    setDisplayLimit(newLimit)
    const toFetch = allStocks.slice(displayLimit, newLimit).filter(s => !stocksData[s.symbol])
    if (toFetch.length > 0) fetchBatch(toFetch)
  }, [displayLimit, allStocks, stocksData, fetchBatch])

  // ── Toggle watchlist ─────────────────────────────────────────────────
  const toggleWatchlist = useCallback(symbol => {
    setWatchlist(prev => {
      const next = prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
      localStorage.setItem('watchlist', JSON.stringify(next))
      return next
    })
  }, [])

  // ── Quick preset filters ─────────────────────────────────────────────
  const applyPreset = useCallback(preset => {
    setDisplayLimit(10)
    // Reset advanced filters to defaults first
    setFilterDivYieldMin(0)
    setFilterDivYieldMax(100)
    setFilterPEMin(0)
    setFilterPEMax(500)
    setFilterMarketCap('All')
    setFilterMarket('All')
    setFilterSector('All')
    setShowAdvanced(true)

    switch (preset) {
      case 'highDiv':
        setFilterDivYieldMin(4)
        break
      case 'value':
        setFilterPEMax(15)
        break
      case 'growth':
        setFilterSector('Technology')
        break
      case 'tsxLarge':
        setFilterMarket('TSX')
        setFilterMarketCap('Large')
        break
      case 'usTech':
        setFilterMarket('SP500')
        setFilterSector('Technology')
        break
      case 'defensive':
        setFilterSector('Utilities')
        break
      default:
        break
    }
  }, [])

  return (
    <div style={{ padding: '20px', background: 'var(--bg)' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .screener-filters {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: flex-end;
        }
        .screener-filter-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .screener-filter-group label {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .screener-filter-group select,
        .screener-filter-group input {
          padding: 8px 12px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          font-size: 16px;
          font-family: inherit;
        }
        .screener-filter-group select:hover,
        .screener-filter-group input:hover {
          border-color: var(--border-hover);
        }
        .screener-filter-group select:focus,
        .screener-filter-group input:focus {
          outline: none;
          border-color: var(--text);
        }
        .screener-presets {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .preset-btn {
          padding: 8px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          color: var(--text);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .preset-btn:hover {
          background: var(--bg-hover);
          border-color: var(--border-hover);
        }
        .screener-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 16px;
        }
        .stat-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .stat-value {
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
        }
        .screener-table-wrap {
          overflow-x: auto;
        }
        .screener-table {
          width: 100%;
          border-collapse: collapse;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .screener-table thead {
          background: var(--bg-muted);
          border-bottom: 1px solid var(--border);
        }
        .screener-table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          cursor: pointer;
          user-select: none;
        }
        .screener-table th:hover {
          background: var(--border);
        }
        .screener-table tbody tr {
          border-bottom: 1px solid var(--border);
          transition: background 0.15s;
        }
        .screener-table tbody tr:hover {
          background: var(--bg-hover);
        }
        .screener-table td {
          padding: 12px 16px;
          font-size: 14px;
          color: var(--text);
        }
        .stock-name-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .stock-symbol {
          font-weight: 700;
          color: var(--text);
        }
        .stock-name {
          font-size: 13px;
          color: var(--text-secondary);
        }
        .price-cell {
          text-align: right;
          font-weight: 600;
        }
        .change-positive {
          color: var(--green);
        }
        .change-negative {
          color: var(--red);
        }
        .sector-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
        .watchlist-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          transition: transform 0.15s;
          padding: 4px 8px;
        }
        .watchlist-btn:hover {
          transform: scale(1.2);
        }
        .search-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          margin-top: 4px;
          max-height: 340px;
          overflow-y: auto;
          z-index: 100;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        }
        .search-result-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
          transition: background 0.12s;
        }
        .search-result-item:last-child {
          border-bottom: none;
        }
        .search-result-item:active {
          background: var(--bg-hover);
        }
        @media (max-width: 768px) {
          .screener-filters {
            flex-direction: column;
            align-items: stretch;
          }
          .screener-filter-group select,
          .screener-filter-group input {
            width: 100%;
          }
          .screener-table {
            font-size: 12px;
          }
          .screener-table th,
          .screener-table td {
            padding: 8px 10px;
          }
        }
      `}</style>

      {/* ═══════════════ SEARCH MODE ═══════════════ */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              fontSize: 18, pointerEvents: 'none', zIndex: 1,
            }}>
              🔍
            </span>
            <input
              className="screener-search-input"
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value)
                setSelectedResult(null)
              }}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }}
              inputMode="search"
              placeholder="Search any stock, ETF, or crypto worldwide..."
              style={{
                width: '100%',
                height: 52,
                fontSize: 16,
                borderRadius: 14,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                padding: '0 20px 0 46px',
                color: 'var(--text)',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {searchLoading && (
              <span style={{
                position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                fontSize: 13, color: 'var(--text-muted)',
              }}>
                Loading...
              </span>
            )}
          </div>

          {/* Search Dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map(r => (
                <div
                  key={r.symbol}
                  className="search-result-item"
                  onClick={() => handleSearchResultClick(r)}
                >
                  <LogoAvatar symbol={r.symbol} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>
                        {r.symbol}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: 'var(--bg-muted)', color: 'var(--text-muted)',
                      }}>
                        {r.exchange}
                      </span>
                      {r.type && r.type !== 'EQUITY' && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          background: '#8B5CF615', color: '#8B5CF6',
                        }}>
                          {r.type}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchOpen && searchResults.length === 0 && searchQuery.trim() && !searchLoading && (
            <div className="search-dropdown" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No results found
            </div>
          )}
        </div>

        {/* Search Detail Card */}
        {selectedResult && (
          <SearchDetailCard
            result={selectedResult}
            onAddWatchlist={toggleWatchlist}
            isInWatchlist={watchlist.includes(selectedResult.symbol)}
          />
        )}
      </div>

      {/* Close search dropdown on outside click */}
      {searchOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          onClick={() => setSearchOpen(false)}
        />
      )}

      {/* ═══════════════ SCREENER MODE ═══════════════ */}

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          Stock Screener
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
          Filter and discover stocks across global markets
        </p>
      </div>

      {/* Filter Bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div className="screener-filters">
          <div className="screener-filter-group" style={{ minWidth: 150 }}>
            <label>Market</label>
            <select value={filterMarket} onChange={e => setFilterMarket(e.target.value)}>
              <option value="All">All Markets</option>
              {['TSX', 'SP500', 'NASDAQ', 'FTSE100', 'DAX', 'NIKKEI', 'ETFs'].map(m => (
                <option key={m} value={m}>
                  {MARKETS[m]?.name || m}
                </option>
              ))}
            </select>
          </div>

          <div className="screener-filter-group" style={{ minWidth: 150 }}>
            <label>Sector</label>
            <select value={filterSector} onChange={e => setFilterSector(e.target.value)}>
              <option value="All">All Sectors</option>
              {allSectors.map(sector => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </div>

          <div className="screener-filter-group" style={{ minWidth: 140 }}>
            <label>Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="name">Name</option>
              <option value="price">Price</option>
              <option value="change">Daily Change %</option>
              <option value="divYield">Dividend Yield</option>
              <option value="pe">P/E Ratio</option>
              <option value="marketCap">Market Cap</option>
            </select>
          </div>

          <div className="screener-filter-group">
            <label>Direction</label>
            <select value={sortDesc ? 'desc' : 'asc'} onChange={e => setSortDesc(e.target.value === 'desc')}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>

        {/* Advanced Filters Toggle */}
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => setShowAdvanced(prev => !prev)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1px solid var(--border)', background: showAdvanced ? 'var(--bg-hover)' : 'var(--bg-card)',
              color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {showAdvanced ? '▾ Hide Advanced Filters' : '▸ Advanced Filters'}
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvanced && (
          <div className="screener-filters" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div className="screener-filter-group" style={{ minWidth: 130 }}>
              <label>Div Yield Min %</label>
              <input
                type="number" inputMode="decimal" min="0" max="100" step="0.5"
                value={filterDivYieldMin}
                onChange={e => setFilterDivYieldMin(parseFloat(e.target.value) || 0)}
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="screener-filter-group" style={{ minWidth: 130 }}>
              <label>Div Yield Max %</label>
              <input
                type="number" inputMode="decimal" min="0" max="100" step="0.5"
                value={filterDivYieldMax}
                onChange={e => setFilterDivYieldMax(parseFloat(e.target.value) || 100)}
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="screener-filter-group" style={{ minWidth: 120 }}>
              <label>P/E Min</label>
              <input
                type="number" inputMode="decimal" min="0" max="500" step="1"
                value={filterPEMin}
                onChange={e => setFilterPEMin(parseFloat(e.target.value) || 0)}
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="screener-filter-group" style={{ minWidth: 120 }}>
              <label>P/E Max</label>
              <input
                type="number" inputMode="decimal" min="0" max="500" step="1"
                value={filterPEMax}
                onChange={e => setFilterPEMax(parseFloat(e.target.value) || 500)}
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="screener-filter-group" style={{ minWidth: 160 }}>
              <label>Market Cap</label>
              <select value={filterMarketCap} onChange={e => setFilterMarketCap(e.target.value)}>
                <option value="All">All Caps</option>
                <option value="Mega">&gt;$200B (Mega)</option>
                <option value="Large">$10-200B (Large)</option>
                <option value="Mid">$2-10B (Mid)</option>
                <option value="Small">&lt;$2B (Small)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="screener-presets">
        <button className="preset-btn" onClick={() => applyPreset('highDiv')}>
          High Dividend (&gt;4%)
        </button>
        <button className="preset-btn" onClick={() => applyPreset('value')}>
          Value (P/E &lt; 15)
        </button>
        <button className="preset-btn" onClick={() => applyPreset('growth')}>
          Growth (Tech)
        </button>
        <button className="preset-btn" onClick={() => applyPreset('tsxLarge')}>
          TSX Large Cap
        </button>
        <button className="preset-btn" onClick={() => applyPreset('usTech')}>
          US Tech
        </button>
        <button className="preset-btn" onClick={() => applyPreset('defensive')}>
          Defensive
        </button>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Showing {displayedStocks.length} of {filteredStocks.length}
        {fetching && <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>Fetching...</span>}
      </div>

      {/* Results Table */}
      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th onClick={() => { setSortBy('name'); setSortDesc(sortBy === 'name' && !sortDesc) }}>
                Stock {sortBy === 'name' ? (sortDesc ? '▼' : '▲') : ''}
              </th>
              <th onClick={() => { setSortBy('price'); setSortDesc(sortBy === 'price' && !sortDesc) }}>
                Price {sortBy === 'price' ? (sortDesc ? '▼' : '▲') : ''}
              </th>
              <th onClick={() => { setSortBy('change'); setSortDesc(sortBy === 'change' && !sortDesc) }}>
                Change% {sortBy === 'change' ? (sortDesc ? '▼' : '▲') : ''}
              </th>
              <th onClick={() => { setSortBy('marketCap'); setSortDesc(sortBy === 'marketCap' && !sortDesc) }}>
                Market Cap {sortBy === 'marketCap' ? (sortDesc ? '▼' : '▲') : ''}
              </th>
              <th onClick={() => { setSortBy('pe'); setSortDesc(sortBy === 'pe' && !sortDesc) }}>
                P/E {sortBy === 'pe' ? (sortDesc ? '▼' : '▲') : ''}
              </th>
              <th onClick={() => { setSortBy('divYield'); setSortDesc(sortBy === 'divYield' && !sortDesc) }}>
                Div Yield {sortBy === 'divYield' ? (sortDesc ? '▼' : '▲') : ''}
              </th>
              <th>52W Range</th>
              <th>Sector</th>
              <th style={{ textAlign: 'center' }}>Watchlist</th>
            </tr>
          </thead>
          <tbody>
            {displayedStocks.length === 0 && !fetching && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                  No stocks match your filters. Try adjusting your search criteria.
                </td>
              </tr>
            )}

            {displayedStocks.map(stock => {
              const data = stocksData[stock.symbol]
              const hasData = data && data.price != null
              const changePercent = hasData && data.prevClose ? (data.change / data.prevClose) * 100 : 0
              const isPositive = changePercent >= 0

              return (
                <tr key={`${stock.market}-${stock.symbol}`}>
                  {/* Stock Name */}
                  <td>
                    <div className="stock-name-cell">
                      <LogoAvatar symbol={stock.symbol} size={32} />
                      <div>
                        <div className="stock-symbol">{displaySymbolText(stock.symbol)}</div>
                        <div className="stock-name">{stock.name}</div>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="price-cell">
                    {hasData ? (
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                        {sym}{convert(data.price, getMarketCurrency(stock.market)).toFixed(2)}
                      </div>
                    ) : (
                      <div style={{ height: 16, background: 'var(--bg-hover)', borderRadius: 4, width: 60, animation: 'pulse 2s infinite', marginLeft: 'auto' }} />
                    )}
                  </td>

                  {/* Change% */}
                  <td className="price-cell">
                    {hasData ? (
                      <div
                        className={isPositive ? 'change-positive' : 'change-negative'}
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                      </div>
                    ) : (
                      <div style={{ height: 16, background: 'var(--bg-hover)', borderRadius: 4, width: 70, animation: 'pulse 2s infinite', marginLeft: 'auto' }} />
                    )}
                  </td>

                  {/* Market Cap */}
                  <td style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {hasData && data.marketCap ? (
                      formatMarketCap(convert(data.marketCap, getMarketCurrency(stock.market)), sym)
                    ) : (
                      hasData ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <div style={{ height: 16, background: 'var(--bg-hover)', borderRadius: 4, width: 50, animation: 'pulse 2s infinite', marginLeft: 'auto' }} />
                    )}
                  </td>

                  {/* P/E Ratio */}
                  <td style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {hasData && data.pe ? formatNum(data.pe, 1) : (
                      hasData ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <div style={{ height: 16, background: 'var(--bg-hover)', borderRadius: 4, width: 36, animation: 'pulse 2s infinite', marginLeft: 'auto' }} />
                    )}
                  </td>

                  {/* Dividend Yield */}
                  <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", color: data && data.divYield > 0 ? 'var(--green)' : 'var(--text)' }}>
                    {hasData ? (data.divYield > 0 ? `${data.divYield.toFixed(2)}%` : <span style={{ color: 'var(--text-muted)' }}>—</span>) : (
                      <div style={{ height: 16, background: 'var(--bg-hover)', borderRadius: 4, width: 40, animation: 'pulse 2s infinite', marginLeft: 'auto' }} />
                    )}
                  </td>

                  {/* 52-Week Range */}
                  <td style={{ width: 180 }}>
                    {hasData && data.high52w && data.low52w ? (
                      <WeekRange52 price={data.price} low={data.low52w} high={data.high52w} />
                    ) : (
                      <div style={{ height: 16, background: 'var(--bg-hover)', borderRadius: 4, width: '100%', animation: 'pulse 2s infinite' }} />
                    )}
                  </td>

                  {/* Sector Badge */}
                  <td>
                    {stock.sector ? (
                      <span className="sector-badge" style={getSectorColor(stock.sector)}>
                        {stock.sector}
                      </span>
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>—</div>
                    )}
                  </td>

                  {/* Watchlist Toggle */}
                  <td style={{ textAlign: 'center' }}>
                    <button className="watchlist-btn" onClick={() => toggleWatchlist(stock.symbol)}>
                      {watchlist.includes(stock.symbol) ? '★' : '☆'}
                    </button>
                  </td>
                </tr>
              )
            })}

            {/* Skeleton rows while fetching */}
            {fetching && displayedStocks.filter(s => !stocksData[s.symbol]).length > 0 &&
              Array.from({ length: Math.min(5, displayedStocks.filter(s => !stocksData[s.symbol]).length) }).map((_, i) => <StockSkeleton key={`skel-${i}`} />)
            }
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        {displayLimit < filteredStocks.length && (
          <button
            onClick={showMore}
            style={{
              padding: '12px 32px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text)', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            + Show 10 More ({filteredStocks.length - displayLimit} remaining)
          </button>
        )}
        {/* Prompt to use search when few results */}
        {filteredStocks.length < 5 && (
          <div style={{
            marginTop: 20, padding: '20px 24px', borderRadius: 12,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              Can't find what you're looking for?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Use the search bar above to find any stock, ETF, or crypto across all global exchanges — not just the ones listed here.
            </div>
            <button
              onClick={() => {
                const input = document.querySelector('.screener-search-input')
                if (input) { input.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
              }}
              style={{
                padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: 'none', background: '#0A7C5C', color: '#fff', cursor: 'pointer',
              }}
            >
              🔍 Search All Markets
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
