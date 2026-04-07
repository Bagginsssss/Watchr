/**
 * Reusable empty state with icon, message, and optional CTA button.
 */
export default function EmptyState({ icon, title, description, actionLabel, onAction, compact = false }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: compact ? '24px 16px' : '48px 24px',
    }}>
      {icon && <div style={{ fontSize: compact ? 32 : 48, marginBottom: compact ? 8 : 16, opacity: 0.6 }}>{icon}</div>}
      <div style={{
        fontSize: compact ? 14 : 18, fontWeight: 600, color: 'var(--text)',
        marginBottom: compact ? 4 : 8,
      }}>
        {title}
      </div>
      {description && (
        <div style={{
          fontSize: compact ? 12 : 13, color: 'var(--text-muted)',
          maxWidth: 320, margin: '0 auto',
          lineHeight: 1.5,
        }}>
          {description}
        </div>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: compact ? 12 : 20,
            padding: compact ? '8px 16px' : '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: '#0A7C5C',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
