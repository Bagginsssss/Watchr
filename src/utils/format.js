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

export function timeAgo(unixTs) {
  const diff = Date.now() / 1000 - unixTs
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
