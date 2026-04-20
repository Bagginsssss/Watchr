import { useState, useRef, useEffect } from 'react'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function AlertIcon({ direction, triggered }) {
  if (triggered) return (
    <div style={{
      width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,124,92,0.1)', fontSize: 16,
    }}>✓</div>
  )
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: direction === 'above' ? 'rgba(10,124,92,0.1)' : 'rgba(192,57,43,0.1)',
      fontSize: 16,
    }}>
      {direction === 'above' ? '↑' : '↓'}
    </div>
  )
}

export default function NotificationCenter({ alerts, activeCount, triggeredCount, onDelete, onClearTriggered }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('active')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeAlerts = alerts.filter(a => !a.triggered)
  const triggeredAlerts = alerts.filter(a => a.triggered)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${activeCount ? ` (${activeCount} active)` : ''}${triggeredCount ? ` (${triggeredCount} triggered)` : ''}`}
        style={{
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 8, width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 16, position: 'relative',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.borderColor = 'var(--border-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {(activeCount > 0 || triggeredCount > 0) && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 18, height: 18, borderRadius: 9,
            background: triggeredCount > 0 ? '#EF4444' : '#0A7C5C',
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '2px solid var(--bg-card)',
          }}>
            {triggeredCount > 0 ? triggeredCount : activeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="modal-panel notification-dropdown" style={{
          position: 'absolute', top: 44, right: 0,
          width: 380, maxHeight: 520, overflowY: 'auto',
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
          zIndex: 200,
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Notifications</div>
            {triggeredAlerts.length > 0 && (
              <button onClick={onClearTriggered}
                style={{
                  background: 'none', border: 'none', color: '#0A7C5C',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                }}>
                Clear all
              </button>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', padding: '0 20px', gap: 0, borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'active', label: 'Active', count: activeCount },
              { id: 'triggered', label: 'Triggered', count: triggeredCount },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 16px', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                  color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
                  borderBottom: tab === t.id ? '2px solid var(--text)' : '2px solid transparent',
                  marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {t.label}
                {t.count > 0 && (
                  <span style={{
                    background: t.id === 'triggered' ? 'rgba(192,57,43,0.1)' : 'rgba(10,124,92,0.1)',
                    color: t.id === 'triggered' ? '#EF4444' : '#0A7C5C',
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                  }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Alert list */}
          <div style={{ padding: '4px 0' }}>
            {tab === 'active' && activeAlerts.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>No active alerts</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Click the alert button on any stock to set a price target.
                </div>
              </div>
            )}

            {tab === 'triggered' && triggeredAlerts.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No triggered alerts yet.</div>
              </div>
            )}

            {(tab === 'active' ? activeAlerts : triggeredAlerts).map(alert => {
              const symbol = alert.symbol.replace('.TO', '').replace('.NE', '').replace('.V', '').replace('.L', '')
              const targetPrice = Number(alert.target_price).toFixed(2)
              const isTriggered = alert.triggered

              return (
                <div key={alert.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 20px', transition: 'background 0.1s',
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <AlertIcon direction={alert.direction} triggered={isTriggered} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{symbol}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: alert.direction === 'above' ? 'rgba(10,124,92,0.08)' : 'rgba(192,57,43,0.08)',
                        color: alert.direction === 'above' ? '#0A7C5C' : '#EF4444',
                        textTransform: 'uppercase',
                      }}>
                        {alert.direction} ${targetPrice}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {alert.name}
                      <span style={{ margin: '0 4px' }}>·</span>
                      {isTriggered
                        ? <span style={{ color: '#0A7C5C' }}>Triggered {timeAgo(alert.triggered_at)}</span>
                        : <span>Created {timeAgo(alert.created_at)}</span>
                      }
                    </div>
                    {alert.notify_email && !isTriggered && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <path d="M22 7l-10 7L2 7" />
                        </svg>
                        Email notification on
                      </div>
                    )}
                  </div>

                  <button onClick={() => onDelete(alert.id)}
                    title="Delete alert"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', padding: 6, borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(192,57,43,0.08)'; e.currentTarget.style.color = '#EF4444' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
