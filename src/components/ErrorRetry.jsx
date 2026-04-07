/**
 * Reusable error state with retry button.
 * Use compact mode for inline/card errors, full mode for section-level errors.
 */
export default function ErrorRetry({ message, onRetry, compact = false }) {
  if (compact) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderRadius: 8,
        background: 'var(--bg-muted)', fontSize: 12,
        color: 'var(--text-secondary)',
      }}>
        <span style={{ color: '#C0392B' }}>⚠</span>
        <span>{message || 'Failed to load'}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              border: 'none', background: 'var(--bg-card)',
              color: 'var(--green)', cursor: 'pointer',
              padding: '2px 8px', borderRadius: 4, fontSize: 11,
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, padding: 32,
      borderRadius: 12, background: 'var(--bg-card)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 28, opacity: 0.6 }}>⚠️</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
        {message || 'Something went wrong'}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            border: '1px solid var(--green)',
            background: 'transparent',
            color: 'var(--green)', cursor: 'pointer',
            padding: '8px 20px', borderRadius: 8,
            fontSize: 13, fontWeight: 600,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.target.style.background = 'var(--green)'; e.target.style.color = '#fff' }}
          onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--green)' }}
        >
          Try again
        </button>
      )}
    </div>
  )
}
