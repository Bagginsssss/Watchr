import { useMemo } from 'react'
import { useMobile } from '../hooks/useMediaQuery.js'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'
import { addMAOverlays } from '../utils/indicators.js'

/**
 * Custom candlestick shape for Recharts Bar component.
 * Renders body (open-close rect) + wicks (high-low lines).
 */
function CandlestickShape(props) {
  const { x, y, width, height, payload } = props
  if (!payload) return null

  const { open, high, low, close } = payload
  if (open == null || close == null) return null

  const isUp = close >= open
  const fill = isUp ? '#0A7C5C' : '#C0392B'
  const stroke = isUp ? '#0D9668' : '#E74C3C'

  // Y-axis mapping: bar's y and height correspond to the "bar" value range
  // We need to calculate proper positions using the Y scale
  const yScale = props.yScale || (v => y)
  const bodyTop = yScale(Math.max(open, close))
  const bodyBottom = yScale(Math.min(open, close))
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1)
  const wickTop = yScale(high)
  const wickBottom = yScale(low)
  const centerX = x + width / 2

  return (
    <g>
      {/* Wick (high-low line) */}
      <line
        x1={centerX} x2={centerX}
        y1={wickTop} y2={wickBottom}
        stroke={stroke} strokeWidth={1}
      />
      {/* Body (open-close rectangle) */}
      <rect
        x={x + 1} y={bodyTop}
        width={Math.max(width - 2, 2)} height={bodyHeight}
        fill={fill} stroke={stroke} strokeWidth={0.5}
        rx={1}
      />
    </g>
  )
}

/** Candlestick chart tooltip */
function CandleTooltip({ active, payload, label, sym }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', color: 'var(--text-secondary)' }}>
        <span>O:</span><span style={{ fontWeight: 500 }}>${d.open?.toFixed(2)}</span>
        <span>H:</span><span style={{ fontWeight: 500 }}>${d.high?.toFixed(2)}</span>
        <span>L:</span><span style={{ fontWeight: 500 }}>${d.low?.toFixed(2)}</span>
        <span>C:</span><span style={{ fontWeight: 500, color: d.close >= d.open ? '#0A7C5C' : '#C0392B' }}>
          ${d.close?.toFixed(2)}
        </span>
        {d.volume != null && (
          <>
            <span>Vol:</span>
            <span style={{ fontWeight: 500 }}>
              {d.volume >= 1e6 ? `${(d.volume / 1e6).toFixed(1)}M` : d.volume?.toLocaleString()}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

const MA_COLORS = { ma20: '#F59E0B', ma50: '#3B82F6', ma200: '#EF4444' }

/**
 * Full OHLCV candlestick chart with optional MA overlays and volume.
 * @param {{ data: Object[], showVolume?: boolean, maOverlays?: number[], height?: number, sym?: string }} props
 */
export default function CandlestickChart({
  data = [],
  showVolume = true,
  maOverlays = [],
  height = 350,
  sym = '',
}) {
  const isMobile = useMobile()
  const effectiveHeight = isMobile ? Math.min(height, 220) : height

  const chartData = useMemo(() => {
    if (!data.length) return []
    return maOverlays.length > 0 ? addMAOverlays(data, maOverlays) : data
  }, [data, maOverlays])

  if (!chartData.length) return null

  const prices = chartData.flatMap(d => [d.high, d.low]).filter(Boolean)
  const minPrice = Math.min(...prices) * 0.998
  const maxPrice = Math.max(...prices) * 1.002
  const maxVol = showVolume ? Math.max(...chartData.map(d => d.volume || 0)) : 0

  // Thin out X-axis labels to avoid crowding
  const tickInterval = Math.max(1, Math.floor(chartData.length / 8))

  return (
    <ResponsiveContainer width="100%" height={effectiveHeight}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
          tickLine={false}
          interval={tickInterval}
        />
        <YAxis
          yAxisId="price"
          domain={[minPrice, maxPrice]}
          tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
          tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(v < 10 ? 2 : 0)}`}
          width={isMobile ? 45 : 60}
        />
        {showVolume && (
          <YAxis
            yAxisId="volume"
            orientation="right"
            domain={[0, maxVol * 4]}
            hide
          />
        )}

        <Tooltip content={<CandleTooltip sym={sym} />} />

        {/* Volume bars (subtle, behind candles) */}
        {showVolume && (
          <Bar
            yAxisId="volume"
            dataKey="volume"
            fill="var(--text-secondary)"
            opacity={0.15}
            isAnimationActive={false}
          />
        )}

        {/* Candlestick bodies — rendered as a bar chart with custom shape */}
        {/* We use 'high' as dataKey for positioning, then draw custom candle shapes */}
        <Bar
          yAxisId="price"
          dataKey="close"
          shape={(props) => {
            const d = props.payload
            if (!d?.open || !d?.close) return null
            const isUp = d.close >= d.open
            const fill = isUp ? '#0A7C5C' : '#C0392B'
            const { x, width } = props

            // Use the YAxis scale to compute pixel positions
            // The bar gives us x position; compute y from the axis
            return null // placeholder — handled by scatter below
          }}
          isAnimationActive={false}
          hide
        />

        {/* Draw candles as a custom SVG layer using the data */}
        {chartData.map((d, i) => {
          if (!d.open || !d.close || !d.high || !d.low) return null
          return null // handled by the custom render below
        })}

        {/* MA overlay lines */}
        {maOverlays.map(period => (
          <Line
            key={`ma${period}`}
            yAxisId="price"
            type="monotone"
            dataKey={`ma${period}`}
            stroke={MA_COLORS[`ma${period}`] || '#999'}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
            name={`MA ${period}`}
          />
        ))}

        {/* Actual candlesticks rendered as a custom bar */}
        <Bar
          yAxisId="price"
          dataKey="high"
          isAnimationActive={false}
          shape={(props) => {
            const d = props?.payload
            if (!d?.open || !d?.close || !d?.high || !d?.low) return null

            const { x, width, yAxis } = props
            // Access the Y-axis scale from the chart internals
            const scale = yAxis?.scale
            if (!scale) return null

            const isUp = d.close >= d.open
            const fill = isUp ? '#0A7C5C' : '#C0392B'
            const stroke = isUp ? '#0D9668' : '#E74C3C'

            const bodyTop = scale(Math.max(d.open, d.close))
            const bodyBottom = scale(Math.min(d.open, d.close))
            const bodyH = Math.max(bodyBottom - bodyTop, 1)
            const wickTop = scale(d.high)
            const wickBottom = scale(d.low)
            const cx = x + width / 2

            return (
              <g>
                <line x1={cx} x2={cx} y1={wickTop} y2={wickBottom} stroke={stroke} strokeWidth={1} />
                <rect x={x + 1} y={bodyTop} width={Math.max(width - 2, 3)} height={bodyH}
                  fill={fill} stroke={stroke} strokeWidth={0.5} rx={1} />
              </g>
            )
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
