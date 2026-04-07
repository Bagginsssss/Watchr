import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useCurrency } from '../context/CurrencyContext.jsx'
import ChartDragOverlay from './ChartDragOverlay.jsx'

const CustomTooltip = ({ active, payload, label, sym }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 4, padding: '8px 14px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
        {sym}{payload[0].value?.toFixed(2)}
      </div>
    </div>
  )
}

export default function StockChart({ stock, history, stockCurrency = 'CAD' }) {
  const { convert, sym } = useCurrency()

  if (!history?.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--text-muted)', fontSize: 13 }}>
        No chart data
      </div>
    )
  }

  const convertedHistory = history.map(d => ({
    ...d,
    close: d.close != null ? convert(d.close, stockCurrency) : null,
  }))

  const isUp = (stock?.change ?? 0) >= 0
  const lineColor = isUp ? '#0A7C5C' : '#C0392B'
  const firstClose = convertedHistory[0]?.close

  return (
    <ChartDragOverlay data={convertedHistory} dataKey="close" height={180}>
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={convertedHistory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false}
          tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)} width={40} />
        <Tooltip content={<CustomTooltip sym={sym} />} />
        {firstClose && <ReferenceLine y={firstClose} stroke="var(--border)" strokeDasharray="3 3" />}
        <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: lineColor, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
    </ChartDragOverlay>
  )
}
