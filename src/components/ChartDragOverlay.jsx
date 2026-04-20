import { useState, useRef, useCallback } from 'react'

export default function ChartDragOverlay({ children, data, dataKey = 'close', height }) {
  const containerRef = useRef(null)
  const [drag, setDrag] = useState(null) // { startX, currentX, startIdx, currentIdx }

  const getIdxFromX = useCallback((clientX) => {
    if (!containerRef.current || !data?.length) return null
    const rect = containerRef.current.getBoundingClientRect()
    const chartLeft = rect.left + 52
    const chartWidth = rect.right - 8 - chartLeft
    if (chartWidth <= 0) return null
    return Math.round(Math.max(0, Math.min(1, (clientX - chartLeft) / chartWidth)) * (data.length - 1))
  }, [data])

  const onDown = useCallback((e) => {
    if (!data?.length) return
    const idx = getIdxFromX(e.clientX)
    if (idx == null) return
    setDrag({ startX: e.clientX, currentX: e.clientX, startIdx: idx, currentIdx: idx })
  }, [data, getIdxFromX])

  const onMove = useCallback((e) => {
    setDrag(prev => {
      if (!prev) return null
      const idx = getIdxFromX(e.clientX)
      return { ...prev, currentX: e.clientX, currentIdx: idx ?? prev.currentIdx }
    })
  }, [getIdxFromX])

  const onEnd = useCallback(() => setDrag(null), [])

  if (!drag) {
    return (
      <div ref={containerRef} onMouseDown={onDown}
        style={{ position: 'relative', userSelect: 'none' }}>
        {children}
      </div>
    )
  }

  const startVal = data?.[drag.startIdx]?.[dataKey]
  const endVal = data?.[drag.currentIdx]?.[dataKey]
  const diff = startVal != null && endVal != null ? endVal - startVal : null
  const diffPct = diff != null && startVal > 0 ? (diff / startVal) * 100 : null
  const isUp = (diff ?? 0) >= 0
  const color = isUp ? '#0A7C5C' : '#EF4444'
  const bgTint = isUp ? 'rgba(10,124,92,0.06)' : 'rgba(192,57,43,0.06)'

  const rect = containerRef.current?.getBoundingClientRect()
  const left = rect ? Math.min(drag.startX, drag.currentX) - rect.left : 0
  const width = Math.abs(drag.currentX - drag.startX)
  const tooltipX = rect ? Math.max(4, Math.min(left + width / 2 - 64, rect.width - 136)) : 0
  const show = diff != null && width > 8 && rect

  return (
    <div ref={containerRef}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
      style={{ position: 'relative', cursor: 'crosshair', userSelect: 'none' }}>
      {children}

      {show && (
        <>
          <div style={{
            position: 'absolute', left, top: 0, width, height: height || '100%',
            background: bgTint,
            borderLeft: `1.5px dashed ${color}`,
            borderRight: `1.5px dashed ${color}`,
            pointerEvents: 'none', zIndex: 50,
            transition: 'background 0.1s',
          }} />

          <div style={{
            position: 'absolute', left: tooltipX, top: 6,
            background: 'var(--bg-card)', border: `1.5px solid ${color}`,
            borderRadius: 8, padding: '5px 14px',
            boxShadow: `0 4px 16px rgba(0,0,0,0.1), 0 0 0 1px ${color}20`,
            pointerEvents: 'none', zIndex: 51,
            whiteSpace: 'nowrap', textAlign: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color, letterSpacing: '-0.3px' }}>
              {isUp ? '+' : ''}{diff.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>({isUp ? '+' : ''}{diffPct?.toFixed(2)}%)</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, letterSpacing: 0.2 }}>
              ${startVal?.toFixed(2)} → ${endVal?.toFixed(2)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
