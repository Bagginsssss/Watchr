import { useState, useEffect } from 'react'
import { MARKET_INDICES } from '../data/stocks.js'
import { fetchQuote } from '../api/yahoo.js'

export default function MarketBar() {
  const [indices, setIndices] = useState(MARKET_INDICES.map(i => ({ ...i, loading: true })))
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const results = await Promise.all(
        MARKET_INDICES.map(async (idx) => {
          try {
            const data = await fetchQuote(idx.symbol)
            const change = data.price - data.prevClose
            const changePct = (change / data.prevClose) * 100
            return { ...idx, price: data.price, change, changePct, currency: data.currency, loading: false }
          } catch {
            return { ...idx, loading: false, error: true }
          }
        })
      )
      if (!cancelled) setIndices(results)
    }
    load()
    const id = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Duplicate the items for seamless loop
  const tickerItems = [...indices, ...indices]

  function renderItem(idx, i) {
    const isUp = (idx.changePct ?? 0) >= 0
    const changeColor = isUp ? '#0A7C5C' : '#EF4444'
    return (
      <div
        key={`${idx.symbol}-${i}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 24px',
          fontSize: 12,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, letterSpacing: 0.5, fontSize: 11, textTransform: 'uppercase' }}>
          {idx.name}
        </span>
        {idx.loading ? (
          <span className="skeleton" style={{ width: 48, height: 10 }} />
        ) : idx.error ? (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ) : (
          <>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>
              {idx.isFx
                ? idx.price?.toFixed(4)
                : idx.price >= 1000
                  ? idx.price?.toLocaleString('en-CA', { maximumFractionDigits: 2 })
                  : idx.price?.toFixed(2)}
            </span>
            <span style={{ color: changeColor, fontWeight: 400 }}>
              {isUp ? '+' : ''}{idx.changePct?.toFixed(2)}%
            </span>
          </>
        )}
        <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
      </div>
    )
  }

  return (
    <div
      className="market-ticker-bar"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden',
        flexShrink: 0,
        height: 36,
        position: 'relative',
      }}
    >
      <div
        className="market-ticker-track"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: '100%',
          animationPlayState: paused ? 'paused' : 'running',
        }}
      >
        {tickerItems.map((idx, i) => renderItem(idx, i))}
      </div>
    </div>
  )
}
