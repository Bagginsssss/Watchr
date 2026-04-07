import { useState } from 'react'
import { useCurrency } from '../context/CurrencyContext.jsx'

const SECTOR_LABEL_COLOR = 'var(--text-secondary)'
const SECTOR_LABEL_BG = 'var(--bg-hover)'

function LogoAvatar({ symbol, logoUrl, size = 28 }) {
  const [failed, setFailed] = useState(false)
  const letter = (symbol?.[0] ?? '?').toUpperCase()

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={symbol}
        onError={() => setFailed(true)}
        style={{
          width: size, height: size, borderRadius: 4,
          objectFit: 'contain', background: 'var(--bg-card)',
          padding: 2, boxSizing: 'border-box', flexShrink: 0,
          border: '1px solid var(--border)',
        }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 4,
      background: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 500, color: '#FFFFFF', flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

export default function StockCard({ stock, selected, onClick, rank, logoUrl }) {
  const { convert, sym } = useCurrency()
  const { symbol, name, price, changePct, currency, sector, loading, error } = stock
  const isUp = (changePct ?? 0) >= 0
  const changeColor = isUp ? '#0A7C5C' : '#C0392B'
  const displaySymbol = symbol.replace('.TO', '').replace('.V', '').replace('-B', ' B').replace('.NE', '')
  const displayPrice = convert(price, currency)

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 32px 1fr auto auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderLeft: selected ? '2px solid var(--text)' : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-muted)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Rank */}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{rank}</span>

      {/* Logo */}
      <LogoAvatar symbol={displaySymbol} logoUrl={logoUrl} size={28} />

      {/* Name + sector */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displaySymbol}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      </div>

      {/* Price + 24h */}
      <div style={{ textAlign: 'right', minWidth: 72 }}>
        {loading ? (
          <div>
            <div className="skeleton" style={{ width: 56, height: 11, marginBottom: 4, marginLeft: 'auto' }} />
            <div className="skeleton" style={{ width: 36, height: 10, marginLeft: 'auto' }} />
          </div>
        ) : error ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No data</div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {sym}{displayPrice?.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: changeColor }}>
              {isUp ? '+' : ''}{changePct?.toFixed(2)}%
            </div>
          </>
        )}
      </div>

      {/* Sector badge */}
      <div style={{ minWidth: 58, textAlign: 'right' }}>
        <span style={{
          fontSize: 10, fontWeight: 400, letterSpacing: 0.2,
          background: SECTOR_LABEL_BG, color: SECTOR_LABEL_COLOR,
          padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
        }}>
          {sector}
        </span>
      </div>
    </div>
  )
}
