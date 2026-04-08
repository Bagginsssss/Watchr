export function formatMarketCap(v, sym = '$') {
  if (v == null) return '—'
  if (v >= 1e12) return `${sym}${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `${sym}${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `${sym}${(v / 1e6).toFixed(2)}M`
  return `${sym}${v.toLocaleString()}`
}

export function formatVolume(v) {
  if (v == null) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return v.toString()
}

export function formatPct(v) {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(2)}%`
}

export function formatNum(v, decimals = 2) {
  if (v == null) return '—'
  return v.toFixed(decimals)
}

/** Strip exchange suffixes for cleaner display: "RY.TO" -> "RY", "BRK-A" -> "BRK A" */
export function displaySymbolText(symbol) {
  return symbol
    .replace(/\.(TO|V|NE|CN|L|DE|T)$/i, '')
    .replace(/-[A-Z]$/, s => ' ' + s.slice(1))
}

/** Sector color mapping for consistent UI across tabs */
export const SECTOR_COLORS = {
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

export function getSectorColor(sector) {
  const c = SECTOR_COLORS[sector]
  if (!c) return { bg: 'var(--bg-muted)', text: 'var(--text-secondary)', accent: '#999' }
  return { bg: `${c.accent}15`, text: c.accent, accent: c.accent }
}

export function timeAgo(unixTs) {
  const diff = Date.now() / 1000 - unixTs
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
