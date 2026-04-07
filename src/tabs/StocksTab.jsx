import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import ChartDragOverlay from '../components/ChartDragOverlay.jsx'
import MetricsGrid from '../components/MetricsGrid.jsx'
import NewsFeed from '../components/NewsFeed.jsx'
import StockSearchModal from '../components/StockSearchModal.jsx'
import { MARKETS, MARKET_LIST, RANGE_OPTIONS } from '../data/stocks.js'
import { fetchQuote, fetchHistory, fetchMetrics, fetchNews, fetchLogoUrl, refreshQuotes } from '../api/yahoo.js'
import { useAutoRefresh } from '../hooks/useAutoRefresh.js'
import ComparePanel from '../components/ComparePanel.jsx'
import PriceAlertModal from '../components/PriceAlertModal.jsx'
import WatchlistNotes from '../components/WatchlistNotes.jsx'
import CanadianTaxInfo from '../components/CanadianTaxInfo.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { supabase, supabaseReady } from '../lib/supabase.js'

/* ── Sector Colors (use accent with alpha for dark mode compatibility) */
const SECTOR_COLORS = {
  'Financials':         { accent: '#3B82F6' },
  'Technology':         { accent: '#8B5CF6' },
  'Energy':             { accent: '#F97316' },
  'Industrials':        { accent: '#14B8A6' },
  'Materials':          { accent: '#F59E0B' },
  'Telecom':            { accent: '#06B6D4' },
  'Cons. Staples':      { accent: '#22C55E' },
  'Cons. Discretionary':{ accent: '#FB7185' },
  'Healthcare':         { accent: '#38BDF8' },
  'Utilities':          { accent: '#FACC15' },
}

const getSectorColor = (sector) => {
  const c = SECTOR_COLORS[sector]
  if (!c) return { bg: 'var(--bg-muted)', text: 'var(--text-secondary)', accent: '#999' }
  return { bg: `${c.accent}15`, text: c.accent, accent: c.accent }
}

/* ── Display Symbol (strip exchange suffixes) ─────────────────────── */
function displaySymbolText(symbol) {
  return symbol
    .replace(/\.(TO|V|NE|CN|L|DE|T)$/i, '')
    .replace(/-[A-Z]$/, s => ' ' + s.slice(1))
}

/* ── Mini Sparkline (SVG) ───────────────────────────────────────── */
function Sparkline({ data, width = 80, height = 32, color }) {
  try {
    if (!data || !Array.isArray(data) || data.length < 2) return <div style={{ width, height }} />
    const closes = data.map(d => typeof d === 'number' ? d : d?.close).filter(c => c != null && isFinite(c))
    if (closes.length < 2) return <div style={{ width, height }} />

    const min = Math.min(...closes)
    const max = Math.max(...closes)
    const range = max - min || 1
    const pad = 2

    const points = closes.map((c, i) => {
      const x = pad + (i / (closes.length - 1)) * (width - pad * 2)
      const y = pad + (1 - (c - min) / range) * (height - pad * 2)
      return `${x},${y}`
    }).join(' ')

    const isUp = closes[closes.length - 1] >= closes[0]
    const stroke = color || (isUp ? '#0A7C5C' : '#C0392B')

    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  } catch {
    return <div style={{ width, height }} />
  }
}

