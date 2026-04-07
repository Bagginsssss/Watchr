import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 24px', textAlign: 'center', minHeight: 300,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 400, marginBottom: 20, lineHeight: 1.5 }}>
            This section encountered an error. Try refreshing the page or switching tabs.
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1px solid #0A7C5C', background: 'transparent',
              color: '#0A7C5C', cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0A7C5C'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#0A7C5C' }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
