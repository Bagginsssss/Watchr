import { memo } from 'react'

function SparklineInner({ data, width = 80, height = 32, color }) {
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

export default memo(SparklineInner)