/* ── Logo Avatar ─────────────────────────────────────────────────── */
function LogoAvatar({ symbol, logoUrl, size = 36 }) {
  const [failed, setFailed] = useState(false)
  const letter = (symbol?.[0] ?? '?').toUpperCase()
  if (logoUrl && !failed) {
    return (
      <img src={logoUrl} alt={symbol} onError={() => setFailed(true)}
        style={{
          width: size, height: size, borderRadius: size > 32 ? 10 : 6,
          objectFit: 'contain', background: 'var(--bg-card)',
          padding: 2, boxSizing: 'border-box', flexShrink: 0,
          border: '1px solid var(--border)',
        }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size > 32 ? 10 : 6,
      background: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 600, color: '#FFFFFF', flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

/* ── Chart Tooltip ───────────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label, sym }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
        {sym}{payload[0].value?.toFixed(2)}
      </div>
    </div>
  )
}

/* ── Mover Card (for top gainers/losers) ─────────────────────────── */
function MoverCard({ stock, logoUrl, sparkData, sym, convert }) {
  const isUp = (stock.changePct ?? 0) >= 0
  const color = isUp ? '#0A7C5C' : '#C0392B'
  const bgColor = isUp ? 'rgba(10, 124, 92, 0.04)' : 'rgba(192, 57, 43, 0.04)'
  const borderColor = isUp ? 'rgba(10, 124, 92, 0.15)' : 'rgba(192, 57, 43, 0.15)'
  const ds = displaySymbolText(stock.symbol)
  const displayPrice = convert(stock.price, stock.currency)

  return (
    <div style={{
      background: bgColor, border: `1px solid ${borderColor}`,
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
      minWidth: 0, flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoAvatar symbol={ds} logoUrl={logoUrl} size={28} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ds}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{sym}{displayPrice?.toFixed(2)}</div>
          <div style={{
            fontSize: 12, fontWeight: 600, color,
            background: isUp ? 'rgba(10,124,92,0.1)' : 'rgba(192,57,43,0.1)',
            borderRadius: 4, padding: '1px 6px', display: 'inline-block',
          }}>
            {isUp ? '+' : ''}{stock.changePct?.toFixed(2)}%
          </div>
        </div>
      </div>
      <Sparkline data={sparkData} width={200} height={28} color={color} />
    </div>
  )
}

/* ── Stock Grid Card ────────────────────────────────────────────── */
function StockGridCard({ stock, logoUrl, sparkData, selected, onClick, sym, convert, onRemove }) {
  const [hovered, setHovered] = useState(false)
  const isUp = (stock.changePct ?? 0) >= 0
  const color = isUp ? '#0A7C5C' : '#C0392B'
  const ds = displaySymbolText(stock.symbol)
  const displayPrice = convert(stock.price, stock.currency)
  const sc = getSectorColor(stock.sector)

  return (
    <div
      data-stock-card={stock.symbol}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: selected ? 'var(--bg-muted)' : 'var(--bg-card)',
        border: selected ? '1.5px solid var(--text)' : '1px solid var(--border)',
        borderRadius: 10,
        padding: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: hovered && !selected ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.08)' : selected ? '0 2px 8px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Remove button for watchlist */}
      {onRemove && hovered && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(stock.symbol) }}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 2,
            background: 'rgba(192,57,43,0.1)', border: 'none', borderRadius: 12,
            width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 11, color: '#C0392B', fontWeight: 700,
          }}
        >
          {'\u2715'}
        </button>
      )}

      {/* Top: Logo + Ticker + Sector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoAvatar symbol={ds} logoUrl={logoUrl} size={34} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{ds}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</div>
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 500, letterSpacing: 0.3,
          background: sc.bg, color: sc.text,
          padding: '3px 8px', borderRadius: 20,
        }}>
          {stock.sector}
        </span>
      </div>

      {/* Middle: Sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Sparkline data={sparkData} width={180} height={36} />
      </div>

      {/* Bottom: Price + Change */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {stock.loading ? (
          <div className="skeleton" style={{ width: 60, height: 18 }} />
        ) : stock.error ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data</div>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)', fontFamily: 'Georgia, serif', letterSpacing: '-0.5px', lineHeight: 1 }}>
              {sym}{displayPrice?.toFixed(2)}
            </div>
            <div style={{
              fontSize: 13, fontWeight: 600, color,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: isUp ? 'none' : 'rotate(180deg)' }}>
                <path d="M6 2L10 8H2L6 2Z" fill={color} />
              </svg>
              {isUp ? '+' : ''}{stock.changePct?.toFixed(2)}%
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Detail Panel ────────────────────────────────────────────────── */
function DetailPanel({ stock, logoUrl, history, historyLoading, metrics, metricsLoading, news, newsLoading, range, setRange, convert, sym, onClose, onCreateAlert, user, onRequestAuth }) {
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const stockCurrency = stock?.currency ?? 'CAD'
  const ds = displaySymbolText(stock.symbol)
  const displayPrice = convert(stock.price, stockCurrency)
  const isUp = (stock.changePct ?? 0) >= 0
  const rangeFirstClose = history.length > 0 ? history[0].close : null
  const rangeChange = rangeFirstClose != null && stock?.price != null ? stock.price - rangeFirstClose : null
  const rangeChangePct = rangeChange != null && rangeFirstClose ? (rangeChange / rangeFirstClose) * 100 : null
  const [detailTab, setDetailTab] = useState('metrics')

  const convertedHistory = history.map(d => ({
    ...d,
    close: d.close != null ? convert(d.close, stockCurrency) : null,
  }))

  const chartIsUp = rangeChange != null ? rangeChange >= 0 : isUp
  const lineColor = chartIsUp ? '#0A7C5C' : '#C0392B'
  const firstClose = convertedHistory[0]?.close

  return (
    <div className="fade-in" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '24px 28px', position: 'relative',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
    }}>
      {showAlertModal && (
        <PriceAlertModal
          symbol={stock.symbol}
          name={stock.name}
          currentPrice={stock.price}
          onClose={() => setShowAlertModal(false)}
          onCreate={onCreateAlert}
          userEmail={user?.email}
        />
      )}

      {/* Watchlist Notes Panel */}
      {showNotes && (
        <WatchlistNotes symbol={stock.symbol} name={stock.name} onClose={() => setShowNotes(false)} />
      )}

      {/* Action buttons — top right */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          onClick={() => setShowNotes(true)}
          style={{
            background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6,
            height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
            cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500,
          }}
        >
          📝 Notes
        </button>
        <button
          onClick={() => {
            if (!user) { onRequestAuth?.(); return }
            setShowAlertModal(true)
          }}
          style={{
            background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6,
            height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
            cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500,
          }}
        >
          🔔 Alert
        </button>
        <button onClick={onClose} style={{
          background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6,
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)',
        }}>
          {'\u2715'}
        </button>
      </div>

      {/* Header: Logo + Name on left, Price on right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <LogoAvatar symbol={ds} logoUrl={logoUrl} size={48} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)', fontFamily: 'Georgia, serif', letterSpacing: '-0.5px' }}>
            {stock.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {stock.symbol} {'\u00B7'} {stock.exchange ?? 'Exchange'}
            <span style={{ marginLeft: 8, color: stock.marketState === 'REGULAR' ? '#0A7C5C' : 'var(--text-muted)' }}>
              {stock.marketState === 'REGULAR' ? '\u25CF Open' : '\u25CF Closed'}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: 'var(--text)', fontFamily: 'Georgia, serif', letterSpacing: '-1px' }}>
            {sym}{displayPrice?.toFixed(2)}
          </div>
          {rangeChange != null && !historyLoading ? (
            <div style={{ fontSize: 13, color: rangeChange >= 0 ? '#0A7C5C' : '#C0392B' }}>
              {rangeChange >= 0 ? '+' : ''}{sym}{Math.abs(convert(rangeChange, stockCurrency) ?? 0).toFixed(2)} ({rangeChangePct >= 0 ? '+' : ''}{rangeChangePct?.toFixed(2)}%)
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, textTransform: 'uppercase' }}>Past {range.label}</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: isUp ? '#0A7C5C' : '#C0392B' }}>
              {isUp ? '+' : ''}{stock.changePct?.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'var(--bg-hover)', borderRadius: 6, padding: 2, width: 'fit-content' }}>
        {RANGE_OPTIONS.map(r => (
          <button
            key={r.label}
            onClick={() => setRange(r)}
            style={{
              background: range.label === r.label ? 'var(--bg-card)' : 'transparent',
              border: 'none', borderRadius: 4,
              color: range.label === r.label ? 'var(--text)' : 'var(--text-secondary)',
              fontSize: 11, fontWeight: range.label === r.label ? 600 : 400,
              padding: '5px 12px', cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: range.label === r.label ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {historyLoading ? (
        <div style={{ height: 200 }}><div className="skeleton" style={{ width: '100%', height: 200 }} /></div>
      ) : convertedHistory.length > 0 ? (
        <ChartDragOverlay data={convertedHistory} dataKey="close" height={200}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={convertedHistory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)} width={40} />
            <Tooltip content={<ChartTooltip sym={sym} />} />
            {firstClose && <ReferenceLine y={firstClose} stroke="var(--border)" strokeDasharray="3 3" />}
            <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
        </ChartDragOverlay>
      ) : (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No chart data
        </div>
      )}

      <div style={{ display: 'flex', gap: 0, margin: '20px 0 14px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {[
          { key: 'metrics', label: 'Key Metrics' },
          { key: 'tax', label: '🇨🇦 Tax Info' },
          { key: 'news', label: 'News' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setDetailTab(t.key)}
            style={{
              background: 'none', border: 'none',
              borderBottom: detailTab === t.key ? '2px solid var(--text)' : '2px solid transparent',
              color: detailTab === t.key ? 'var(--text)' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 400,
              padding: '6px 14px 10px', cursor: 'pointer',
              marginBottom: -1, transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {detailTab === 'metrics' && <MetricsGrid metrics={metrics} loading={metricsLoading} stockCurrency={stockCurrency} />}
      {detailTab === 'tax' && <CanadianTaxInfo symbol={stock.symbol} metrics={metrics} />}
      {detailTab === 'news' && <NewsFeed news={news} loading={newsLoading} />}
    </div>
  )
}

/* ── Batch helper: fetch in groups to avoid rate limits ──────────── */
async function batchFetch(items, fn, batchSize = 25) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(fn))
    results.push(...batchResults)
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, 100))
  }
  return results
}

