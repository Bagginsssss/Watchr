import { useState, useEffect, useRef, useCallback } from 'react'
import { searchSymbol, fetchQuote, fetchHistory, fetchMetrics, fetchLogoUrl } from '../api/yahoo.js'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import ChartDragOverlay from './ChartDragOverlay.jsx'
import { CRYPTO_LIST } from '../data/crypto.js'
import { useCurrency } from '../context/CurrencyContext.jsx'

const RANGE_OPTIONS = [
  { label: '1D', range: '1d',  interval: '5m'  },
  { label: '1W', range: '5d',  interval: '15m' },
  { label: '1M', range: '1mo', interval: '1d'  },
  { label: '3M', range: '3mo', interval: '1d'  },
  { label: '1Y', range: '1y',  interval: '1wk' },
]

function LogoSmall({ symbol }) {
  const [failed, setFailed] = useState(false)
  const url = fetchLogoUrl(symbol)
  const letter = (symbol?.[0] ?? '?').toUpperCase()
  if (!failed) {
    return (
      <img src={url} alt="" onError={() => setFailed(true)}
        style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain', background: 'var(--bg-muted)' }} />
    )
  }
  return (
    <div style={{
      width: 24, height: 24, borderRadius: 4, background: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, color: '#fff',
    }}>{letter}</div>
  )
}

function MiniTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '4px 8px', fontSize: 11,
    }}>
      <div style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>${payload[0]?.value?.toFixed(2)}</div>
    </div>
  )
}

