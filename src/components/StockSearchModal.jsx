import { useState, useRef, useEffect } from 'react'
import { searchSymbol } from '../api/yahoo.js'

export default function StockSearchModal({ onAdd, onClose, portfolioHoldings = [], watchlistSymbols = [] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState([]) // bulk selection
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Filter portfolio holdings that aren't already in the watchlist
  const availablePortfolio = portfolioHoldings.filter(
    h => !watchlistSymbols.includes(h.symbol)
  )

  const selectedSymbols = selected.map(s => s.symbol)

  function handleChange(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    if (val.trim().length < 1) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchSymbol(val)
        setResults(res.slice(0, 12))
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 350)
  }

  function toggleStock(stock) {
    setSelected(prev => {
      const exists = prev.some(s => s.symbol === stock.symbol)
      if (exists) return prev.filter(s => s.symbol !== stock.symbol)
      return [...prev, stock]
    })
  }

  function handleAddAll() {
    onAdd(selected)
    onClose()
  }

  function isSelected(symbol) {
    return selectedSymbols.includes(symbol)
  }

  function isAlreadyInWatchlist(symbol) {
    return watchlistSymbols.includes(symbol)
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="modal-panel" onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: 12, width: 480, maxHeight: '70vh',
        boxShadow: '0 16px 48px rgba(0,0,0,0.15)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="sheet-handle" />
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>Add to Watchlist</div>
          <button onClick={onClose} style={{
            background: 'var(--bg-hover)', border: 'none', borderRadius: 20,
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)',
          }}>
            {'\u2715'}
          </button>
        </div>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div style={{ padding: '12px 24px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selected.map(s => (
              <div key={s.symbol} onClick={() => toggleStock(s)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(10,124,92,0.1)', color: '#0A7C5C',
                padding: '4px 10px', borderRadius: 14, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(10,124,92,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(10,124,92,0.1)'}
              >
                {s.symbol}
                <span style={{ fontSize: 10, marginLeft: 2 }}>{'\u2715'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Search input */}
        <div style={{ padding: '16px 24px' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            placeholder="Search by name or ticker..."
            style={{
              width: '100%', padding: '10px 14px', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 16, outline: 'none', background: 'var(--bg-muted)',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--text)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 16px' }}>
          {/* Portfolio suggestions — shown when no search query */}
          {!loading && query.trim().length === 0 && availablePortfolio.length > 0 && (
            <>
              <div style={{
                fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase',
                letterSpacing: 0.8, padding: '8px 12px 6px', marginBottom: 2,
              }}>
                From Your Portfolio
              </div>
              {availablePortfolio.map(h => {
                const alreadySelected = isSelected(h.symbol)
                return (
                  <div
                    key={h.symbol}
                    onClick={() => toggleStock({ symbol: h.symbol, name: h.name, sector: '' })}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      transition: 'background 0.15s',
                      background: alreadySelected ? 'rgba(10,124,92,0.06)' : 'transparent',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = alreadySelected ? 'rgba(10,124,92,0.1)' : '#F5F5F2'}
                    onMouseLeave={e => e.currentTarget.style.background = alreadySelected ? 'rgba(10,124,92,0.06)' : 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: alreadySelected ? 'none' : '1.5px solid #D0D0CC',
                        background: alreadySelected ? '#0A7C5C' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {alreadySelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{'\u2713'}</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.symbol}</div>
                        <div style={{
                          fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300,
                        }}>
                          {h.name}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 500,
                      color: alreadySelected ? '#0A7C5C' : '#0A7C5C',
                      background: alreadySelected ? 'rgba(10,124,92,0.12)' : 'rgba(10,124,92,0.08)',
                      padding: '3px 8px', borderRadius: 10, flexShrink: 0, marginLeft: 12,
                    }}>
                      {alreadySelected ? '\u2713 Selected' : '+ Add'}
                    </div>
                  </div>
                )
              })}
              {/* Divider */}
              <div style={{
                borderTop: '1px solid var(--border)', margin: '12px 12px 8px',
              }} />
              <div style={{ textAlign: 'center', padding: '4px 0 8px', color: 'var(--text-muted)', fontSize: 12 }}>
                Or search for any stock above
              </div>
            </>
          )}

          {/* No portfolio, no search — default message */}
          {!loading && query.trim().length === 0 && availablePortfolio.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
              Type a stock name or ticker symbol to search
            </div>
          )}

          {/* Search loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Searching...</div>
          )}

          {/* Search results */}
          {!loading && query.trim().length > 0 && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No results found</div>
          )}
          {!loading && query.trim().length > 0 && results.map(r => {
            const alreadyIn = isAlreadyInWatchlist(r.symbol)
            const alreadySelected = isSelected(r.symbol)
            return (
              <div
                key={r.symbol}
                onClick={() => {
                  if (alreadyIn) return
                  toggleStock({ symbol: r.symbol, name: r.name, sector: r.exchange })
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 8,
                  cursor: alreadyIn ? 'default' : 'pointer',
                  opacity: alreadyIn ? 0.5 : 1,
                  transition: 'background 0.15s',
                  background: alreadySelected ? 'rgba(10,124,92,0.06)' : 'transparent',
                }}
                onMouseEnter={e => { if (!alreadyIn) e.currentTarget.style.background = alreadySelected ? 'rgba(10,124,92,0.1)' : '#F5F5F2' }}
                onMouseLeave={e => { if (!alreadyIn) e.currentTarget.style.background = alreadySelected ? 'rgba(10,124,92,0.06)' : 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: alreadySelected ? 'none' : '1.5px solid #D0D0CC',
                    background: alreadySelected ? '#0A7C5C' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {alreadySelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{'\u2713'}</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.symbol}</div>
                    <div style={{
                      fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280,
                    }}>
                      {r.name}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: alreadyIn ? 'var(--text-muted)' : alreadySelected ? '#0A7C5C' : 'var(--text-muted)', flexShrink: 0, marginLeft: 12 }}>
                  {alreadyIn ? 'In watchlist' : alreadySelected ? '\u2713 Selected' : r.exchange}
                </div>
              </div>
            )
          })}
        </div>

        {/* Add button — shown when stocks are selected */}
        {selected.length > 0 && (
          <div style={{
            padding: '12px 24px 16px', borderTop: '1px solid var(--border)',
          }}>
            <button onClick={handleAddAll} style={{
              width: '100%', padding: '10px 0', border: 'none', borderRadius: 8,
              background: '#0A7C5C', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#08664B'}
              onMouseLeave={e => e.currentTarget.style.background = '#0A7C5C'}
            >
              Add {selected.length} Stock{selected.length > 1 ? 's' : ''} to Watchlist
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
