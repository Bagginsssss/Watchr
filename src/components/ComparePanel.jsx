import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { fetchHistory, fetchMetrics } from '../api/yahoo.js'
import { useCurrency } from '../context/CurrencyContext.jsx'

const COLORS = ['#0A7C5C', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6']
const RANGE_OPTIONS = [
  { label: '1M',  range: '1mo',  interval: '1d'  },
  { label: '3M',  range: '3mo',  interval: '1d'  },
  { label: '6M',  range: '6mo',  interval: '1d'  },
  { label: '1Y',  range: '1y',   interval: '1wk' },
  { label: '5Y',  range: '5y',   interval: '1mo' },
]

function CompareTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.color }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ fontWeight: 500 }}>{p.name}:</span>
          <span>{p.value?.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

function fmtNum(val) {
  if (val == null) return '—'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`
  if (val >= 1e6)  return `$${(val / 1e6).toFixed(0)}M`
  return val.toLocaleString()
}

function fmtPct(val) {
  if (val == null) return '—'
  return `${(val * 100).toFixed(1)}%`
}

/**
 * Side-by-side stock comparison panel.
 * Shows normalized price chart + metrics table.
 */
export default function ComparePanel({ symbols, onClose }) {
  const { convert, sym: currSym } = useCurrency()
  const [range, setRange] = useState(RANGE_OPTIONS[1]) // 3M default
  const [chartData, setChartData] = useState([])
  const [metricsMap, setMetricsMap] = useState({})
  const [loading, setLoading] = useState(true)

  // Fetch chart data for all symbols
  useEffect(() => {
    if (!symbols.length) return
    setLoading(true)

    Promise.all(symbols.map(sym =>
      fetchHistory(sym, range.range, range.interval)
        .then(data => ({ sym, data }))
        .catch(() => ({ sym, data: [] }))
    )).then(results => {
      // Find the longest series as template
      const template = results.reduce((best, r) => r.data.length > best.data.length ? r : best, { data: [] })
      if (!template.data.length) { setChartData([]); setLoading(false); return }

      // Normalize to percentage change from first data point
      const normalized = template.data.map((point, i) => {
        const entry = { date: point.date }
        for (const r of results) {
          const dp = r.data[i] ?? r.data[r.data.length - 1]
          const firstClose = r.data[0]?.close
          if (dp?.close != null && firstClose) {
            entry[r.sym] = ((dp.close - firstClose) / firstClose) * 100
          }
        }
        return entry
      })
      setChartData(normalized)
      setLoading(false)
    })
  }, [symbols, range])

  // Fetch metrics for all symbols
  useEffect(() => {
    if (!symbols.length) return
    Promise.all(symbols.map(sym =>
      fetchMetrics(sym)
        .then(m => ({ sym, metrics: m }))
        .catch(() => ({ sym, metrics: null }))
    )).then(results => {
      const map = {}
      for (const r of results) if (r.metrics) map[r.sym] = r.metrics
      setMetricsMap(map)
    })
  }, [symbols])

  const METRIC_ROWS = [
    { label: 'Market Cap',      key: 'marketCap',      fmt: fmtNum },
    { label: 'P/E (Trailing)',   key: 'trailingPE',     fmt: v => v?.toFixed(1) ?? '—' },
    { label: 'P/E (Forward)',    key: 'forwardPE',      fmt: v => v?.toFixed(1) ?? '—' },
    { label: 'EPS',             key: 'eps',             fmt: v => v ? `$${v.toFixed(2)}` : '—' },
    { label: 'Div Yield',       key: 'dividendYield',   fmt: fmtPct },
    { label: 'Beta',            key: 'beta',            fmt: v => v?.toFixed(2) ?? '—' },
    { label: '52W High',        key: 'high52w',         fmt: v => v ? `$${v.toFixed(2)}` : '—' },
    { label: '52W Low',         key: 'low52w',          fmt: v => v ? `$${v.toFixed(2)}` : '—' },
    { label: 'Profit Margin',   key: 'profitMargin',    fmt: fmtPct },
    { label: 'Revenue Growth',  key: 'revenueGrowth',   fmt: fmtPct },
    { label: 'Price/Book',      key: 'priceToBook',     fmt: v => v?.toFixed(2) ?? '—' },
    { label: 'Analyst Target',  key: 'targetMeanPrice', fmt: v => v ? `$${v.toFixed(2)}` : '—' },
  ]

  return (
    <div className="fade-in" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: 24, marginBottom: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      position: 'relative',
    }}>
      <button onClick={onClose} style={{
        position: 'absolute', top: 16, right: 16,
        background: 'var(--bg-muted)', border: 'none', borderRadius: 20,
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)',
      }}>✕</button>

      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
        Compare: {symbols.join(' vs ')}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Normalized performance (% change from start)
      </div>

      {/* Range selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {RANGE_OPTIONS.map(r => (
          <button key={r.label} onClick={() => setRange(r)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: range.label === r.label ? 'var(--text)' : 'var(--bg-muted)',
              color: range.label === r.label ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="skeleton" style={{ height: 280, borderRadius: 8, marginBottom: 24 }} />
      ) : chartData.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false}
                interval={Math.max(1, Math.floor(chartData.length / 8))} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                width={50} />
              <Tooltip content={<CompareTooltip />} />
              {symbols.map((sym, i) => (
                <Line key={sym} type="monotone" dataKey={sym} stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2} dot={false} name={sym.replace('.TO', '').replace('.L', '')} />
              ))}
              <Legend iconType="circle" iconSize={8}
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No chart data available</div>
      )}

      {/* Metrics comparison table */}
      {Object.keys(metricsMap).length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 11 }}>
                  Metric
                </th>
                {symbols.map((sym, i) => (
                  <th key={sym} style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: COLORS[i % COLORS.length] }}>
                    {sym.replace('.TO', '').replace('.L', '').replace('.DE', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map(row => (
                <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{row.label}</td>
                  {symbols.map(sym => {
                    const m = metricsMap[sym]
                    return (
                      <td key={sym} style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500, color: 'var(--text)', fontFamily: 'Georgia, serif' }}>
                        {m ? row.fmt(m[row.key]) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