function fmtNum(val) {
  if (val == null) return '—'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`
  if (val >= 1e6)  return `$${(val / 1e6).toFixed(0)}M`
  return `$${val.toFixed(2)}`
}

/** Stock detail preview inside the command palette */
function StockPreview({ symbol, name, onResearch }) {
  const { convert, sym: currSym } = useCurrency()
  const [quote, setQuote] = useState(null)
  const [chart, setChart] = useState([])
  const [metrics, setMetricsData] = useState(null)
  const [range, setRange] = useState(RANGE_OPTIONS[2]) // 1M default
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchQuote(symbol).catch(() => null),
      fetchHistory(symbol, range.range, range.interval).catch(() => []),
      fetchMetrics(symbol).catch(() => null),
    ]).then(([q, h, m]) => {
      if (cancelled) return
      setQuote(q)
      setChart(h)
      setMetricsData(m)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [symbol, range])

  const change = quote ? quote.price - quote.prevClose : null
  const changePct = change != null && quote?.prevClose ? (change / quote.prevClose) * 100 : null
  const isUp = (changePct ?? 0) >= 0
  const lineColor = isUp ? '#0A7C5C' : '#C0392B'

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <img src={fetchLogoUrl(symbol)} alt="" onError={e => e.target.style.display = 'none'}
          style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain', background: 'var(--bg-muted)', border: '1px solid var(--border)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{name || symbol}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {symbol} {quote?.exchange ? `· ${quote.exchange}` : ''}
          </div>
        </div>
        {loading ? (
          <div className="skeleton" style={{ width: 80, height: 28, borderRadius: 4 }} />
        ) : quote && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'Georgia, serif', letterSpacing: '-0.5px' }}>
              ${quote.price?.toFixed(2)}
            </div>
            {changePct != null && (
              <div style={{ fontSize: 12, fontWeight: 600, color: lineColor }}>
                {isUp ? '+' : ''}{change?.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Range selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {RANGE_OPTIONS.map(r => (
          <button key={r.label} onClick={() => setRange(r)}
            style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer',
              background: range.label === r.label ? 'var(--text)' : 'var(--bg-muted)',
              color: range.label === r.label ? 'var(--bg)' : 'var(--text-secondary)',
            }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="skeleton" style={{ width: '100%', height: 140, borderRadius: 8 }} />
      ) : chart.length > 1 ? (
        <ChartDragOverlay data={chart} dataKey="close" height={140}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chart}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
                interval={Math.max(1, Math.floor(chart.length / 5))} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip content={<MiniTooltip />} />
              <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartDragOverlay>
      ) : (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          No chart data
        </div>
      )}

      {/* Key stats */}
      {metrics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px', marginTop: 12 }}>
          {[
            { l: 'Mkt Cap', v: fmtNum(metrics.marketCap) },
            { l: 'P/E', v: metrics.trailingPE?.toFixed(1) ?? '—' },
            { l: 'Beta', v: metrics.beta?.toFixed(2) ?? '—' },
            { l: '52W High', v: metrics.high52w ? `$${metrics.high52w.toFixed(2)}` : '—' },
            { l: '52W Low', v: metrics.low52w ? `$${metrics.low52w.toFixed(2)}` : '—' },
            { l: 'Div Yield', v: metrics.dividendYield ? `${(metrics.dividendYield * 100).toFixed(1)}%` : '—' },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.l}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'Georgia, serif' }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {onResearch && (
          <button
            onClick={() => onResearch(symbol, name)}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, fontSize: 13,
              fontWeight: 600, border: 'none', cursor: 'pointer',
              background: '#0A7C5C', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            🤖 Deep Research
          </button>
        )}
      </div>

      {quote?.marketState && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          Market: <span style={{ color: quote.marketState === 'REGULAR' ? '#0A7C5C' : 'var(--text-muted)' }}>
            {quote.marketState === 'REGULAR' ? 'Open' : 'Closed'}
          </span>
          {quote.currency && ` · ${quote.currency}`}
        </div>
      )}
    </div>
  )
}

/**
 * Cmd+K command palette with inline stock preview.
 */
export default function CommandPalette({ open, onClose, onResearch }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const [previewStock, setPreviewStock] = useState(null) // { symbol, name }
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Reset when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelected(0)
      setPreviewStock(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Search on query change
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)

      const q = query.toLowerCase()
      const cryptoMatches = CRYPTO_LIST
        .filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
        .slice(0, 3)
        .map(c => ({ type: 'crypto', symbol: c.symbol.toUpperCase(), name: c.name, id: c.id }))

      let stockMatches = []
      try {
        const apiResults = await searchSymbol(query)
        stockMatches = apiResults.slice(0, 8).map(r => ({
          type: 'stock', symbol: r.symbol, name: r.name, exchange: r.exchange,
        }))
      } catch {}

      setResults([...cryptoMatches, ...stockMatches])
      setSelected(0)
      setLoading(false)
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault()
      const item = results[selected]
      setPreviewStock({ symbol: item.symbol, name: item.name })
    } else if (e.key === 'Escape') {
      if (previewStock) setPreviewStock(null)
      else onClose()
    }
  }, [results, selected, previewStock, onClose])

  if (!open) return null

  return (
    <>
      <div className="modal-overlay" onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      }} />

      <div className="command-palette modal-panel" style={{
        position: 'fixed', top: '12%', left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 520, zIndex: 9999,
        background: 'var(--bg-card)', borderRadius: 16,
        border: '1px solid var(--border)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
        overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Back button when previewing */}
        {previewStock && (
          <button onClick={() => setPreviewStock(null)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
            background: 'var(--bg-muted)', border: 'none', borderBottom: '1px solid var(--border)',
            cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', width: '100%',
            textAlign: 'left',
          }}>
            ← Back to search
          </button>
        )}

        {/* Search input */}
        {!previewStock && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 18, opacity: 0.5 }}>🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search stocks, crypto, ETFs..."
              style={{
                flex: 1, border: 'none', outline: 'none',
                background: 'transparent', color: 'var(--text)', fontSize: 16,
              }}
            />
            <kbd style={{
              padding: '2px 6px', borderRadius: 4, fontSize: 11,
              background: 'var(--bg-muted)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}>ESC</kbd>
          </div>
        )}

        {/* Stock preview */}
        {previewStock ? (
          <div style={{ overflowY: 'auto' }}>
            <StockPreview symbol={previewStock.symbol} name={previewStock.name} onResearch={onResearch} />
          </div>
        ) : (
          /* Results list */
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                Searching...
              </div>
            )}

            {!loading && query && results.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                No results for &ldquo;{query}&rdquo;
              </div>
            )}

            {!loading && !query && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                Type to search any stock, ETF, or cryptocurrency
              </div>
            )}

            {results.map((item, i) => (
              <div
                key={`${item.type}-${item.symbol}`}
                data-search-result={item.symbol}
                onClick={(e) => { e.stopPropagation(); setPreviewStock({ symbol: item.symbol, name: item.name }) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 18px', cursor: 'pointer',
                  background: i === selected ? 'var(--bg-muted)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={() => setSelected(i)}
              >
                {item.type === 'crypto'
                  ? <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>🪙</span>
                  : <LogoSmall symbol={item.symbol} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                    {item.symbol}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {item.name}
                    </span>
                  </div>
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: item.type === 'crypto' ? '#F59E0B22' : '#3B82F622',
                  color: item.type === 'crypto' ? '#F59E0B' : '#3B82F6',
                  fontWeight: 600, textTransform: 'uppercase',
                }}>
                  {item.type === 'crypto' ? 'Crypto' : item.exchange || 'Stock'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
