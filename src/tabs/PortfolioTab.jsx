import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, ReferenceLine, AreaChart, Area } from 'recharts'
import { supabase, supabaseReady } from '../lib/supabase.js'
import { fetchQuote, searchSymbol, fetchHistory, fetchMetrics, fetchLogoUrl } from '../api/yahoo.js'
import { useCurrency } from '../context/CurrencyContext.jsx'
import ChartDragOverlay from '../components/ChartDragOverlay.jsx'
import ComparePanel from '../components/ComparePanel.jsx'
import PortfolioImportModal from '../components/PortfolioImportModal.jsx'
import { usePortfolioHistory } from '../hooks/usePortfolioHistory.js'
import BenchmarkChart from '../components/BenchmarkChart.jsx'
import BrokerageImport from '../components/BrokerageImport.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import SharedLogoAvatar from '../components/LogoAvatar.jsx'
import { apiUrl } from '../lib/apiBase.js'

const CHART_RANGES = [
  { label: '1D', range: '1d',  interval: '5m' },
  { label: '1W', range: '5d',  interval: '1d' },
  { label: '1M', range: '1mo', interval: '1d' },
  { label: '6M', range: '6mo', interval: '1d' },
  { label: '1Y', range: '1y',  interval: '1wk' },
  { label: '5Y', range: '5y',  interval: '1mo' },
]

function symbolCurrency(symbol) {
  return /\.(TO|NE|V|CN)$/i.test(symbol) ? 'CAD' : 'USD'
}

const PIE_COLORS = [
  '#0A7C5C', '#3A5A8A', '#D97706', '#EF4444', '#7A4040',
  '#2D6A4F', '#EA580C', '#6B4F8A', '#0891B2', '#BE185D',
  '#65A30D', '#8B6914', '#0284C7', '#B45309', '#5A3080',
]

// Use shared LogoAvatar component
const LogoAvatar = SharedLogoAvatar

