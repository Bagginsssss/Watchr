import { timeAgo } from '../utils/format.js'

export default function NewsFeed({ news, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="skeleton" style={{ width: '90%', height: 13, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: '55%', height: 13, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 100, height: 10 }} />
          </div>
        ))}
      </div>
    )
  }
  if (!news?.length) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0' }}>No news found.</div>
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
        Latest News
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {news.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: 'none',
              display: 'block',
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--text)',
              lineHeight: 1.5,
              marginBottom: 4,
              textDecoration: 'none',
            }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              {item.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {item.publisher}
              {item.time ? ` · ${timeAgo(item.time)}` : ''}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
