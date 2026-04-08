import { memo } from 'react'
import { useCurrency } from '../context/CurrencyContext.jsx'

function Sparkline({ data, color }) {
  if (!data?.length || data.length < 2) return null
  const filtered = data.filter(v => v != null && isFinite(v))
  if (filtered.length < 2) return null
  const min = Math.min(...filtered)
  const max = Math.max(...filtered)
  const range = max - min || 1
  const w = 72, h = 28
  const pts = filtered.map((v, i) => {
    const x = (i / (filtered.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function formatMcap(v) {
  if (v == null) return ''
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toLocaleString()}`
}

export default memo(function CryptoCard({ coin, selected, onClick }) {
  const { convert, sym } = useCurrency()
  const pct24h = coin.price_change_percentage_24h ?? 0
  const pct7d  = coin.price_change_percentage_7d_in_currency ?? 0
  const isUp24 = pct24h >= 0
  const isUp7d = pct7d  >= 0
  const sparkData = coin.sparkline_in_7d?.price ?? []

  const displayPrice = convert(coin.current_price, 'USD')

  const fmt = (v) => {
    if (v == null) return '—'
    if (v >= 1e9)  return `${sym}${(v / 1e9).toFixed(2)}B`
    if (v >= 1e6)  return `${sym}${(v / 1e6).toFixed(2)}M`
    if (v >= 1)    return `${sym}${v.toFixed(2)}`
    if (v >= 0.01) return `${sym}${v.toFixed(4)}`
    return `${sym}${v.toFixed(6)}`
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 32px 1fr auto auto auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderLeft: selected ? '2px solid var(--text)' : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-muted)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Rank */}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
        {coin.market_cap_rank ? `#${coin.market_cap_rank}` : '—'}
      </span>

      {/* Icon */}
      {coin.image ? (
        <img src={coin.image} alt={coin.symbol} width={28} height={28}
          style={{ borderRadius: '50%', background: 'var(--bg-muted)' }}
          onError={e => { e.target.style.display = 'none' }} />
      ) : (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: 'var(--text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: '#fff',
        }}>{coin.symbol?.[0]?.toUpperCase()}</div>
      )}

      {/* Name + market cap */}
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{coin.symbol?.toUpperCase()}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {coin.name}{coin.market_cap ? ` · ${formatMcap(coin.market_cap)}` : ''}
        </div>
      </div>

      {/* Price */}
      <div style={{ textAlign: 'right', minWidth: 80 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmt(displayPrice)}</div>
        <div style={{ fontSize: 11, color: isUp24 ? '#0A7C5C' : '#C0392B' }}>
          {isUp24 ? '+' : ''}{pct24h.toFixed(2)}%
        </div>
      </div>

      {/* 7d % */}
      <div style={{ textAlign: 'right', minWidth: 52, fontSize: 12, color: isUp7d ? '#0A7C5C' : '#C0392B' }}>
        {pct7d != null ? `${isUp7d ? '+' : ''}${pct7d.toFixed(1)}%` : '—'}
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>7d</div>
      </div>

      {/* Sparkline */}
      <Sparkline data={sparkData} color={isUp7d ? '#0A7C5C' : '#C0392B'} />
    </div>
  )
})