function AddHoldingModal({ onClose, onSave, onSaveMultiple, existing, customGroups, customAssignments, onAssignGroup }) {
  const isEdit = !!existing
  const [query, setQuery] = useState(isEdit ? `${existing.symbol} — ${existing.name}` : '')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(isEdit ? { symbol: existing.symbol, name: existing.name } : null)
  const [selectedList, setSelectedList] = useState([])
  const [shares, setShares] = useState(existing?.shares ?? '')
  const [avgCost, setAvgCost] = useState(existing?.avg_cost ?? '')
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)

  function handleQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    if (isEdit) setSelected(null)
    setShowDropdown(true)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await searchSymbol(val)
        setResults(res)
      } catch { setResults([]) }
      setSearching(false)
    }, 350)
  }

  function handleSelect(item) {
    if (isEdit) {
      setSelected(item)
      setQuery(`${item.symbol} — ${item.name}`)
      setResults([])
      setShowDropdown(false)
    } else {
      if (!selectedList.find(s => s.symbol === item.symbol)) {
        setSelectedList(prev => [...prev, { symbol: item.symbol, name: item.name }])
      }
      setQuery('')
      setResults([])
      setShowDropdown(false)
    }
  }

  function removeFromList(symbol) {
    setSelectedList(prev => prev.filter(s => s.symbol !== symbol))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (isEdit) {
      if (!selected) return
      onSave({
        symbol: selected.symbol,
        name: selected.name,
        shares: shares !== '' ? parseFloat(shares) : 0,
        avg_cost: avgCost !== '' ? parseFloat(avgCost) : 0,
      })
    } else {
      if (selectedList.length === 0) return
      onSaveMultiple(selectedList.map(s => ({
        symbol: s.symbol,
        name: s.name,
        shares: 0,
        avg_cost: 0,
      })))
    }
  }

  const inputStyle = {
    background: 'var(--bg-muted)',
    border: '2px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 14,
    padding: '12px 16px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    height: 48,
    transition: 'border-color 0.2s, box-shadow 0.2s',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 32, width: 440, maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>
          {isEdit ? 'Edit Holding' : 'Add Holdings'}
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              {isEdit ? 'Stock' : 'Search stocks — TSX, NYSE, NASDAQ & more'}
            </label>
            <input
              autoFocus
              placeholder="Company name or ticker..."
              value={query}
              onChange={handleQueryChange}
              onFocus={() => results.length > 0 && setShowDropdown(true)}
              style={{ ...inputStyle, paddingRight: searching ? 36 : 16 }}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            {searching && (
              <div style={{ position: 'absolute', right: 14, top: 40, fontSize: 12, color: 'var(--text-muted)' }}>...</div>
            )}
            {showDropdown && results.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto', marginTop: 4,
              }}>
                {results.map(r => {
                  const alreadyAdded = selectedList.find(s => s.symbol === r.symbol)
                  return (
                    <div key={r.symbol}
                      onClick={() => !alreadyAdded && handleSelect(r)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px', cursor: alreadyAdded ? 'default' : 'pointer',
                        borderBottom: '1px solid var(--bg-hover)',
                        transition: 'background 0.1s',
                        opacity: alreadyAdded ? 0.4 : 1,
                      }}
                      onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = 'var(--bg-muted)' }}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.symbol}</span>
                          <span style={{
                            fontSize: 10, color: 'var(--text-secondary)',
                            background: 'var(--bg-hover)', borderRadius: 4, padding: '1px 5px',
                          }}>{r.type}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{r.name}</div>
                      </div>
                      <div style={{ fontSize: 11, color: alreadyAdded ? '#0A7C5C' : 'var(--text-muted)' }}>
                        {alreadyAdded ? 'Added' : r.exchange}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {!isEdit && selectedList.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {selectedList.map(s => (
                <div key={s.symbol} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(10,124,92,0.06)', border: '1px solid rgba(10,124,92,0.2)', borderRadius: 8, padding: '6px 10px',
                  fontSize: 13, color: '#0A7C5C',
                }}>
                  <LogoAvatar symbol={s.symbol} name={s.name} size={20} />
                  <span style={{ fontWeight: 600 }}>{s.symbol.replace('.TO','').replace('.NE','')}</span>
                  <span
                    onClick={() => removeFromList(s.symbol)}
                    style={{ cursor: 'pointer', color: '#8BC5B0', fontSize: 16, lineHeight: 1, marginLeft: 2 }}
                  >
                    &times;
                  </span>
                </div>
              ))}
            </div>
          )}

          {isEdit && (
            <>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Shares Owned&nbsp;<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>optional</span>
                </label>
                <input type="number" placeholder="e.g. 50" value={shares} min="0" step="any"
                  onChange={e => setShares(e.target.value)} style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#0A7C5C'; e.target.style.boxShadow = '0 0 0 3px rgba(10,124,92,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Average Cost (per share)&nbsp;<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>optional</span>
                </label>
                <input type="number" placeholder="e.g. 145.50" value={avgCost} min="0" step="any"
                  onChange={e => setAvgCost(e.target.value)} style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#0A7C5C'; e.target.style.boxShadow = '0 0 0 3px rgba(10,124,92,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
              {customGroups && customGroups.length > 0 && (
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Custom Group&nbsp;<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>optional</span>
                  </label>
                  <select
                    value={customAssignments?.[existing?.symbol] || ''}
                    onChange={e => onAssignGroup?.(existing?.symbol, e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">No group</option>
                    {customGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{
                flex: 1, background: 'var(--bg-muted)', border: '2px solid var(--border)',
                borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, height: 48, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-muted)'}
            >
              Cancel
            </button>
            <button type="submit" disabled={isEdit ? !selected : selectedList.length === 0}
              style={{
                flex: 1,
                background: (isEdit ? selected : selectedList.length > 0) ? '#0A7C5C' : 'var(--border)',
                border: 'none', borderRadius: 8,
                color: (isEdit ? selected : selectedList.length > 0) ? '#FFFFFF' : 'var(--text-muted)',
                fontSize: 14, fontWeight: 600, height: 48,
                cursor: (isEdit ? selected : selectedList.length > 0) ? 'pointer' : 'default',
                transition: 'all 0.15s',
                boxShadow: (isEdit ? selected : selectedList.length > 0) ? '0 4px 12px rgba(10,124,92,0.3)' : 'none',
              }}
              onMouseEnter={e => { if (isEdit ? selected : selectedList.length > 0) e.currentTarget.style.background = '#08664B' }}
              onMouseLeave={e => { if (isEdit ? selected : selectedList.length > 0) e.currentTarget.style.background = '#0A7C5C' }}
            >
              {isEdit ? 'Save Changes' : `Add ${selectedList.length || ''} Holding${selectedList.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CustomPieTooltip({ active, payload, sym }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{d.name}</div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{sym}{d.value?.toFixed(2)}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{d.payload.pct?.toFixed(1)}% of portfolio</div>
    </div>
  )
}

function PortfolioChartTooltip({ active, payload, label, sym }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{sym}{payload[0].value?.toFixed(2)}</div>
    </div>
  )
}

function PortfolioChart({ holdings, convert, sym, customGroups, customAssignments }) {
  const [chartSymbol, setChartSymbol] = useState('__all__')
  const [chartRange, setChartRange] = useState(() => {
    const saved = localStorage.getItem('portfolio_chart_range')
    return CHART_RANGES.find(r => r.label === saved) || CHART_RANGES[2]
  })
  const [chartData, setChartData] = useState([])
  const [chartLoading, setChartLoading] = useState(false)

  const isGroup = chartSymbol.startsWith('__group__')
  const groupName = isGroup ? chartSymbol.replace('__group__', '') : null
  const chartHoldings = isGroup
    ? holdings.filter(h => customAssignments[h.symbol] === groupName)
    : chartSymbol === '__all__'
    ? holdings
    : holdings.filter(h => h.symbol === chartSymbol)
  const isMulti = chartSymbol === '__all__' || isGroup

  useEffect(() => {
    if (!chartHoldings.length) { setChartData([]); return }
    let cancelled = false
    setChartLoading(true)
    setChartData([])

    if (isMulti) {
      Promise.all(
        chartHoldings.map(async h => {
          try {
            const data = await fetchHistory(h.symbol, chartRange.range, chartRange.interval)
            const native = /\.(TO|NE|V|CN)$/i.test(h.symbol) ? 'CAD' : 'USD'
            return { symbol: h.symbol, shares: h.shares, data, native }
          } catch { return { symbol: h.symbol, shares: h.shares, data: [], native: 'USD' } }
        })
      ).then(results => {
        if (cancelled) return
        const template = results.reduce((best, r) => r.data.length > best.data.length ? r : best, { data: [] })
        if (!template.data.length) { setChartData([]); setChartLoading(false); return }

        const combined = template.data.map((point, i) => {
          let total = 0
          for (const r of results) {
            const dp = r.data[i] ?? r.data[r.data.length - 1]
            if (dp?.close != null) total += convert(dp.close * r.shares, r.native)
          }
          return { date: point.date, close: parseFloat(total.toFixed(2)) }
        })
        setChartData(combined)
        setChartLoading(false)
      })
    } else {
      fetchHistory(chartSymbol, chartRange.range, chartRange.interval)
        .then(data => {
          if (cancelled) return
          const native = /\.(TO|NE|V|CN)$/i.test(chartSymbol) ? 'CAD' : 'USD'
          setChartData(data.map(d => ({ ...d, close: d.close != null ? convert(d.close, native) : null })))
        })
        .catch(() => { if (!cancelled) setChartData([]) })
        .finally(() => { if (!cancelled) setChartLoading(false) })
    }

    return () => { cancelled = true }
  }, [chartSymbol, chartRange, holdings, convert])

  const firstClose = chartData[0]?.close
  const lastClose = chartData[chartData.length - 1]?.close
  const change = (firstClose && lastClose) ? lastClose - firstClose : null
  const changePct = (change != null && firstClose > 0) ? (change / firstClose) * 100 : null
  const isUp = (change ?? 0) >= 0
  const lineColor = isUp ? '#0A7C5C' : '#EF4444'
  const gradientId = 'portfolioGrad'

  return (
    <div className="fade-in" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '24px 28px', marginBottom: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <select value={chartSymbol} onChange={e => setChartSymbol(e.target.value)}
            style={{
              background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text)', fontSize: 13, fontWeight: 600, padding: '8px 14px',
              cursor: 'pointer', outline: 'none',
            }}>
            <option value="__all__">All Holdings</option>
            {customGroups && customGroups.length > 0 && (
              <optgroup label="Custom Groups">
                {customGroups.map(g => (
                  <option key={`__group__${g}`} value={`__group__${g}`}>{g}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Individual Stocks">
              {holdings.map(h => (
                <option key={h.symbol} value={h.symbol}>
                  {h.symbol.replace('.TO','').replace('.NE','').replace('-B',' B')} — {h.name}
                </option>
              ))}
            </optgroup>
          </select>
          {change != null && !chartLoading && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.5px' }}>
                {sym}{lastClose?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 600, color: lineColor,
                background: isUp ? 'rgba(10,124,92,0.08)' : 'rgba(192,57,43,0.08)',
                padding: '3px 8px', borderRadius: 6,
              }}>
                {isUp ? '+' : ''}{change?.toFixed(2)} ({isUp ? '+' : ''}{changePct?.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-hover)', borderRadius: 8, padding: 3 }}>
          {CHART_RANGES.map(r => (
            <button key={r.label}
              onClick={() => { setChartRange(r); localStorage.setItem('portfolio_chart_range', r.label) }}
              style={{
                background: chartRange.label === r.label ? 'var(--bg-card)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                color: chartRange.label === r.label ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: chartRange.label === r.label ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {chartLoading ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 8 }} />
        </div>
      ) : chartData.length === 0 ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No chart data available
        </div>
      ) : (
        <ChartDragOverlay data={chartData} dataKey="close" height={220}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 10000 ? `${(v/1000).toFixed(0)}k` : v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)} width={48} />
            <Tooltip content={<PortfolioChartTooltip sym={sym} />} />
            {firstClose && <ReferenceLine y={firstClose} stroke="var(--border)" strokeDasharray="3 3" />}
            <Area type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} fill={`url(#${gradientId})`}
              dot={false} activeDot={{ r: 4, fill: lineColor, strokeWidth: 2, stroke: '#FFFFFF' }} />
          </AreaChart>
        </ResponsiveContainer>
        </ChartDragOverlay>
      )}
    </div>
  )
}

const LOOKUP_RANGES = [
  { label: '1D', range: '1d', interval: '5m' },
  { label: '1W', range: '5d', interval: '1d' },
  { label: '1M', range: '1mo', interval: '1d' },
  { label: '3M', range: '3mo', interval: '1d' },
]

function fmtMktCap(v) {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toLocaleString()}`
}

export function StockLookup() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [symbol, setSymbol] = useState('')
  const [quote, setQuote] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [history, setHistory] = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [range, setRange] = useState(LOOKUP_RANGES[2])
  const [panelOpen, setPanelOpen] = useState(false)
  const debounceRef = useRef(null)

  function handleQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setResults([]); setShowDropdown(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchSymbol(val)
        setResults(res.slice(0, 8))
        setShowDropdown(true)
      } catch { setResults([]) }
    }, 300)
  }

  async function loadStock(sym) {
    setLoading(true)
    setSymbol(sym)
    setQuote(null)
    setMetrics(null)
    setHistory([])
    setQuery(sym)
    setShowDropdown(false)
    setResults([])
    setPanelOpen(true)
    try {
      const [q, m] = await Promise.all([
        fetchQuote(sym),
        fetchMetrics(sym).catch(() => null),
      ])
      setQuote(q)
      setMetrics(m)
    } catch {} finally { setLoading(false) }
    loadChart(sym, range)
  }

  async function loadChart(sym, r) {
    setHistLoading(true)
    try {
      const data = await fetchHistory(sym, r.range, r.interval)
      setHistory(data)
    } catch { setHistory([]) }
    setHistLoading(false)
  }

  function handleRangeChange(r) {
    setRange(r)
    if (symbol) loadChart(symbol, r)
  }

  function dismiss() {
    setPanelOpen(false)
    setSymbol('')
    setQuote(null)
    setMetrics(null)
    setHistory([])
    setQuery('')
    setResults([])
    setShowDropdown(false)
  }

  const price = quote?.price

  const firstClose = history[0]?.close
  const lastClose = history[history.length - 1]?.close
  const change = firstClose && lastClose ? lastClose - firstClose : null
  const changePct = change != null && firstClose > 0 ? (change / firstClose) * 100 : null
  const isUp = (change ?? 0) >= 0
  const lineColor = isUp ? '#0A7C5C' : '#EF4444'

  const stats = metrics ? [
    { label: 'Market Cap', val: fmtMktCap(metrics.marketCap) },
    { label: 'P/E (TTM)', val: metrics.trailingPE?.toFixed(1) ?? '—' },
    { label: '52W High', val: metrics.high52w != null ? `$${metrics.high52w.toFixed(2)}` : '—' },
    { label: '52W Low', val: metrics.low52w != null ? `$${metrics.low52w.toFixed(2)}` : '—' },
    { label: 'Volume', val: metrics.volume != null ? (metrics.volume >= 1e6 ? `${(metrics.volume / 1e6).toFixed(1)}M` : metrics.volume.toLocaleString()) : '—' },
    { label: 'Div Yield', val: metrics.dividendYield > 0 ? `${(metrics.dividendYield * 100).toFixed(2)}%` : 'None' },
  ] : []

  return (
    <>
      {/* Search input in nav bar */}
      <input
        placeholder="Look up a stock..."
        value={query}
        onChange={handleQueryChange}
        onFocus={() => { if (results.length) setShowDropdown(true) }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        onKeyDown={e => {
          if (e.key === 'Enter' && query.trim()) {
            const s = query.split('—')[0].trim().toUpperCase()
            if (s) loadStock(s)
          }
        }}
        style={{
          width: 200, height: 32, background: 'var(--bg-muted)', border: '1px solid var(--border)',
          borderRadius: 6, color: 'var(--text)', fontSize: 12,
          padding: '0 10px', outline: 'none', transition: 'border-color 0.15s, width 0.2s',
          boxSizing: 'border-box',
        }}
        onFocusCapture={e => e.target.style.borderColor = 'var(--text)'}
        onBlurCapture={e => e.target.style.borderColor = 'var(--border)'}
      />

      {/* Search results dropdown */}
      {showDropdown && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 1000,
          width: 340, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 320, overflowY: 'auto', marginTop: 6,
        }}>
          {results.map(r => (
            <div key={r.symbol}
              onMouseDown={() => loadStock(r.symbol)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--bg-hover)', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.symbol}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{r.name}</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.exchange}</div>
            </div>
          ))}
        </div>
      )}

      {/* Result panel dropdown */}
      {panelOpen && (symbol || loading) && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 1000,
          width: 480, maxWidth: '90vw', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 12px 36px rgba(0,0,0,0.14)', marginTop: 6, overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="skeleton" style={{ width: 180, height: 18, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 100, height: 24, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: '100%', height: 140, borderRadius: 4 }} />
            </div>
          ) : quote && (
            <>
              {/* Header */}
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <LogoAvatar symbol={symbol} name={quote.name ?? symbol} size={38} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{quote.name ?? symbol}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-hover)', borderRadius: 3, padding: '1px 6px' }}>{symbol}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.3px' }}>
                        ${price?.toFixed(2)}
                      </span>
                      {change != null && (
                        <span style={{
                          fontSize: 12, fontWeight: 500, color: isUp ? '#0A7C5C' : '#EF4444',
                          background: isUp ? 'rgba(10,124,92,0.08)' : 'rgba(192,57,43,0.08)',
                          padding: '2px 6px', borderRadius: 4,
                        }}>
                          {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct?.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={dismiss} style={{
                  background: 'var(--bg-hover)', border: 'none', borderRadius: 14,
                  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
                }}>{'\u2715'}</button>
              </div>

              {/* Chart */}
              <div style={{ padding: '0 20px 12px' }}>
                <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: 'var(--bg-hover)', borderRadius: 5, padding: 2, width: 'fit-content' }}>
                  {LOOKUP_RANGES.map(r => (
                    <button key={r.label} onClick={() => handleRangeChange(r)}
                      style={{
                        background: range.label === r.label ? 'var(--bg-card)' : 'transparent',
                        border: 'none', borderRadius: 3,
                        color: range.label === r.label ? 'var(--text)' : 'var(--text-muted)',
                        fontSize: 10, fontWeight: 600, padding: '3px 8px', cursor: 'pointer',
                        transition: 'all 0.15s',
                        boxShadow: range.label === r.label ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >{r.label}</button>
                  ))}
                </div>
                {histLoading ? (
                  <div className="skeleton" style={{ width: '100%', height: 140, borderRadius: 4 }} />
                ) : history.length > 0 ? (
                  <ChartDragOverlay data={history} dataKey="close" height={140}>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="lookupGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={lineColor} stopOpacity={0.12} />
                          <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={40}
                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)} />
                      {firstClose && <ReferenceLine y={firstClose} stroke="var(--border)" strokeDasharray="3 3" />}
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                        labelStyle={{ color: 'var(--text-muted)', fontSize: 9 }}
                        formatter={v => [`$${v?.toFixed(2)}`, 'Price']}
                      />
                      <Area type="monotone" dataKey="close" stroke={lineColor} strokeWidth={1.5}
                        fill="url(#lookupGrad)" dot={false}
                        activeDot={{ r: 3, fill: lineColor, strokeWidth: 1.5, stroke: '#FFFFFF' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                  </ChartDragOverlay>
                ) : (
                  <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                    No chart data
                  </div>
                )}
              </div>

              {/* Key stats */}
              {stats.length > 0 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0,
                  borderTop: '1px solid var(--border)',
                }}>
                  {stats.map(({ label, val }, i) => (
                    <div key={label} style={{
                      padding: '10px 8px', textAlign: 'center',
                      borderRight: i < stats.length - 1 ? '1px solid var(--bg-hover)' : 'none',
                    }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)' }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

export default function PortfolioTab({ user }) {
  const { convert, sym } = useCurrency()
  const { isDark } = useTheme()
  const [holdings, setHoldings] = useState([])
  const [prices, setPrices] = useState({})
  const [categories, setCategories] = useState({})
  const [loadingHoldings, setLoadingHoldings] = useState(true)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showBrokerageImport, setShowBrokerageImport] = useState(false)
  const [showBenchmark, setShowBenchmark] = useState(false)
  const [showImportMenu, setShowImportMenu] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null)
  // Compare mode
  const [compareMode, setCompareMode] = useState(false)
  const [compareSymbols, setCompareSymbols] = useState([])
  const [showCompare, setShowCompare] = useState(false)

  const [groupBy, setGroupBy] = useState(() => localStorage.getItem('portfolio_groupBy') || 'none')
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('portfolio_sortBy') || 'default')
  const [collapsedGroups, setCollapsedGroups] = useState({})

  function handleSetGroupBy(val) { setGroupBy(val); localStorage.setItem('portfolio_groupBy', val); setCollapsedGroups({}) }
  function handleSetSortBy(val) { setSortBy(val); localStorage.setItem('portfolio_sortBy', val) }
  function toggleGroupCollapse(groupName) {
    setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))
  }
  const [customGroups, setCustomGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('portfolio_custom_groups') || '[]') } catch { return [] }
  })
  const [customAssignments, setCustomAssignments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('portfolio_custom_assignments') || '{}') } catch { return {} }
  })
  const [newGroupName, setNewGroupName] = useState('')
  const [showGroupManager, setShowGroupManager] = useState(false)

  // Portfolio history — auto-snapshot daily
  const { takeSnapshot } = usePortfolioHistory(user)

  function saveCustomGroups(groups) {
    setCustomGroups(groups)
    localStorage.setItem('portfolio_custom_groups', JSON.stringify(groups))
  }
  function saveCustomAssignments(assignments) {
    setCustomAssignments(assignments)
    localStorage.setItem('portfolio_custom_assignments', JSON.stringify(assignments))
  }
  function addCustomGroup(name) {
    if (!name.trim() || customGroups.includes(name.trim())) return
    saveCustomGroups([...customGroups, name.trim()])
    setNewGroupName('')
  }
  function removeCustomGroup(name) {
    saveCustomGroups(customGroups.filter(g => g !== name))
    const updated = { ...customAssignments }
    for (const key of Object.keys(updated)) {
      if (updated[key] === name) delete updated[key]
    }
    saveCustomAssignments(updated)
  }
  function assignToGroup(symbol, group) {
    const updated = { ...customAssignments }
    if (group) updated[symbol] = group
    else delete updated[symbol]
    saveCustomAssignments(updated)
  }

  const fetchHoldings = useCallback(async () => {
    setLoadingHoldings(true)
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: true })
    if (!error) setHoldings(data ?? [])
    setLoadingHoldings(false)
  }, [user])

  const fetchPrices = useCallback(async (holdingsList) => {
    if (!holdingsList.length) return
    setLoadingPrices(true)
    const results = await Promise.all(
      holdingsList.map(async h => {
        try {
          const data = await fetchQuote(h.symbol)
          return [h.symbol, data.price]
        } catch {
          return [h.symbol, null]
        }
      })
    )
    setPrices(Object.fromEntries(results))
    setLoadingPrices(false)
  }, [])

  const fetchCategories = useCallback(async (holdingsList) => {
    if (!holdingsList.length) return
    const results = await Promise.all(
      holdingsList.map(async h => {
        try {
          const res = await fetch(apiUrl(`/finance/v10/finance/quoteSummary/${h.symbol}?modules=quoteType,assetProfile,fundProfile`))
          const json = await res.json()
          const r = json.quoteSummary?.result?.[0]
          const qt = r?.quoteType?.quoteType
          const sector = r?.assetProfile?.sector
          const fundCat = r?.fundProfile?.categoryName
          let cat = 'Stock'
          if (qt === 'ETF' || qt === 'MUTUALFUND') {
            cat = fundCat ? `ETF · ${fundCat}` : 'ETF'
          } else if (sector) {
            cat = sector
          }
          return [h.symbol, cat]
        } catch {
          return [h.symbol, 'Other']
        }
      })
    )
    setCategories(Object.fromEntries(results))
  }, [])

  useEffect(() => { if (user) fetchHoldings() }, [user, fetchHoldings])
  useEffect(() => {
    if (holdings.length) {
      fetchPrices(holdings)
      fetchCategories(holdings)
    }
  }, [holdings, fetchPrices, fetchCategories])

  async function handleSave(data) {
    if (editingHolding) {
      const { error } = await supabase.from('holdings').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editingHolding.id).eq('user_id', user.id)
      if (error) console.error('[Portfolio] Failed to update holding:', error.message)
    } else {
      const { error } = await supabase.from('holdings').insert({ ...data, user_id: user.id })
      if (error) console.error('[Portfolio] Failed to insert holding:', error.message)
    }
    setShowAddModal(false)
    setEditingHolding(null)
    fetchHoldings()
  }

  async function handleSaveMultiple(items) {
    const inserts = items.map(d => ({ ...d, user_id: user.id }))
    await supabase.from('holdings').insert(inserts)
    setShowAddModal(false)
    setEditingHolding(null)
    fetchHoldings()
  }

  async function handleDelete(id) {
    if (!confirm('Remove this holding?')) return
    const { error } = await supabase.from('holdings').delete().eq('id', id).eq('user_id', user.id)
    if (error) console.error('[Portfolio] Failed to delete holding:', error.message)
    fetchHoldings()
  }

  const rows = holdings.map(h => {
    const price = prices[h.symbol]
    const native = symbolCurrency(h.symbol)
    const hasCost = h.avg_cost > 0
    const bookValue = hasCost ? h.shares * h.avg_cost : null
    const marketValue = price != null ? h.shares * price : null
    const gain = (marketValue != null && hasCost) ? marketValue - bookValue : null
    const gainPct = (gain != null && bookValue > 0) ? (gain / bookValue) * 100 : null
    const dispPrice     = price != null ? convert(price, native) : null
    const dispBookValue = bookValue != null ? convert(bookValue, native) : null
    const dispMarketValue = marketValue != null ? convert(marketValue, native) : null
    const dispGain      = gain != null ? convert(gain, native) : null
    return { ...h, price, bookValue, marketValue, gain, gainPct, hasCost, native,
             dispPrice, dispBookValue, dispMarketValue, dispGain }
  })

  function exportCSV() {
    const header = ['Symbol','Name','Shares','Avg Cost','Current Price','Book Value','Market Value','Gain/Loss','Return %']
    const csvRows = rows.map(r => [
      r.symbol,
      r.name ?? r.symbol,
      r.shares,
      r.avg_cost?.toFixed(2) ?? '',
      r.dispPrice?.toFixed(2) ?? '',
      r.dispBookValue?.toFixed(2) ?? '',
      r.dispMarketValue?.toFixed(2) ?? '',
      r.dispGain?.toFixed(2) ?? '',
      r.gainPct?.toFixed(2) ?? '',
    ])
    const csv = [header, ...csvRows].map(row => row.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `watchr-portfolio-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalBook   = rows.filter(r => r.dispBookValue != null).reduce((s, r) => s + r.dispBookValue, 0)
  const totalMarket = rows.filter(r => r.dispMarketValue != null).reduce((s, r) => s + r.dispMarketValue, 0)
  const totalGain   = totalBook > 0 ? totalMarket - totalBook : null
  const totalGainPct = (totalGain != null && totalBook > 0) ? (totalGain / totalBook) * 100 : null

  // Auto-snapshot portfolio value daily
  useEffect(() => {
    if (totalMarket > 0 && totalBook > 0 && !loadingPrices) {
      takeSnapshot(totalMarket, totalBook)
    }
  }, [totalMarket, totalBook, loadingPrices, takeSnapshot])
  const isUp = (totalGain ?? 0) >= 0

  const pieData = rows
    .filter(r => r.dispMarketValue != null && r.dispMarketValue > 0)
    .map((r, i) => ({
      symbol: r.symbol,
      name: r.symbol.replace('.TO','').replace('.NE','').replace('.V','').replace('-B',''),
      value: parseFloat(r.dispMarketValue.toFixed(2)),
      pct: totalMarket > 0 ? (r.dispMarketValue / totalMarket) * 100 : 0,
      category: categories[r.symbol] ?? '—',
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))
    .sort((a, b) => a.pct - b.pct)

  const pieGroups = pieData.reduce((acc, d) => {
    const cat = d.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(d)
    return acc
  }, {})

  const sortedRows = [...rows].sort((a, b) => {
    if (sortBy === 'market') return (b.dispMarketValue ?? 0) - (a.dispMarketValue ?? 0)
    if (sortBy === 'gain') return (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity)
    if (sortBy === 'name') return a.symbol.localeCompare(b.symbol)
    return 0
  })

  const groupedRows = groupBy === 'category'
    ? Object.entries(
        sortedRows.reduce((acc, r) => {
          const cat = categories[r.symbol] ?? 'Other'
          if (!acc[cat]) acc[cat] = []
          acc[cat].push(r)
          return acc
        }, {})
      ).sort(([a], [b]) => a.localeCompare(b))
    : groupBy === 'custom'
    ? (() => {
        const grouped = {}
        const ungrouped = []
        for (const r of sortedRows) {
          const g = customAssignments[r.symbol]
          if (g && customGroups.includes(g)) {
            if (!grouped[g]) grouped[g] = []
            grouped[g].push(r)
          } else {
            ungrouped.push(r)
          }
        }
        const result = customGroups.filter(g => grouped[g]?.length).map(g => [g, grouped[g]])
        if (ungrouped.length) result.push(['Ungrouped', ungrouped])
        return result
      })()
    : [['', sortedRows]]

  if (!supabaseReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            Supabase not configured
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
            To enable the portfolio tracker:<br />
            1. Create a free project at supabase.com<br />
            2. Copy <code style={{ color: 'var(--text)', background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 3 }}>.env.example</code> to <code style={{ color: 'var(--text)', background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 3 }}>.env</code><br />
            3. Paste your Project URL &amp; anon key into <code style={{ color: 'var(--text)', background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 3 }}>.env</code><br />
            4. Run the SQL below in the Supabase SQL editor, then restart.
          </div>
          <pre style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left', overflowX: 'auto' }}>
{`create table public.holdings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  name text not null,
  shares numeric(15,6) not null default 0,
  avg_cost numeric(15,6) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_user_symbol unique (user_id, symbol)
);
alter table public.holdings enable row level security;
create policy "Users manage own holdings"
  on public.holdings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`}
          </pre>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128202;</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
            Track your portfolio
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Sign in to log holdings, track P&L, and see your allocation breakdown.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 36px - 52px)', overflowY: 'auto', padding: '24px 0' }}>

      {/* Summary cards */}
      <div className="stagger portfolio-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          {
            label: 'Market Value',
            val: `${sym}${totalMarket.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            color: 'var(--text)', icon: '\uD83D\uDCB0', accent: '#0A7C5C',
          },
          {
            label: 'Book Value',
            val: totalBook > 0 ? `${sym}${totalBook.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
            color: 'var(--text-secondary)', icon: '\uD83D\uDCDA', accent: 'var(--text-secondary)',
          },
          {
            label: 'Total Gain / Loss',
            val: totalGain != null ? `${isUp?'+':''}${sym}${Math.abs(totalGain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
            color: totalGain != null ? (isUp ? '#0A7C5C' : '#EF4444') : 'var(--text-muted)',
            icon: isUp ? '\uD83D\uDCC8' : '\uD83D\uDCC9', accent: isUp ? '#0A7C5C' : '#EF4444',
          },
          {
            label: 'Return',
            val: totalGainPct != null ? `${isUp?'+':''}${totalGainPct.toFixed(2)}%` : '—',
            color: totalGainPct != null ? (isUp ? '#0A7C5C' : '#EF4444') : 'var(--text-muted)',
            icon: '\u26A1', accent: totalGainPct != null ? (isUp ? '#0A7C5C' : '#EF4444') : 'var(--text-muted)',
          },
        ].map(({ label, val, color, icon, accent }) => (
          <div key={label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '20px 24px', position: 'relative', overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div style={{
              position: 'absolute', top: -8, right: -8, width: 48, height: 48, borderRadius: '50%',
              background: `${accent}10`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>{icon}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.5px' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Performance chart */}
      {rows.length > 0 && (
        <PortfolioChart holdings={holdings} convert={convert} sym={sym} customGroups={customGroups} customAssignments={customAssignments} />
      )}

      {/* Benchmark vs Index comparison */}
      {showBenchmark && rows.length > 0 && (
        <BenchmarkChart portfolioHistory={[]} holdings={holdings} user={user} />
      )}

      {/* Compare Panel */}
      {showCompare && compareSymbols.length >= 2 && (
        <ComparePanel
          symbols={compareSymbols}
          onClose={() => { setShowCompare(false); setCompareSymbols([]) }}
        />
      )}

      <div className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

        {/* Holdings table */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div className="portfolio-header" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '18px 24px', borderBottom: '1px solid var(--border)',
          }}>
            <div className="portfolio-controls" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Holdings</div>
              {/* Compare button */}
              {rows.length >= 2 && (
                <button
                  onClick={() => {
                    if (compareMode) { setCompareMode(false); setCompareSymbols([]) }
                    else setCompareMode(true)
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    border: compareMode ? '1px solid #0A7C5C' : '1px solid var(--border)',
                    background: compareMode ? 'rgba(10,124,92,0.08)' : 'transparent',
                    color: compareMode ? '#0A7C5C' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {compareMode ? `✕ Cancel (${compareSymbols.length}/3)` : '⚖ Compare'}
                </button>
              )}
              {compareMode && compareSymbols.length >= 2 && (
                <button
                  onClick={() => { setShowCompare(true); setCompareMode(false) }}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    border: 'none', background: '#0A7C5C', color: '#fff', cursor: 'pointer',
                  }}
                >
                  Compare {compareSymbols.length} →
                </button>
              )}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={groupBy} onChange={e => handleSetGroupBy(e.target.value)}
                  style={{
                    background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, padding: '5px 8px', cursor: 'pointer', outline: 'none',
                  }}>
                  <option value="none">No grouping</option>
                  <option value="category">Group by sector</option>
                  <option value="custom">Custom groups</option>
                </select>
                {groupBy === 'custom' && (
                  <button onClick={() => setShowGroupManager(!showGroupManager)}
                    style={{
                      background: showGroupManager ? 'rgba(10,124,92,0.06)' : 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6,
                      color: showGroupManager ? '#0A7C5C' : 'var(--text-secondary)', fontSize: 11, fontWeight: 500, padding: '5px 8px', cursor: 'pointer',
                    }}>
                    Manage
                  </button>
                )}
                <select value={sortBy} onChange={e => handleSetSortBy(e.target.value)}
                  style={{
                    background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, padding: '5px 8px', cursor: 'pointer', outline: 'none',
                  }}>
                  <option value="default">Default order</option>
                  <option value="market">Sort by value</option>
                  <option value="gain">Sort by return %</option>
                  <option value="name">Sort by name</option>
                </select>
              </div>
            </div>
            <div className="portfolio-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setShowBenchmark(b => !b)}
                title="Compare portfolio performance vs index"
                style={{
                  background: showBenchmark ? 'var(--green-bg)' : 'var(--bg-muted)',
                  border: `1px solid ${showBenchmark ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius: 8,
                  color: showBenchmark ? 'var(--green)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
                  padding: '0 14px', height: 36, cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                }}
              >
                📊 Benchmark
              </button>
              {/* Import dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowImportMenu(v => !v)}
                  style={{
                    background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 8,
                    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
                    padding: '0 14px', height: 36, cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  }}
                >
                  ↓ Import
                  <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
                </button>
                {showImportMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowImportMenu(false)} />
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 10, boxShadow: 'var(--shadow-lg)',
                      minWidth: 200, overflow: 'hidden',
                    }}>
                      <button
                        onClick={() => { setShowImportMenu(false); setShowBrokerageImport(true) }}
                        style={{
                          width: '100%', background: 'none', border: 'none',
                          padding: '12px 16px', textAlign: 'left', cursor: 'pointer',
                          color: 'var(--text)', fontSize: 13, fontWeight: 500,
                          display: 'flex', alignItems: 'center', gap: 10,
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontSize: 16 }}>🏦</span>
                        <div>
                          <div>Brokerage Import</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Wealthsimple, Questrade</div>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowImportMenu(false); setShowImportModal(true) }}
                        style={{
                          width: '100%', background: 'none', border: 'none',
                          padding: '12px 16px', textAlign: 'left', cursor: 'pointer',
                          color: 'var(--text)', fontSize: 13, fontWeight: 500,
                          display: 'flex', alignItems: 'center', gap: 10,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontSize: 16 }}>📸</span>
                        <div>
                          <div>Screenshot Import</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Paste or upload a screenshot</div>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
              {rows.length > 0 && (
                <button
                  onClick={exportCSV}
                  title="Export holdings as CSV"
                  style={{
                    background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 8,
                    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
                    padding: '0 14px', height: 36, cursor: 'pointer',
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  Export
                </button>
              )}
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  background: '#0A7C5C', border: 'none', borderRadius: 8,
                  color: '#FFFFFF', fontSize: 13, fontWeight: 600,
                  padding: '0 18px', height: 36, cursor: 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(10,124,92,0.25)',
                }}
              >
                + Add
              </button>
            </div>
          </div>

          {/* Custom group manager */}
          {showGroupManager && groupBy === 'custom' && (
            <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  placeholder="New group name..."
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomGroup(newGroupName) }}
                  style={{
                    flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 12, padding: '8px 12px', outline: 'none', color: 'var(--text)',
                  }}
                />
                <button onClick={() => addCustomGroup(newGroupName)}
                  style={{
                    background: 'var(--text)', border: 'none', borderRadius: 8,
                    color: '#FFFFFF', fontSize: 12, fontWeight: 500, padding: '8px 16px', cursor: 'pointer',
                  }}>
                  Add Group
                </button>
              </div>
              {customGroups.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No custom groups yet. Create one above.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {customGroups.map(g => (
                    <div key={g} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                      padding: '4px 10px', fontSize: 12, color: 'var(--text)',
                    }}>
                      {g}
                      <span onClick={() => removeCustomGroup(g)}
                        style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}>&times;</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {loadingHoldings ? (
            <div style={{ padding: '24px' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--bg-hover)' }}>
                  <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: 80, height: 14, marginBottom: 6, borderRadius: 4 }} />
                    <div className="skeleton" style={{ width: 140, height: 10, borderRadius: 4 }} />
                  </div>
                  <div className="skeleton" style={{ width: 60, height: 14, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 4 }} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>&#128188;</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                No holdings yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add your first position to get started.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Symbol', 'Shares', 'Price', 'Market', 'Gain/Loss', ''].map(h => (
                      <th key={h} style={{
                        fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                        textAlign: h === '' ? 'center' : h === 'Symbol' ? 'left' : 'right',
                        padding: '12px 12px', letterSpacing: 0.5,
                        whiteSpace: 'nowrap', textTransform: 'uppercase',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map(([cat, groupRows]) => (
                    <Fragment key={cat}>
                      {cat && (
                        <tr
                          onClick={() => toggleGroupCollapse(cat)}
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                        >
                          <td colSpan={6} style={{
                            padding: '12px 12px 8px', fontSize: 11, color: 'var(--text-secondary)',
                            textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700,
                            borderBottom: '1px solid var(--bg-hover)', background: 'var(--bg-muted)',
                          }}>
                            <span style={{
                              display: 'inline-block', width: 16, fontSize: 9,
                              transition: 'transform 0.2s',
                              transform: collapsedGroups[cat] ? 'rotate(-90deg)' : 'rotate(0deg)',
                            }}>
                              {'\u25BC'}
                            </span>
                            {cat}
                            <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontWeight: 500, fontSize: 10 }}>
                              {groupRows.length} holding{groupRows.length !== 1 ? 's' : ''}
                            </span>
                          </td>
                        </tr>
                      )}
                      {!collapsedGroups[cat] && groupRows.map((r) => {
                        const isRowUp = (r.gain ?? 0) >= 0
                        const glColor = r.gain == null ? 'var(--text-muted)' : isRowUp ? '#0A7C5C' : '#EF4444'
                        const isCompareSelected = compareSymbols.includes(r.symbol)
                        return (
                          <tr key={r.id}
                            onClick={compareMode ? () => {
                              setCompareSymbols(prev => {
                                if (prev.includes(r.symbol)) return prev.filter(s => s !== r.symbol)
                                if (prev.length >= 3) return prev
                                return [...prev, r.symbol]
                              })
                            } : undefined}
                            style={{
                              borderBottom: '1px solid var(--bg-hover)',
                              transition: 'background 0.1s',
                              cursor: compareMode ? 'pointer' : 'default',
                              background: isCompareSelected ? 'rgba(10,124,92,0.06)' : 'transparent',
                              borderLeft: isCompareSelected ? '3px solid #0A7C5C' : '3px solid transparent',
                            }}
                            onMouseEnter={e => { if (!isCompareSelected) e.currentTarget.style.background = 'var(--bg-muted)' }}
                            onMouseLeave={e => { if (!isCompareSelected) e.currentTarget.style.background = isCompareSelected ? 'rgba(10,124,92,0.06)' : 'transparent' }}
                          >
                            <td style={{ padding: '14px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <LogoAvatar symbol={r.symbol} name={r.name} size={36} />
                                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {r.symbol.replace('.TO','').replace('.NE','').replace('-B',' B')}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{r.name}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right', fontWeight: 500 }}>{r.shares}</td>
                            <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                                {loadingPrices ? <span className="skeleton" style={{ width: 50, height: 14, display: 'inline-block', borderRadius: 4 }} /> : r.dispPrice != null ? `${sym}${r.dispPrice.toFixed(2)}` : '—'}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {r.hasCost
                                  ? `${sym}${(convert(r.avg_cost, r.native) ?? 0).toFixed(2)}`
                                  : <span
                                      style={{ cursor: 'pointer', color: '#0A7C5C', fontWeight: 500 }}
                                      onClick={() => { setEditingHolding(r); setShowAddModal(true) }}
                                    >add cost</span>
                                }
                              </div>
                            </td>
                            <td style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text)', textAlign: 'right', fontWeight: 700 }}>
                              {r.dispMarketValue != null ? `${sym}${r.dispMarketValue.toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: glColor }}>
                                {r.dispGain != null ? `${isRowUp?'+':''}${sym}${Math.abs(r.dispGain).toFixed(2)}` : '—'}
                              </div>
                              <div style={{
                                fontSize: 11, fontWeight: 600, color: glColor,
                                display: 'inline-block',
                                background: r.gainPct != null ? (isRowUp ? 'rgba(10,124,92,0.08)' : 'rgba(192,57,43,0.08)') : 'transparent',
                                padding: r.gainPct != null ? '1px 6px' : 0,
                                borderRadius: 4,
                                marginTop: 2,
                              }}>
                                {r.gainPct != null ? `${isRowUp?'+':''}${r.gainPct.toFixed(2)}%` : ''}
                              </div>
                            </td>
                            <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                <button onClick={() => { setEditingHolding(r); setShowAddModal(true) }}
                                  style={{
                                    background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                    color: 'var(--text-secondary)', fontSize: 12, padding: '4px 8px', cursor: 'pointer',
                                    borderRadius: 6, transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(10,124,92,0.06)'; e.currentTarget.style.color = '#0A7C5C' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                                >
                                  &#9998;
                                </button>
                                <button onClick={() => handleDelete(r.id)}
                                  style={{
                                    background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                    color: 'var(--text-muted)', fontSize: 12, padding: '4px 8px', cursor: 'pointer',
                                    borderRadius: 6, transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; e.currentTarget.style.color = '#EF4444' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                                >
                                  &#10005;
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Allocation chart */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', alignSelf: 'start',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>
            Allocation
          </div>
          {pieData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 13 }}>
              Add holdings to see chart
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={58} outerRadius={95}
                    paddingAngle={3} dataKey="value" cornerRadius={4}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip sym={sym} />} />
                </PieChart>
              </ResponsiveContainer>

              <div style={{ borderTop: '1px solid var(--bg-hover)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Object.entries(pieGroups)
                  .sort(([,a], [,b]) => a.reduce((s,d) => s + d.value, 0) - b.reduce((s,d) => s + d.value, 0))
                  .map(([cat, items]) => (
                  <div key={cat}>
                    <div style={{
                      fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8,
                      padding: '8px 0 4px', marginTop: 4, fontWeight: 700,
                    }}>
                      {cat}
                    </div>
                    {items.map((d, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '6px 8px', borderRadius: 6,
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{d.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                            background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 4,
                          }}>{d.pct.toFixed(1)}%</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 64, textAlign: 'right' }}>{sym}{d.value.toFixed(0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {(showAddModal || editingHolding) && (
        <AddHoldingModal
          existing={editingHolding}
          onClose={() => { setShowAddModal(false); setEditingHolding(null) }}
          onSave={handleSave}
          onSaveMultiple={handleSaveMultiple}
          customGroups={customGroups}
          customAssignments={customAssignments}
          onAssignGroup={assignToGroup}
        />
      )}

      {showImportModal && (
        <PortfolioImportModal
          onClose={() => setShowImportModal(false)}
          onImport={async (items) => {
            await handleSaveMultiple(items)
            setShowImportModal(false)
          }}
        />
      )}

      {showBrokerageImport && (
        <BrokerageImport
          onClose={() => setShowBrokerageImport(false)}
          onImport={async (items) => {
            await handleSaveMultiple(items)
            setShowBrokerageImport(false)
          }}
        />
      )}
    </div>
  )
}
