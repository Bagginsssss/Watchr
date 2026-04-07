import { useState, useRef, useEffect } from 'react'

/**
 * Bell icon with alert count badge + dropdown list.
 */
export default function AlertsBell({ alerts, activeCount, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title="Price Alerts"
        style={{
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 6, width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 16, position: 'relative',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        🔔
        {activeCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 16, height: 16, borderRadius: '50%',
            background: '#0A7C5C', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="alerts-dropdown" style={{
          position: 'absolute', top: 40, right: 0,
          width: 320, maxHeight: 400, overflowY: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 12px 36px rgba(0,0,0,0.15)',
          zIndex: 100,
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            fontWeight: 600, fontSize: 13, color: 'var(--text)',
          }}>
            Price Alerts {activeCount > 0 && `(${activeCount} active)`}
          </div>

          {alerts.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No alerts set. Click "Set Alert" on any stock to get started.
            </div>
          ) : (
            alerts.map(alert => (
              <div key={alert.id} style={{
                padding: '10px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 10,
                opacity: alert.triggered ? 0.5 : 1,
              }}>
                <div style={{
                  fontSize: 16,
                  width: 24, textAlign: 'center',
                }}>
                  {alert.triggered ? '✅' : alert.direction === 'above' ? '📈' : '📉'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {alert.symbol.replace('.TO', '').replace('.L', '')}
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
                      {alert.direction} ${parseFloat(alert.target_price).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {alert.triggered
                      ? `Triggered ${new Date(alert.triggered_at).toLocaleDateString()}`
                      : `Created ${new Date(alert.created_at).toLocaleDateString()}`
                    }
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(alert.id) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 14, padding: 4,
                  }}
                  title="Delete alert"
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
