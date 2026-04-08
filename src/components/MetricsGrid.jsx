import { formatVolume, formatPct, formatNum } from '../utils/format.js'
import { useCurrency } from '../context/CurrencyContext.jsx'

const RECOMMEND_COLOR = {
  buy: '#0A7C5C', strong_buy: '#0A7C5C',
  hold: '#B8860B',
  sell: '#C0392B', strong_sell: '#C0392B',
}

function Cell({ label, value, color }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: color ?? 'var(--text)' }}>{value ?? '—'}</div>
    </div>
  )
}

export default function MetricsGrid({ metrics, loading, stockCurrency = 'CAD' }) {
  const { convert, sym } = useCurrency()

  if (loading) {
    return (
      <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="skeleton" style={{ width: 60, height: 9, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: 80, height: 12 }} />
          </div>
        ))}
      </div>
    )
  }

  if (!metrics) return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
      No metrics available
    </div>
  )

  // Format a monetary value in the stock's native currency → display currency
  const fmtMoney = (v) => {
    if (v == null) return '—'
    const c = convert(v, stockCurrency)
    if (c == null) return '—'
    if (Math.abs(c) >= 1e12) return `${sym}${(c / 1e12).toFixed(2)}T`
    if (Math.abs(c) >= 1e9)  return `${sym}${(c / 1e9).toFixed(2)}B`
    if (Math.abs(c) >= 1e6)  return `${sym}${(c / 1e6).toFixed(2)}M`
    return `${sym}${c.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const fmtPrice = (v) => {
    if (v == null) return '—'
    const c = convert(v, stockCurrency)
    if (c == null) return '—'
    return `${sym}${formatNum(c)}`
  }

  const recColor = metrics.recommendation ? RECOMMEND_COLOR[metrics.recommendation] : 'var(--text-secondary)'
  const recLabel = metrics.recommendation ? metrics.recommendation.replace('_', ' ').toUpperCase() : '—'

  const cells = [
    { label: 'Market Cap',       value: fmtMoney(metrics.marketCap) },
    { label: 'Volume',           value: formatVolume(metrics.volume) },
    { label: 'Avg Volume',       value: formatVolume(metrics.avgVolume) },
    { label: 'Shares Out',       value: metrics.sharesOut ? formatVolume(metrics.sharesOut) : '—' },
    { label: 'P/E (Trailing)',   value: metrics.trailingPE ? formatNum(metrics.trailingPE) : '—' },
    { label: 'P/E (Forward)',    value: metrics.forwardPE  ? formatNum(metrics.forwardPE)  : '—' },
    { label: 'EPS (TTM)',        value: metrics.eps        ? fmtPrice(metrics.eps)          : '—' },
    { label: 'Price / Book',     value: metrics.priceToBook ? formatNum(metrics.priceToBook) : '—' },
    { label: '52W High',         value: fmtPrice(metrics.high52w), color: '#0A7C5C' },
    { label: '52W Low',          value: fmtPrice(metrics.low52w),  color: '#C0392B' },
    { label: 'Dividend Yield',   value: metrics.dividendYield ? formatPct(metrics.dividendYield) : '—', color: '#B8860B' },
    { label: 'Annual Dividend',  value: metrics.dividendRate  ? fmtPrice(metrics.dividendRate)   : '—', color: '#B8860B' },
    { label: 'Beta',             value: metrics.beta ? formatNum(metrics.beta) : '—' },
    { label: 'Profit Margin',    value: metrics.profitMargin  ? formatPct(metrics.profitMargin)  : '—', color: metrics.profitMargin > 0 ? '#0A7C5C' : '#C0392B' },
    { label: 'Revenue Growth',   value: metrics.revenueGrowth ? formatPct(metrics.revenueGrowth) : '—', color: metrics.revenueGrowth > 0 ? '#0A7C5C' : '#C0392B' },
    { label: 'Gross Margin',     value: metrics.grossMargin   ? formatPct(metrics.grossMargin)   : '—' },
    { label: 'Analyst Rating',   value: recLabel, color: recColor },
    { label: 'Price Target',     value: fmtPrice(metrics.targetMeanPrice) },
  ]

  return (
    <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
      {cells.map(({ label, value, color }) => (
        <Cell key={label} label={label} value={value} color={color} />
      ))}
    </div>
  )
}
