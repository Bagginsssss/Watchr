import { useState, memo } from 'react'
import { fetchLogoUrl } from '../api/yahoo.js'

const AVATAR_COLORS = ['var(--text)', '#0A7C5C', '#3A5A8A', '#7A4040', '#6B4F8A', '#8B6914', '#2D6A4F', '#5A3080']

function LogoAvatarInner({ symbol, name, size = 34, logoUrl: externalLogoUrl }) {
  const upper = (symbol ?? '').toUpperCase()
  const clean = upper.replace(/\.(TO|NE|V|CN|L|DE|T)$/i, '').replace(/-[A-Z]$/, '')
  const [failed, setFailed] = useState(false)
  const letter = (clean?.[0] ?? '?').toUpperCase()
  const bg = AVATAR_COLORS[clean.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
  const url = externalLogoUrl || fetchLogoUrl(symbol)

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name || symbol}
        onError={() => setFailed(true)}
        style={{
          width: size, height: size, borderRadius: size > 32 ? 10 : 6,
          objectFit: 'contain', background: 'var(--bg-card)',
          padding: 2, boxSizing: 'border-box', flexShrink: 0,
          border: '1px solid var(--border)',
        }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size > 32 ? 10 : 6,
      background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.4), fontWeight: 700, flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

export default memo(LogoAvatarInner)
