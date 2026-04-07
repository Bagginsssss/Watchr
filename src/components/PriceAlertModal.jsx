import { useState } from 'react'

export default function PriceAlertModal({ symbol, name, currentPrice, onClose, onCreate, userEmail }) {
  const [targetPrice, setTargetPrice] = useState(currentPrice?.toFixed(2) ?? '')
  const [direction, setDirection] = useState('above')
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [saving, setSaving] = useState(false)

  const cleanSymbol = symbol?.replace('.TO', '').replace('.NE', '').replace('.V', '').replace('.L', '')
  const target = parseFloat(targetPrice)
  const isValid = target > 0 && target !== currentPrice
  const pctDiff = (currentPrice && target > 0) ? (((target - currentPrice) / currentPrice) * 100) : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setSaving(true)
    await onCreate({ symbol, name, targetPrice: target, direction, notifyEmail })
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)',
      }}>
      <div className="modal-panel" onClick={e => e.stopPropagation()} style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 9999, width: '100%', maxWidth: 420,
        background: 'var(--bg-card)', borderRadius: 16,
        border: '1px solid var(--border)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        <div className="sheet-handle" />
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
              Set Price Alert
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Get notified when {cleanSymbol} hits your target
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--bg-muted)', border: 'none', borderRadius: 8,
            width: 32, height: 32, cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-muted)'}
          >×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px' }}>
          {/* Stock info */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderRadius: 10, background: 'var(--bg-muted)',
            marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{cleanSymbol}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'Georgia, serif' }}>
                ${currentPrice?.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Current price</div>
            </div>
          </div>

          {/* Direction toggle */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Alert when price goes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { val: 'above', label: 'Above', icon: '↑', color: '#0A7C5C', bg: 'rgba(10,124,92,0.06)' },
                { val: 'below', label: 'Below', icon: '↓', color: '#C0392B', bg: 'rgba(192,57,43,0.06)' },
              ].map(opt => (
                <button key={opt.val} type="button" onClick={() => setDirection(opt.val)}
                  style={{
                    padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                    border: direction === opt.val ? `2px solid ${opt.color}` : '2px solid var(--border)',
                    background: direction === opt.val ? opt.bg : 'var(--bg-card)',
                    color: direction === opt.val ? opt.color : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: direction === opt.val ? opt.color : 'var(--bg-muted)',
                    color: direction === opt.val ? '#fff' : 'var(--text-muted)',
                    fontSize: 16, fontWeight: 700,
                  }}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target price */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Target price
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                fontSize: 18, color: 'var(--text-muted)', fontFamily: 'Georgia, serif',
              }}>$</span>
              <input
                type="number" step="0.01" min="0.01" required
                inputMode="decimal"
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                style={{
                  width: '100%', padding: '14px 16px 14px 32px', borderRadius: 10,
                  border: '2px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text)', fontSize: 20, fontFamily: 'Georgia, serif',
                  fontWeight: 600, outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#0A7C5C'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            {pctDiff != null && target > 0 && (
              <div style={{
                fontSize: 12, marginTop: 6, color: pctDiff >= 0 ? '#0A7C5C' : '#C0392B', fontWeight: 500,
              }}>
                {pctDiff >= 0 ? '+' : ''}{pctDiff.toFixed(1)}% from current price
              </div>
            )}
          </div>

          {/* Email notification toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderRadius: 10, background: 'var(--bg-muted)',
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Email notification</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {userEmail || 'Sign in to enable'}
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setNotifyEmail(!notifyEmail)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: notifyEmail ? '#0A7C5C' : 'var(--border)',
                position: 'relative', transition: 'background 0.2s',
              }}>
              <div style={{
                width: 20, height: 20, borderRadius: 10, background: '#fff',
                position: 'absolute', top: 2,
                left: notifyEmail ? 22 : 2,
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>

          {/* Submit */}
          <button type="submit" disabled={saving || !isValid}
            style={{
              width: '100%', padding: '14px', borderRadius: 10, fontSize: 14,
              fontWeight: 700, border: 'none',
              cursor: saving || !isValid ? 'not-allowed' : 'pointer',
              background: isValid ? '#0A7C5C' : 'var(--border)',
              color: isValid ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
              letterSpacing: '-0.2px',
            }}
            onMouseEnter={e => { if (isValid) e.currentTarget.style.background = '#08664B' }}
            onMouseLeave={e => { if (isValid) e.currentTarget.style.background = '#0A7C5C' }}
          >
            {saving ? 'Setting alert...' : `Alert when ${direction} $${targetPrice || '0.00'}`}
          </button>
        </form>
      </div>
      </div>
    </>
  )
}