/* ════════════════════════════════════════════════════════════════════
   MAIN: StocksTab
   ════════════════════════════════════════════════════════════════════ */
export default function StocksTab({ user, username, onRequestAuth, onCreateAlert, checkAlerts }) {
  const [activeMarket, setActiveMarket] = useState(() => localStorage.getItem('stocks_market') ?? 'TSX')
  const [stocks, setStocks] = useState([])
  const [logos, setLogos] = useState({})
  const [sparklines, setSparklines] = useState({})
  const [selected, setSelected] = useState(null)
  const [sectorFilter, setSectorFilter] = useState('All')
  const [lastUpdated, setLastUpdated] = useState(null)

  // Pick up stock selected from Command Palette
  const [paletteName, setPaletteName] = useState(null)
  useEffect(() => {
    const paletteSymbol = sessionStorage.getItem('palette_select_stock')
    if (paletteSymbol) {
      sessionStorage.removeItem('palette_select_stock')
      const name = sessionStorage.getItem('palette_select_name') || paletteSymbol
      sessionStorage.removeItem('palette_select_name')
      setPaletteName(name)
      setSelected(paletteSymbol)
    }
  }, [])

  // Detail panel state
  const [history, setHistory] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [news, setNews] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [newsLoading, setNewsLoading] = useState(false)
  const [range, setRange] = useState(RANGE_OPTIONS[1])

  // Watchlist state
  const [watchlistStocks, setWatchlistStocks] = useState([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [portfolioHoldings, setPortfolioHoldings] = useState([])

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false)
  const [compareSymbols, setCompareSymbols] = useState([])
  const [showCompare, setShowCompare] = useState(false)

  const { convert, sym, ensureSourceRate } = useCurrency()

  const isWatchlist = activeMarket === 'WATCHLIST'
  const currentStockDefs = useMemo(() => {
    if (isWatchlist) return watchlistStocks
    return MARKETS[activeMarket]?.stocks ?? MARKETS.TSX.stocks
  }, [activeMarket, watchlistStocks, isWatchlist])

  /* ── Data loading ────────────────────────────────────────────── */
  const loadQuotes = useCallback(async (stockList) => {
    const list = stockList ?? currentStockDefs
    if (list.length === 0) { setStocks([]); return }

    // Initialize all as loading
    setStocks(list.map(s => ({ ...s, loading: true, error: false })))

    // Progressive loading: update UI as each batch completes
    const batchSize = 25
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize)
      const batchResults = await Promise.allSettled(
        batch.map(async (s) => {
          const data = await fetchQuote(s.symbol)
          const change = data.price - data.prevClose
          const changePct = (change / data.prevClose) * 100
          return { ...s, ...data, change, changePct, loading: false, error: false }
        })
      )
      const batchUpdated = batchResults.map((r, j) =>
        r.status === 'fulfilled' ? r.value : { ...batch[j], loading: false, error: true }
      )
      // Merge this batch into state progressively
      setStocks(prev => {
        const next = [...prev]
        batchUpdated.forEach((item, j) => { next[i + j] = item })
        return next
      })
      if (i + batchSize < list.length) await new Promise(r => setTimeout(r, 100))
    }
    setLastUpdated(new Date())
  }, [currentStockDefs])

  // Logos are just URL strings — compute synchronously, no network calls needed
  const loadLogos = useCallback((stockList) => {
    const list = stockList ?? currentStockDefs
    const entries = list.map(s => [s.symbol, fetchLogoUrl(s.symbol)])
    setLogos(prev => ({ ...prev, ...Object.fromEntries(entries) }))
  }, [currentStockDefs])

  const loadSparklines = useCallback(async (stockList) => {
    const list = stockList ?? currentStockDefs
    const results = await batchFetch(list, async (s) => {
      const data = await fetchHistory(s.symbol, '5d', '1d')
      return [s.symbol, data]
    })
    const entries = results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : [list[i].symbol, []]
    )
    setSparklines(prev => ({ ...prev, ...Object.fromEntries(entries) }))
  }, [currentStockDefs])

  const loadDetail = useCallback(async (symbol, r) => {
    setHistoryLoading(true)
    setMetricsLoading(true)
    setNewsLoading(true)
    setHistory([])
    setMetrics(null)
    setNews([])

    fetchHistory(symbol, r.range, r.interval)
      .then(setHistory).catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))

    fetchMetrics(symbol)
      .then(setMetrics).catch(() => setMetrics(null))
      .finally(() => setMetricsLoading(false))

    fetchNews(symbol)
      .then(setNews).catch(() => setNews([]))
      .finally(() => setNewsLoading(false))
  }, [])

  /* ── Market switching ────────────────────────────────────────── */
  // Per-market cache to avoid refetching when switching back
  const [marketDataCache, setMarketDataCache] = useState({})

  function switchMarket(marketId) {
    // Save current market data before switching
    if (stocks.length > 0 && !isWatchlist) {
      setMarketDataCache(prev => ({ ...prev, [activeMarket]: stocks }))
    }
    setActiveMarket(marketId)
    localStorage.setItem('stocks_market', marketId)
    setSelected(null)
    setSectorFilter('All')
    // Restore cached data if available (instant switch-back)
    const cached = marketDataCache[marketId]
    if (cached && cached.length > 0 && marketId !== 'WATCHLIST') {
      setStocks(cached)
    }
  }

  // Load data when market changes
  useEffect(() => {
    if (isWatchlist) {
      loadWatchlist()
      return
    }
    const market = MARKETS[activeMarket]
    if (market) {
      // Ensure currency rate is loaded for this market
      ensureSourceRate(market.defaultCurrency)
      const list = market.stocks
      loadQuotes(list)
      loadLogos(list)
      loadSparklines(list)
    }
  }, [activeMarket])

  // Load watchlist data when watchlist stocks change
  useEffect(() => {
    if (isWatchlist && watchlistStocks.length > 0) {
      loadQuotes(watchlistStocks)
      loadLogos(watchlistStocks)
      loadSparklines(watchlistStocks)
    }
  }, [watchlistStocks.length, isWatchlist])

  // Detail panel
  useEffect(() => {
    if (selected) loadDetail(selected, range)
  }, [selected, range, loadDetail])

  // Auto-refresh every 60s (pauses when tab is hidden)
  const { timeAgo, isRefreshing, refresh: doRefresh } = useAutoRefresh(async () => {
    // Invalidate cache so we get fresh data
    const syms = currentStockDefs.map(s => s.symbol)
    await refreshQuotes(syms)
    await loadQuotes()
    // Check price alerts after refresh
    if (checkAlerts && stocks.length > 0) {
      const priceMap = {}
      stocks.forEach(s => { if (s.price) priceMap[s.symbol] = s.price })
      checkAlerts(priceMap)
    }
  }, 60000)

  /* ── Watchlist CRUD ──────────────────────────────────────────── */
  const WATCHLIST_LS_KEY = 'stocks_watchlist'

  async function loadWatchlist() {
    setWatchlistLoading(true)
    try {
      if (supabaseReady && user) {
        const { data } = await supabase
          .from('watchlists')
          .select('*')
          .eq('user_id', user.id)
          .order('position')
        if (data) {
          setWatchlistStocks(data.map(d => ({ symbol: d.symbol, name: d.name, sector: d.sector ?? '' })))
          setWatchlistLoading(false)
          return
        }
      }
    } catch {}
    // Fallback to localStorage
    try {
      const stored = JSON.parse(localStorage.getItem(WATCHLIST_LS_KEY) ?? '[]')
      setWatchlistStocks(stored)
    } catch { setWatchlistStocks([]) }
    setWatchlistLoading(false)
  }

  async function loadPortfolioHoldings() {
    if (!supabaseReady || !user) return
    try {
      const { data } = await supabase
        .from('holdings')
        .select('symbol, name')
        .order('created_at', { ascending: true })
      if (data) setPortfolioHoldings(data)
    } catch {}
  }

  async function addToWatchlist(stockOrStocks) {
    const incoming = Array.isArray(stockOrStocks) ? stockOrStocks : [stockOrStocks]
    const existingSymbols = new Set(watchlistStocks.map(s => s.symbol))
    const toAdd = incoming
      .filter(s => !existingSymbols.has(s.symbol))
      .map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector ?? '' }))
    if (toAdd.length === 0) return
    const newList = [...watchlistStocks, ...toAdd]
    setWatchlistStocks(newList)
    localStorage.setItem(WATCHLIST_LS_KEY, JSON.stringify(newList))
    if (supabaseReady && user) {
      try {
        await supabase.from('watchlists').insert(
          toAdd.map((s, i) => ({
            user_id: user.id,
            symbol: s.symbol,
            name: s.name,
            sector: s.sector,
            position: watchlistStocks.length + i,
          }))
        )
      } catch {}
    }
  }

  async function removeFromWatchlist(symbol) {
    const newList = watchlistStocks.filter(s => s.symbol !== symbol)
    setWatchlistStocks(newList)
    setStocks(prev => prev.filter(s => s.symbol !== symbol))
    localStorage.setItem(WATCHLIST_LS_KEY, JSON.stringify(newList))
    if (supabaseReady && user) {
      try {
        await supabase.from('watchlists').delete().eq('user_id', user.id).eq('symbol', symbol)
      } catch {}
    }
    if (selected === symbol) setSelected(null)
  }

  /* ── Derived data ──────────────────────────────────────────────── */
  const loadedStocks = stocks.filter(s => !s.loading && !s.error && s.price != null)

  const sectors = useMemo(() => {
    const unique = [...new Set(currentStockDefs.map(s => s.sector).filter(Boolean))]
    return ['All', ...unique.sort()]
  }, [currentStockDefs])

  const sectorStats = useMemo(() => {
    const map = {}
    for (const s of loadedStocks) {
      if (!map[s.sector]) map[s.sector] = { sum: 0, count: 0, up: 0 }
      map[s.sector].sum += s.changePct ?? 0
      map[s.sector].count++
      if ((s.changePct ?? 0) >= 0) map[s.sector].up++
    }
    for (const k in map) map[k].avg = map[k].sum / map[k].count
    return map
  }, [loadedStocks])

  const upCount = loadedStocks.filter(s => (s.changePct ?? 0) >= 0).length
  const totalCount = loadedStocks.length

  const topGainers = useMemo(() =>
    [...loadedStocks].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 3),
    [loadedStocks]
  )
  const topLosers = useMemo(() =>
    [...loadedStocks].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 3),
    [loadedStocks]
  )

  const filteredStocks = sectorFilter === 'All' ? stocks : stocks.filter(s => s.sector === sectorFilter)

  // If selected stock isn't in current market, fetch it on the fly
  const [paletteStock, setPaletteStock] = useState(null)
  useEffect(() => {
    if (!selected) { setPaletteStock(null); return }
    const inGrid = stocks.find(s => s.symbol === selected)
    if (inGrid) { setPaletteStock(null); return }
    // Fetch quote for searched stock not in current market
    let cancelled = false
    fetchQuote(selected).then(data => {
      if (cancelled) return
      const change = data.price - data.prevClose
      const changePct = (change / data.prevClose) * 100
      setPaletteStock({ symbol: selected, name: paletteName || selected, ...data, change, changePct, loading: false, error: false })
      // Also fetch logo
      setLogos(prev => ({ ...prev, [selected]: fetchLogoUrl(selected) }))
    }).catch(() => {
      if (!cancelled) setPaletteStock({ symbol: selected, name: selected, price: 0, loading: false, error: true })
    })
    return () => { cancelled = true }
  }, [selected, stocks])

  const selectedStock = stocks.find(s => s.symbol === selected) || paletteStock

  const marketLabel = isWatchlist
    ? (username ? `${username}'s Watchlist` : 'My Watchlist')
    : `${MARKETS[activeMarket]?.name ?? activeMarket} Top ${currentStockDefs.length}`

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '20px 0', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Market Selector ─────────────────────────────────────── */}
      <div className="market-pills" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {MARKET_LIST.map(id => {
          const m = MARKETS[id]
          const active = activeMarket === id
          return (
            <button key={id} onClick={() => switchMarket(id)}
              style={{
                background: active ? 'var(--text)' : 'var(--bg-card)',
                border: active ? 'none' : '1px solid var(--border)',
                borderRadius: 20,
                color: active ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: active ? 500 : 400,
                padding: '6px 14px', cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)' } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            >
              <span>{m.flag}</span> {m.name}
            </button>
          )
        })}
        {/* Watchlist button */}
        <button
          onClick={() => {
            if (!user) { onRequestAuth?.(); return }
            switchMarket('WATCHLIST')
          }}
          style={{
            background: isWatchlist ? 'var(--text)' : 'var(--bg-card)',
            border: isWatchlist ? 'none' : '1px solid var(--border)',
            borderRadius: 20,
            color: isWatchlist ? '#FFFFFF' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: isWatchlist ? 500 : 400,
            padding: '6px 14px', cursor: 'pointer',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          onMouseEnter={e => { if (!isWatchlist) { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)' } }}
          onMouseLeave={e => { if (!isWatchlist) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
        >
          {'\u2605'} {username ? `${username}'s Watchlist` : 'Watchlist'}
        </button>
      </div>

      {/* ── Market Pulse ─────────────────────────────────────────── */}
      <div className="fade-in" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="#0A7C5C" strokeWidth="3"
                strokeDasharray={`${(upCount / Math.max(totalCount, 1)) * 94.2} 94.2`}
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
              <text x="18" y="20" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text)">
                {upCount}
              </text>
            </svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                {upCount} of {totalCount} <span style={{ color: '#0A7C5C' }}>up</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{marketLabel} today</div>
            </div>
          </div>

          {/* Sector pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(sectorStats).sort((a, b) => b[1].avg - a[1].avg).map(([sector, stat]) => {
              const isUp = stat.avg >= 0
              return (
                <div key={sector}
                  onClick={() => setSectorFilter(sectorFilter === sector ? 'All' : sector)}
                  style={{
                    fontSize: 11, fontWeight: 500,
                    padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                    background: sectorFilter === sector ? (isUp ? '#0A7C5C' : '#C0392B') : (isUp ? 'rgba(10,124,92,0.08)' : 'rgba(192,57,43,0.08)'),
                    color: sectorFilter === sector ? '#FFF' : (isUp ? '#0A7C5C' : '#C0392B'),
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sector} {isUp ? '+' : ''}{stat.avg.toFixed(1)}%
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {timeAgo && (
            <span className="refresh-indicator">
              <span className="dot" />
              Updated {timeAgo}
            </span>
          )}
          {isWatchlist && (
            <button
              onClick={() => { loadPortfolioHoldings(); setShowSearch(true) }}
              style={{
                background: '#0A7C5C', border: 'none', borderRadius: 6,
                color: '#FFFFFF', fontSize: 12, fontWeight: 500,
                padding: '6px 14px', cursor: 'pointer',
                transition: 'opacity 0.15s',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              + Add Stock
            </button>
          )}
          <button
            className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={() => doRefresh()}
            title="Refresh prices"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── Top Movers ───────────────────────────────────────────── */}
      {loadedStocks.length > 0 && !isWatchlist && (
        <div className="fade-in" style={{ marginBottom: 24 }}>
          <div className="movers-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: '#0A7C5C', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2L10 8H2L6 2Z" fill="#0A7C5C" /></svg>
                Top Gainers
              </div>
              <div className="mover-cards" style={{ display: 'flex', gap: 10 }}>
                {topGainers.map(s => (
                  <MoverCard key={s.symbol} stock={s} logoUrl={logos[s.symbol]}
                    sparkData={sparklines[s.symbol]} sym={sym} convert={convert} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: 'rotate(180deg)' }}><path d="M6 2L10 8H2L6 2Z" fill="#C0392B" /></svg>
                Top Losers
              </div>
              <div className="mover-cards" style={{ display: 'flex', gap: 10 }}>
                {topLosers.map(s => (
                  <MoverCard key={s.symbol} stock={s} logoUrl={logos[s.symbol]}
                    sparkData={sparklines[s.symbol]} sym={sym} convert={convert} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sector Filter Tabs ───────────────────────────────────── */}
      <div className="sector-pills" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {sectors.map(s => (
          <button key={s} onClick={() => setSectorFilter(s)}
            style={{
              background: sectorFilter === s ? 'var(--text)' : 'transparent',
              border: sectorFilter === s ? 'none' : '1px solid var(--border)',
              borderRadius: 20,
              color: sectorFilter === s ? '#FFFFFF' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: sectorFilter === s ? 500 : 400,
              padding: '5px 14px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (sectorFilter !== s) { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)' } }}
            onMouseLeave={e => { if (sectorFilter !== s) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Watchlist empty state ─────────────────────────────────── */}
      {isWatchlist && watchlistStocks.length === 0 && !watchlistLoading && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: 'var(--text-muted)', fontSize: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>{'\u2605'}</div>
          <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Your watchlist is empty</div>
          <div style={{ marginBottom: 20 }}>Search for stocks to add and track them here.</div>
          <button
            onClick={() => { loadPortfolioHoldings(); setShowSearch(true) }}
            style={{
              background: 'var(--text)', border: 'none', borderRadius: 8,
              color: '#FFFFFF', fontSize: 13, fontWeight: 500,
              padding: '10px 24px', cursor: 'pointer',
            }}
          >
            + Add Your First Stock
          </button>
        </div>
      )}

      {/* ── Compare Controls ─────────────────────────────────────── */}
      {filteredStocks.length > 0 && !isWatchlist && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compareMode ? 8 : 0 }}>
          <button
            onClick={() => {
              if (compareMode) { setCompareMode(false); setCompareSymbols([]) }
              else { setCompareMode(true); setSelected(null) }
            }}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: compareMode ? '1px solid #0A7C5C' : '1px solid var(--border)',
              background: compareMode ? 'rgba(10,124,92,0.08)' : 'transparent',
              color: compareMode ? '#0A7C5C' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {compareMode ? '✕ Cancel Compare' : '⚖ Compare'}
          </button>
          {compareMode && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {compareSymbols.length}/3 selected
              </span>
              {compareSymbols.length >= 2 && (
                <button
                  onClick={() => { setShowCompare(true); setCompareMode(false) }}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: 'none', background: '#0A7C5C', color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Compare {compareSymbols.length} Stocks →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Compare Panel ──────────────────────────────────────────── */}
      {showCompare && compareSymbols.length >= 2 && (
        <ComparePanel
          symbols={compareSymbols}
          onClose={() => { setShowCompare(false); setCompareSymbols([]) }}
        />
      )}

      {/* ── Main Content: Grid + Detail ──────────────────────────── */}
      {filteredStocks.length > 0 && (
        <div className={selected ? 'stock-grid-with-detail' : ''} style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 480px' : '1fr', gap: 24, transition: 'grid-template-columns 0.3s ease' }}>

          <div className="stock-grid" style={{
            display: 'grid',
            gridTemplateColumns: selected ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
            alignContent: 'start',
          }}>
            {filteredStocks.map((stock) => (
              <StockGridCard
                key={stock.symbol}
                stock={stock}
                logoUrl={logos[stock.symbol]}
                sparkData={sparklines[stock.symbol]}
                selected={compareMode ? compareSymbols.includes(stock.symbol) : selected === stock.symbol}
                onClick={() => {
                  if (compareMode) {
                    setCompareSymbols(prev => {
                      if (prev.includes(stock.symbol)) return prev.filter(s => s !== stock.symbol)
                      if (prev.length >= 3) return prev
                      return [...prev, stock.symbol]
                    })
                  } else {
                    setSelected(selected === stock.symbol ? null : stock.symbol)
                  }
                }}
                sym={sym}
                convert={convert}
                onRemove={isWatchlist ? removeFromWatchlist : undefined}
              />
            ))}
          </div>

          {selected && selectedStock && (
            <div className="detail-panel-wrapper" style={{ position: 'sticky', top: 0, alignSelf: 'start', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <DetailPanel
                stock={selectedStock}
                logoUrl={logos[selected]}
                history={history}
                historyLoading={historyLoading}
                metrics={metrics}
                metricsLoading={metricsLoading}
                news={news}
                newsLoading={newsLoading}
                range={range}
                setRange={setRange}
                convert={convert}
                sym={sym}
                onClose={() => setSelected(null)}
                onCreateAlert={onCreateAlert}
                user={user}
                onRequestAuth={onRequestAuth}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Palette-selected stock detail (not in current grid) ── */}
      {selected && paletteStock && !stocks.find(s => s.symbol === selected) && (
        <div style={{ maxWidth: 560, margin: '0 auto 24px' }}>
          <DetailPanel
            stock={paletteStock}
            logoUrl={logos[selected]}
            history={history}
            historyLoading={historyLoading}
            metrics={metrics}
            metricsLoading={metricsLoading}
            news={news}
            newsLoading={newsLoading}
            range={range}
            setRange={setRange}
            convert={convert}
            sym={sym}
            onClose={() => { setSelected(null); setPaletteStock(null) }}
            onCreateAlert={onCreateAlert}
            user={user}
            onRequestAuth={onRequestAuth}
          />
        </div>
      )}

      {/* ── Search Modal ─────────────────────────────────────────── */}
      {showSearch && (
        <StockSearchModal
          onAdd={addToWatchlist}
          onClose={() => setShowSearch(false)}
          portfolioHoldings={portfolioHoldings}
          watchlistSymbols={watchlistStocks.map(s => s.symbol)}
        />
      )}
    </div>
  )
}
