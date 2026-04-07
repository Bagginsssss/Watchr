import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import MarketBar from './components/MarketBar.jsx'
const DashboardTab = lazy(() => import('./tabs/DashboardTab.jsx'))
const StocksTab = lazy(() => import('./tabs/StocksTab.jsx'))
const CryptoTab = lazy(() => import('./tabs/CryptoTab.jsx'))
const PortfolioTab = lazy(() => import('./tabs/PortfolioTab.jsx'))
const ResearchTab = lazy(() => import('./tabs/ResearchTab.jsx'))
const ScreenerTab = lazy(() => import('./tabs/ScreenerTab.jsx'))
const CalendarTab = lazy(() => import('./tabs/CalendarTab.jsx'))
import ErrorBoundary from './components/ErrorBoundary.jsx'
import AuthModal from './components/AuthModal.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import NotificationCenter from './components/NotificationCenter.jsx'
import { useAlerts } from './hooks/useAlerts.js'
import { supabase, supabaseReady } from './lib/supabase.js'
import { CurrencyProvider, useCurrency, WORLD_CURRENCIES } from './context/CurrencyContext.jsx'
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js'

const TABS = [
  { id: 'dashboard', label: 'Home' },
  { id: 'stocks',    label: 'Stocks' },
  { id: 'crypto',    label: 'Crypto' },
  { id: 'screener',  label: 'Screener' },
  { id: 'calendar',  label: 'Calendar' },
  { id: 'research',  label: 'Research' },
  { id: 'portfolio', label: 'Portfolio' },
]

const TAB_IDS = TABS.map(t => t.id)

