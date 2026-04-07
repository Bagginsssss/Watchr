import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchQuote, fetchMetrics, fetchLogoUrl } from '../api/yahoo.js'
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
      {[1, 2, 3, 4, 5, 6, 7].map(i => (
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

/* ── Main Screener Tab ───────────────────────────────────────────────── */
export default function ScreenerTab() {
  const { currency, convert, sym } = useCurrency()

  // ── State ────────────────────────────────────────────────────────────
  const [allStocks, setAllStocks] = useState([])
  const [stocksData, setStocksData] = useState({})
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)

  // Filter state
  const [filterMarket, setFilterMarket] = useState('All')
  const [filterSector, setFilterSector] = useState('All')
  const [filterDivYieldMin, setFilterDivYieldMin] = useState(0)
  const [filterDivYieldMax, setFilterDivYieldMax] = useState(15)
  const [filterPEMin, setFilterPEMin] = useState(0)
  const [filterPEMax, setFilterPEMax] = useState(100)
  const [filterMarketCap, setFilterMarketCap] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [sortDesc, setSortDesc] = useState(false)

  // Watchlist
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('watchlist') || '[]')
    } catch {
      return []
    }
  })

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

  // ── Get stocks to display ────────────────────────────────────────────
  const stocks = useMemo(() => {
    let result = allStocks.map(s => ({ ...s, ...stocksData[s.symbol] }))

    // Apply market filter
    if (filterMarket !== 'All') {
      result = result.filter(s => s.market === filterMarket)
    }

    // Apply sector filter
    if (filterSector !== 'All') {
      result = result.filter(s => s.sector === filterSector)
    }

    // Apply dividend yield filter
    result = result.filter(s => {
      const dy = s.divYield ?? 0
      return dy >= filterDivYieldMin && dy <= filterDivYieldMax
    })

    // Apply P/E filter
    result = result.filter(s => {
      const pe = s.pe ?? 0
      return pe >= filterPEMin && pe <= filterPEMax
    })

    // Apply market cap filter
    if (filterMarketCap !== 'All') {
      result = result.filter(s => {
        const cap = s.marketCap ?? 0
        switch (filterMarketCap) {
          case 'Mega':
            return cap > 200e9
          case 'Large':
            return cap >= 10e9 && cap <= 200e9
          case 'Mid':
            return cap >= 2e9 && cap < 10e9
          case 'Small':
            return cap < 2e9
          default:
            return true
        }
      })
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case 'price':
          aVal = a.price ?? 0
          bVal = b.price ?? 0
          break
        case 'change':
          aVal = a.change ?? 0
          bVal = b.change ?? 0
          break
        case 'divYield':
          aVal = a.divYield ?? 0
          bVal = b.divYield ?? 0
          break
        case 'pe':
          aVal = a.pe ?? 999
          bVal = b.pe ?? 999
          break
        case 'marketCap':
          aVal = a.marketCap ?? 0
          bVal = b.marketCap ?? 0
          break
        default:
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
      }

      if (aVal < bVal) return sortDesc ? 1 : -1
      if (aVal > bVal) return sortDesc ? -1 : 1
      return 0
    })

    return result
  }, [allStocks, stocksData, filterMarket, filterSector, filterDivYieldMin, filterDivYieldMax, filterPEMin, filterPEMax, filterMarketCap, sortBy, sortDesc])

  // ── Load initial stock list ──────────────────────────────────────────
  useEffect(() => {
    const stocks = []
    Object.entries(MARKETS).forEach(([marketId, market]) => {
      market.stocks.forEach(stock => {
        stocks.push({ ...stock, market: marketId })
      })
    })
    setAllStocks(stocks)
  }, [])

  // ── Batch fetch metrics ──────────────────────────────────────────────
  // Only fetch metrics for stocks that are visible (first 30 + as user scrolls)
  const [fetchedCount, setFetchedCount] = useState(0)
  const BATCH_SIZE = 10
  const INITIAL_LOAD = 30

  const fetchMoreStocks = useCallback(async (stockList) => {
    if (stockList.length === 0) return
    setFetching(true)

    for (let i = 0; i < stockList.length; i += BATCH_SIZE) {
      const batch = stockList.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async stock => {
          const [quote, metrics] = await Promise.all([
            fetchQuote(stock.symbol),
            fetchMetrics(stock.symbol),
          ])
          return { symbol: stock.symbol, quote, metrics }
        })
      )

      setStocksData(prev => {
        const next = { ...prev }
        results.forEach(r => {
          if (r.status === 'fulfilled') {
            const { quote, metrics } = r.value
            next[r.value.symbol] = {
              price: quote.price,
              prevClose: quote.prevClose,
              change: quote.price - (quote.prevClose || quote.price),
              marketCap: metrics.marketCap,
              pe: metrics.trailingPE,
              divYield: metrics.dividendYield ? metrics.dividendYield * 100 : 0,
              high52w: metrics.high52w,
              low52w: metrics.low52w,
            }
          }
        })
        return next
      })

      if (i + BATCH_SIZE < stockList.length) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    setFetching(false)
  }, [])

  // Initial load — just first 30 stocks
  useEffect(() => {
    if (allStocks.length === 0) return
    const toFetch = allStocks.filter(s => !stocksData[s.symbol]).slice(0, INITIAL_LOAD)
    if (toFetch.length > 0) {
      fetchMoreStocks(toFetch).then(() => setFetchedCount(INITIAL_LOAD))
    }
  }, [allStocks.length])

  // Load more when user scrolls to bottom
  const loadMore = useCallback(() => {
    const unfetched = allStocks.filter(s => !stocksData[s.symbol])
    const nextBatch = unfetched.slice(0, 20)
    if (nextBatch.length > 0) {
      fetchMoreStocks(nextBatch).then(() => setFetchedCount(prev => prev + 20))
    }
  }, [allStocks, stocksData, fetchMoreStocks])

  // ── Enrich stock data with metrics ───────────────────────────────────
  const enrichedStocks = useMemo(() => {
    return allStocks.map(stock => ({
      ...stock,
      ...stocksData[stock.symbol],
    }))
  }, [allStocks, stocksData])

  // ── Toggle watchlist ─────────────────────────────────────────────────
  const toggleWatchlist = useCallback(
    symbol => {
      setWatchlist(prev => {
        const next = prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
        localStorage.setItem('watchlist', JSON.stringify(next))
        return next
      })
    },
    []
  )

  // ── Quick preset filters ─────────────────────────────────────────────
  const applyPreset = useCallback(preset => {
    switch (preset) {
      case 'highDiv':
        setFilterDivYieldMin(4)
        setFilterDivYieldMax(15)
        setFilterMarket('All')
        setFilterSector('All')
        break
      case 'value':
        setFilterPEMin(0)
        setFilterPEMax(15)
        setFilterMarket('All')
        setFilterSector('All')
        break
      case 'growth':
        setFilterMarket('All')
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
        setFilterMarket('All')
        setFilterSector('All')
        break
      default:
        break
    }
  }, [])

  // ── Calculate stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const validStocks = stocks.filter(s => s.price != null)
    if (validStocks.length === 0) return { count: 0, avgDiv: 0, avgPE: 0, avgCap: 0 }

    const avgDiv = validStocks.reduce((sum, s) => sum + (s.divYield ?? 0), 0) / validStocks.length
    const avgPE = validStocks.reduce((sum, s) => sum + (s.pe ?? 0), 0) / validStocks.length
    const avgCap = validStocks.reduce((sum, s) => sum + (s.marketCap ?? 0), 0) / validStocks.length

    return {
      count: validStocks.length,
      avgDiv,
      avgPE,
      avgCap,
    }
  }, [stocks])

  // ── CSS Pulse animation ──────────────────────────────────────────────
  const pulseStyle = {
    '@keyframes pulse': {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.5 },
    },
  }

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

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>Stock Screener</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Filter and discover stocks across global markets</p>
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

      {/* Filter Bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div className="screener-filters">
          <div className="screener-filter-group" style={{ minWidth: 150 }}>
            <label>Market</label>
            <select value={filterMarket} onChange={e => setFilterMarket(e.target.value)}>
              <option value="All">All Markets</option>
              {['TSX', 'SP500', 'NASDAQ', 'FTSE100', 'DAX', 'NIKKEI'].map(m => (
                <option key={m} value={m}>
                  {MARKET_LIST.find(x => x.id === m)?.name || m}
                </option>
              ))}
            </select>
          </div>

          <div className="screener-filter-group" style={{ minWidth: 150 }}>
            <label>Sector</label>
            <select value={filterSector} onChange={e => setFilterSector(e.target.value)}>
              <option value="All">All Sectors</option>
              {allSectors.map(sector => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </div>

          <div className="screener-filter-group" style={{ minWidth: 140 }}>
            <label>Div Yield Min %</label>
            <input type="number" min="0" max="15" value={filterDivYieldMin} onChange={e => setFilterDivYieldMin(parseFloat(e.target.value) || 0)} />
          </div>

          <div className="screener-filter-group" style={{ minWidth: 140 }}>
            <label>Div Yield Max %</label>
            <input type="number" min="0" max="15" value={filterDivYieldMax} onChange={e => setFilterDivYieldMax(parseFloat(e.target.value) || 15)} />
          </div>

          <div className="screener-filter-group" style={{ minWidth: 120 }}>
            <label>P/E Min</label>
            <input type="number" min="0" max="100" value={filterPEMin} onChange={e => setFilterPEMin(parseFloat(e.target.value) || 0)} />
          </div>

          <div className="screener-filter-group" style={{ minWidth: 120 }}>
            <label>P/E Max</label>
            <input type="number" min="0" max="100" value={filterPEMax} onChange={e => setFilterPEMax(parseFloat(e.target.value) || 100)} />
          </div>

          <div className="screener-filter-group" style={{ minWidth: 140 }}>
            <label>Market Cap</label>
            <select value={filterMarketCap} onChange={e => setFilterMarketCap(e.target.value)}>
              <option value="All">All Caps</option>
              <option value="Mega">&gt;$200B (Mega)</option>
              <option value="Large">$10-200B (Large)</option>
              <option value="Mid">$2-10B (Mid)</option>
              <option value="Small">&lt;$2B (Small)</option>
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
      </div>

      {/* Stats Bar */}
      <div className="screener-stats">
        <div className="stat-card">
          <div className="stat-label">Results</div>
          <div className="stat-value">{stats.count}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Div Yield</div>
          <div className="stat-value">{formatPct(stats.avgDiv / 100)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg P/E</div>
          <div className="stat-value">{formatNum(stats.avgPE, 1)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Market Cap</div>
          <div className="stat-value">{formatMarketCap(stats.avgCap, sym)}</div>
        </div>
      </div>

      {/* Results Table */}
      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th onClick={() => { setSortBy('name'); setSortDesc(sortBy === 'name' && !sortDesc) }}>Stock</th>
              <th onClick={() => { setSortBy('price'); setSortDesc(sortBy === 'price' && !sortDesc) }}>Price</th>
              <th onClick={() => { setSortBy('change'); setSortDesc(sortBy === 'change' && !sortDesc) }}>Daily Change</th>
              <th onClick={() => { setSortBy('marketCap'); setSortDesc(sortBy === 'marketCap' && !sortDesc) }}>Market Cap</th>
              <th onClick={() => { setSortBy('pe'); setSortDesc(sortBy === 'pe' && !sortDesc) }}>P/E Ratio</th>
              <th onClick={() => { setSortBy('divYield'); setSortDesc(sortBy === 'divYield' && !sortDesc) }}>Div Yield</th>
              <th>52-Week Range</th>
              <th>Sector</th>
              <th style={{ textAlign: 'center' }}>Watchlist</th>
            </tr>
          </thead>
          <tbody>
            {fetching && stocks.length === 0 && [1, 2, 3, 4, 5].map(i => <StockSkeleton key={i} />)}

            {!fetching && stocks.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                  No stocks match your filters. Try adjusting your search criteria.
                </td>
              </tr>
            )}

            {stocks.map(stock => {
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
                      <div>{sym}{convert(data.price, stock.market).toFixed(2)}</div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>—</div>
                    )}
                  </td>

                  {/* Daily Change % */}
                  <td className="price-cell">
                    {hasData ? (
                      <div className={isPositive ? 'change-positive' : 'change-negative'}>
                        {isPositive ? '+' : ''}{formatPct(changePercent / 100)} ({formatNum(data.change, 2)})
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>—</div>
                    )}
                  </td>

                  {/* Market Cap */}
                  <td style={{ textAlign: 'right' }}>
                    {hasData && data.marketCap ? (
                      formatMarketCap(convert(data.marketCap, stock.market), sym)
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>—</div>
                    )}
                  </td>

                  {/* P/E Ratio */}
                  <td style={{ textAlign: 'right' }}>
                    {hasData && data.pe ? formatNum(data.pe, 1) : <div style={{ color: 'var(--text-muted)' }}>—</div>}
                  </td>

                  {/* Dividend Yield */}
                  <td style={{ textAlign: 'right', fontWeight: 600, color: data && data.divYield > 0 ? 'var(--green)' : 'var(--text)' }}>
                    {hasData && data.divYield ? formatPct(data.divYield / 100) : <div style={{ color: 'var(--text-muted)' }}>—</div>}
                  </td>

                  {/* 52-Week Range */}
                  <td style={{ width: 180 }}>
                    {hasData && data.high52w && data.low52w ? (
                      <WeekRange52 price={data.price} low={data.low52w} high={data.high52w} />
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</div>
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
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {fetching && (
        <div style={{ marginTop: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
          Loading data... {Object.keys(stocksData).length} / {allStocks.length} stocks
        </div>
      )}
      {!fetching && allStocks.filter(s => !stocksData[s.symbol]).length > 0 && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button onClick={loadMore}
            style={{
              padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
            }}

          >
            Load more stocks ({allStocks.filter(s => !stocksData[s.symbol]).length} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