function AppContent() {
  const { currency, setCurrency } = useCurrency()
  const { isDark, toggle: toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('activeTab')
    return saved && TAB_IDS.includes(saved) ? saved : 'dashboard'
  })
  const [user, setUser] = useState(null)
  const [username, setUsername] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [showPalette, setShowPalette] = useState(false)

  // Price alerts
  const { alerts, activeCount, triggeredCount, createAlert, deleteAlert, clearTriggered, checkAlerts } = useAlerts(user)

  // Listen for tab-switch events from DashboardTab quick actions
  useEffect(() => {
    function handleTabSwitch(e) {
      const tab = e.detail?.tab
      if (tab && TAB_IDS.includes(tab)) {
        setActiveTab(tab)
        localStorage.setItem('activeTab', tab)
      }
    }
    window.addEventListener('watchr:switch-tab', handleTabSwitch)
    return () => window.removeEventListener('watchr:switch-tab', handleTabSwitch)
  }, [])

  // Keyboard shortcuts
  const shortcuts = useMemo(() => ({
    'cmd+k': () => setShowPalette(true),
    'Escape': () => { setShowPalette(false); setShowAuth(false) },
    '1': () => { setActiveTab('dashboard'); localStorage.setItem('activeTab', 'dashboard') },
    '2': () => { setActiveTab('stocks'); localStorage.setItem('activeTab', 'stocks') },
    '3': () => { setActiveTab('crypto'); localStorage.setItem('activeTab', 'crypto') },
    '4': () => { setActiveTab('screener'); localStorage.setItem('activeTab', 'screener') },
    '5': () => { setActiveTab('calendar'); localStorage.setItem('activeTab', 'calendar') },
    '6': () => { setActiveTab('research'); localStorage.setItem('activeTab', 'research') },
    '7': () => { if (user) { setActiveTab('portfolio'); localStorage.setItem('activeTab', 'portfolio') } },
  }), [user])
  useKeyboardShortcuts(shortcuts)

  async function fetchUsername(userId) {
    if (!supabaseReady || !userId) return
    const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle()
    setUsername(data?.username ?? '')
  }

  useEffect(() => {
    if (!supabaseReady) return
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      if (u) fetchUsername(u.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) { fetchUsername(u.id); setShowAuth(false) }
      else setUsername('')
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    setUsername('')
  }

  function switchTab(tabId) {
    if ((tabId === 'portfolio' || tabId === 'research') && !user) {
      setShowAuth(true)
      return
    }
    setActiveTab(tabId)
    localStorage.setItem('activeTab', tabId)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)', position: 'fixed', inset: 0, maxWidth: '100vw' }}>

      <MarketBar />

      {/* Nav bar */}
      <div className="nav-bar" style={{
        borderBottom: '1px solid var(--border)',
        height: 52,
        flexShrink: 0,
        background: 'var(--bg-card)',
      }}>
        <div className="nav-container" style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 48px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div className="nav-left" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <div
              onClick={() => switchTab('dashboard')}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                userSelect: 'none',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }}>
                <rect width="28" height="28" rx="7" fill="#0A7C5C" />
                <path d="M6 18L10.5 13L14 16L22 8" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18 8H22V12" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="brand-text" style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text)',
                letterSpacing: '-0.8px',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Watch<span style={{ color: '#0A7C5C' }}>r</span>
              </span>
            </div>
            <nav className="nav-tabs" style={{ display: 'flex', gap: 0 }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid var(--text)' : '2px solid transparent',
                    color: activeTab === tab.id ? 'var(--text)' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: activeTab === tab.id ? 500 : 400,
                    padding: '0 12px',
                    cursor: 'pointer',
                    height: 52,
                    marginBottom: -1,
                    transition: 'color 0.15s',
                    letterSpacing: '-0.1px',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--text)' }}
                  onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="nav-controls" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Search button */}
            <button
              onClick={() => setShowPalette(true)}
              aria-label="Search stocks and crypto"
              title="Search (⌘K)"
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, height: 32,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px',
                cursor: 'pointer', fontSize: 12,
                color: 'var(--text-secondary)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <span style={{ fontSize: 13 }}>🔍</span>
              <span className="search-label">Search</span>
              <kbd style={{
                padding: '1px 4px', borderRadius: 3, fontSize: 10,
                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                marginLeft: 4,
              }}>⌘K</kbd>
            </button>

            {/* Currency selector */}
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              aria-label="Select display currency"
              className="currency-select"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text)',
                fontSize: 12,
                fontWeight: 500,
                padding: '5px 28px 5px 10px',
                cursor: 'pointer',
                outline: 'none',
                height: 32,
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23B0B0A8'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                minWidth: 80,
                letterSpacing: 0.3,
              }}
            >
              {WORLD_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>

            {/* Notification center */}
            {user && (
              <NotificationCenter alerts={alerts} activeCount={activeCount} triggeredCount={triggeredCount}
                onDelete={deleteAlert} onClearTriggered={clearTriggered} />
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 16,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              {isDark ? '\u2600\uFE0F' : '\u{1F319}'}
            </button>

            {/* Auth controls */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {username && (
                  <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'var(--text)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 500, color: '#FFFFFF',
                    }}>
                      {username[0].toUpperCase()}
                    </div>
                    <span className="username-text" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>@{username}</span>
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '6px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    height: 34,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                style={{
                  background: 'var(--text)',
                  border: 'none',
                  borderRadius: 4,
                  color: 'var(--bg)',
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '0 24px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  height: 36,
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="content-area" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <ErrorBoundary>
        <Suspense fallback={<div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>}>
          <div key={activeTab} className="fade-in content-inner" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 48px', height: '100%' }}>
            {activeTab === 'dashboard'  && <DashboardTab user={user} alerts={alerts} />}
            {activeTab === 'stocks'     && <StocksTab user={user} username={username} onRequestAuth={() => setShowAuth(true)} onCreateAlert={createAlert} checkAlerts={checkAlerts} />}
            {activeTab === 'crypto'     && <CryptoTab />}
            {activeTab === 'screener'   && <ScreenerTab />}
            {activeTab === 'calendar'   && <CalendarTab user={user} />}
            {activeTab === 'portfolio'  && <PortfolioTab user={user} />}
            {activeTab === 'research'   && <ResearchTab />}
          </div>
        </Suspense>
        </ErrorBoundary>
      </div>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {[
          { id: 'dashboard', icon: '📊', label: 'Home' },
          { id: 'stocks',    icon: '📈', label: 'Stocks' },
          { id: 'portfolio', icon: '💼', label: 'Portfolio' },
          { id: 'research',  icon: '🔬', label: 'Research' },
          { id: 'crypto',    icon: '₿',  label: 'Crypto' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`bottom-nav-item${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => switchTab(tab.id)}
          >
            <span className="bottom-nav-icon">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'portfolio' && triggeredCount > 0 && (
              <span className="bottom-nav-badge">{triggeredCount}</span>
            )}
          </button>
        ))}
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onResearch={(symbol, name) => {
          setShowPalette(false)
          setActiveTab('research')
          localStorage.setItem('activeTab', 'research')
          sessionStorage.setItem('research_symbol', symbol)
          sessionStorage.setItem('research_name', name || symbol)
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <CurrencyProvider>
        <AppContent />
      </CurrencyProvider>
    </ThemeProvider>
  )
}
