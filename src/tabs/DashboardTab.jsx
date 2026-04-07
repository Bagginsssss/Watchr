import { useState, useEffect, useCallback, useMemo } from 'react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { fetchQuote, fetchHistory, fetchNews } from '../api/yahoo.js'
import { MARKET_INDICES } from '../data/stocks.js'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { supabase, supabaseReady } from '../lib/supabase.js'
import { formatMarketCap, formatVolume, formatPct, timeAgo } from '../utils/format.js'

/* ────────────────────────────────────────────────────────────────────
   Tiny Sparkline Component
   ──────────────────────────────────────────────────────────────────── */
function Sparkline({ data, width = 60, height = 24, color = '#0A7C5C' }) {
  try {
    if (!data || data.length < 2) return <div style={{ width, height }} />
    const closes = data.map(d => typeof d === 'number' ? d : d?.close).filter(c => c != null && isFinite(c))
    if (closes.length < 2) return <div style={{ width, height }} />

    const min = Math.min(...closes)
    const max = Math.max(...closes)
    const range = max - min || 1
    const pad = 1

    const points = closes.map((c, i) => {
      const x = pad + (i / (closes.length - 1)) * (width - pad * 2)
      const y = pad + (1 - (c - min) / range) * (height - pad * 2)
      return `${x},${y}`
    }).join(' ')

    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  } catch {
    return <div style={{ width, height }} />
  }
}

/* ────────────────────────────────────────────────────────────────────
   Loading Skeleton
   ──────────────────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px',
      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      minHeight: 120,
    }} />
  )
}

/* ────────────────────────────────────────────────────────────────────
   Market Overview - Index Cards
   ──────────────────────────────────────────────────────────────────── */
function MarketOverview() {
  const { convert, sym } = useCurrency()
  const [indices, setIndices] = useState([])
  const [loading, setLoading] = useState(true)
  const [sparkData, setSparkData] = useState({})

  useEffect(() => {
    let cancelled = false

    const loadIndices = async () => {
      try {
        const data = await Promise.all(
          MARKET_INDICES.map(async (idx) => {
            try {
              const quote = await fetchQuote(idx.symbol)
              const historyData = await fetchHistory(idx.symbol, '5d', '1d')
              if (!cancelled) {
                setSparkData(prev => ({ ...prev, [idx.symbol]: historyData }))
              }
              return {
                ...idx,
                price: quote.price,
                prevClose: quote.prevClose,
                currency: quote.currency,
              }
            } catch (err) {
              console.warn(`Failed to load ${idx.symbol}:`, err)
              return null
            }
          })
        )
        if (!cancelled) {
          setIndices(data.filter(Boolean))
          setLoading(false)
        }
      } catch (err) {
        console.error('Market overview error:', err)
        if (!cancelled) setLoading(false)
      }
    }

    loadIndices()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Market Overview
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {indices.map(idx => {
          const changePct = (idx.price - idx.prevClose) / idx.prevClose
          const isUp = changePct >= 0
          const displayPrice = convert(idx.price, idx.currency)
          const color = isUp ? 'var(--green)' : 'var(--red)'
          const bgColor = isUp ? 'var(--green-bg)' : 'var(--red-bg)'

          return (
            <div
              key={idx.symbol}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                animation: 'fadeInUp 0.5s ease-out forwards',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {idx.name}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                {sym}{displayPrice?.toFixed(2) ?? '—'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color,
                  background: bgColor,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}>
                  {isUp ? '↑' : '↓'} {formatPct(changePct)}
                </div>
                <Sparkline
                  data={sparkData[idx.symbol] || []}
                  width={50}
                  height={20}
                  color={color}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Portfolio Snapshot
   ──────────────────────────────────────────────────────────────────── */
function PortfolioSnapshot({ user }) {
  const { convert, sym } = useCurrency()
  const [portfolio, setPortfolio] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(!!user)

  useEffect(() => {
    if (!user || !supabaseReady) return

    let cancelled = false

    const loadPortfolio = async () => {
      try {
        // Load holdings
        const { data: holdings, error: hError } = await supabase
          .from('holdings')
          .select('*')
          .eq('user_id', user.id)

        if (hError) throw hError

        // Load portfolio snapshots for chart
        const { data: shots, error: sError } = await supabase
          .from('portfolio_snapshots')
          .select('*')
          .eq('user_id', user.id)
          .order('snapshot_date', { ascending: true })
          .limit(30)

        if (sError) throw sError

        // Calculate portfolio value from holdings
        if (holdings && holdings.length > 0) {
          let totalValue = 0
          let totalCost = 0
          let dailyPL = 0

          await Promise.all(holdings.map(async (h) => {
            try {
              const q = await fetchQuote(h.symbol)
              const shares = h.shares || 0
              const avgCost = h.avg_cost || 0
              const currentValue = q.price * shares
              const costValue = avgCost * shares
              totalValue += currentValue
              totalCost += costValue
              // Daily change: (price - prevClose) * shares
              if (q.prevClose) {
                dailyPL += (q.price - q.prevClose) * shares
              }
            } catch (err) {
              console.warn(`Failed to load quote for ${h.symbol}:`, err)
            }
          }))

          const totalPL = totalValue - totalCost

          if (!cancelled) {
            setPortfolio({
              totalValue,
              totalPL,
              dailyPL,
              dailyPLPct: totalValue > 0 ? (dailyPL / (totalValue - dailyPL)) * 100 : 0,
            })
          }
        }

        if (!cancelled) {
          const chartData = (shots || []).map(s => ({
            date: new Date(s.snapshot_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
            value: s.total_value || 0,
          }))
          setSnapshots(chartData.slice(-14))
          setLoading(false)
        }
      } catch (err) {
        console.error('Portfolio load error:', err)
        if (!cancelled) setLoading(false)
      }
    }

    loadPortfolio()
    return () => { cancelled = true }
  }, [user])

  if (!user) return null
  if (loading) return <SkeletonCard />

  if (!portfolio) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        marginBottom: 32,
      }}>
        <p>No holdings yet. Add stocks to get started!</p>
      </div>
    )
  }

  const displayValue = convert(portfolio.totalValue, 'USD')
  const displayPL = convert(portfolio.totalPL, 'USD')
  const isUp = portfolio.totalPL >= 0

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '24px',
      marginBottom: 32,
      animation: 'fadeInUp 0.6s ease-out forwards',
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Portfolio Snapshot
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Total Value
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
            {sym}{displayValue?.toFixed(2) ?? '0.00'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Overall P&L
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: isUp ? 'var(--green)' : 'var(--red)' }}>
            {isUp ? '+' : ''}{sym}{displayPL?.toFixed(2) ?? '0.00'}
          </div>
          <div style={{ fontSize: 12, color: isUp ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
            {isUp ? '↑' : '↓'} {formatPct((portfolio.totalValue - portfolio.totalPL) > 0 ? portfolio.totalPL / (portfolio.totalValue - portfolio.totalPL) : 0)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Daily Change
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: portfolio.dailyPL >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {portfolio.dailyPL >= 0 ? '+' : ''}{sym}{convert(Math.abs(portfolio.dailyPL), 'USD')?.toFixed(2) ?? '0.00'}
          </div>
          <div style={{ fontSize: 12, color: portfolio.dailyPL >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
            {portfolio.dailyPL >= 0 ? '↑' : '↓'} {Math.abs(portfolio.dailyPLPct).toFixed(2)}%
          </div>
        </div>
      </div>
      {snapshots.length > 1 && (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={snapshots} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6 }}
              cursor={{ stroke: 'var(--border-hover)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--green)"
              fill="url(#portfolioGradient)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Top Movers in Watchlist
   ──────────────────────────────────────────────────────────────────── */
function TopMovers() {
  const { convert, sym } = useCurrency()
  const [movers, setMovers] = useState({ gainers: [], losers: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadMovers = async () => {
      try {
        const watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]')
        if (watchlist.length === 0) {
          if (!cancelled) setLoading(false)
          return
        }

        const data = await Promise.all(
          watchlist.map(async (item) => {
            try {
              const q = await fetchQuote(item.symbol)
              const changePct = (q.price - q.prevClose) / q.prevClose
              return {
                symbol: item.symbol,
                name: item.name,
                price: q.price,
                changePct,
                currency: q.currency,
              }
            } catch (err) {
              return null
            }
          })
        )

        const valid = data.filter(Boolean)
        const sorted = valid.sort((a, b) => b.changePct - a.changePct)

        if (!cancelled) {
          setMovers({
            gainers: sorted.slice(0, 5),
            losers: sorted.slice(-5).reverse(),
          })
          setLoading(false)
        }
      } catch (err) {
        console.error('Movers load error:', err)
        if (!cancelled) setLoading(false)
      }
    }

    loadMovers()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Top Movers
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 3 }).map((_, j) => <SkeletonCard key={j} />)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (movers.gainers.length === 0 && movers.losers.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        marginBottom: 32,
      }}>
        <p>Add stocks to your watchlist to see top movers.</p>
      </div>
    )
  }

  const MoverItem = ({ item, isGainer }) => {
    const color = isGainer ? 'var(--green)' : 'var(--red)'
    const bgColor = isGainer ? 'var(--green-bg)' : 'var(--red-bg)'
    const displayPrice = convert(item.price, item.currency)

    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        animation: 'fadeInUp 0.5s ease-out forwards',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {item.symbol.replace(/\.TO$/, '')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {item.name}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {sym}{displayPrice?.toFixed(2) ?? '—'}
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color,
            background: bgColor,
            padding: '2px 6px',
            borderRadius: 4,
            display: 'inline-block',
            marginTop: 4,
          }}>
            {isGainer ? '↑' : '↓'} {formatPct(item.changePct)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Top Movers
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Top Gainers
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {movers.gainers.map(item => (
              <MoverItem key={item.symbol} item={item} isGainer />
            ))}
            {movers.gainers.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: '12px' }}>
                No data
              </div>
            )}
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Top Losers
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {movers.losers.map(item => (
              <MoverItem key={item.symbol} item={item} isGainer={false} />
            ))}
            {movers.losers.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: '12px' }}>
                No data
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Active Alerts
   ──────────────────────────────────────────────────────────────────── */
function ActiveAlerts({ alerts = [] }) {
  const activeAlerts = useMemo(
    () => alerts.filter(a => a.status === 'active' || a.triggered),
    [alerts]
  )

  if (activeAlerts.length === 0) return null

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Active Alerts
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {activeAlerts.slice(0, 6).map((alert, i) => (
          <div
            key={alert.id || i}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${alert.triggered ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 10,
              padding: '14px',
              animation: 'fadeInUp 0.5s ease-out forwards',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>
                {alert.triggered ? '🔔' : '🔕'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {alert.symbol}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {alert.alertType === 'above' ? 'Price above' : 'Price below'}
                </div>
              </div>
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 4,
            }}>
              ${alert.targetPrice?.toFixed(2) ?? '—'}
            </div>
            <div style={{
              fontSize: 10,
              color: alert.triggered ? 'var(--red)' : 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: 600,
            }}>
              {alert.triggered ? 'TRIGGERED' : 'WATCHING'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Market News Feed
   ──────────────────────────────────────────────────────────────────── */
function MarketNews() {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadNews = async () => {
      try {
        // Fetch from multiple sources for better coverage
        const [tsxNews, spNews, marketNews] = await Promise.all([
          fetchNews('^GSPTSE').catch(() => []),
          fetchNews('SPY').catch(() => []),
          fetchNews('market').catch(() => []),
        ])
        if (!cancelled) {
          // Merge, deduplicate by title, prioritize ones with thumbnails
          const seen = new Set()
          const all = [...tsxNews, ...spNews, ...marketNews].filter(a => {
            if (!a.title || seen.has(a.title)) return false
            seen.add(a.title)
            return true
          })
          // Sort: articles with thumbnails first
          all.sort((a, b) => (b.thumbnail ? 1 : 0) - (a.thumbnail ? 1 : 0))
          setNews(all.slice(0, 8))
          setLoading(false)
        }
      } catch (err) {
        console.error('News load error:', err)
        if (!cancelled) setLoading(false)
      }
    }

    loadNews()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Market News
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Market News
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {news.map((article, i) => (
          <a
            key={i}
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '14px',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              transition: 'all 0.2s ease',
              animation: 'fadeInUp 0.5s ease-out forwards',
              cursor: 'pointer',
            }}

          >
            {article.thumbnail && (
              <img
                src={article.thumbnail}
                alt=""
                style={{
                  width: '100%',
                  height: 140,
                  objectFit: 'cover',
                  borderRadius: 6,
                  background: 'var(--bg-muted)',
                }}
              />
            )}
            <div>
              <h4 style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                lineHeight: '1.4',
                marginBottom: 6,
              }}>
                {article.title}
              </h4>
              <div style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>{article.publisher}</span>
                <span>{timeAgo(article.time)}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Quick Actions Bar
   ──────────────────────────────────────────────────────────────────── */
function QuickActions() {
  const switchTab = (tab) => {
    window.dispatchEvent(new CustomEvent('watchr:switch-tab', { detail: { tab } }))
  }

  const handleAddToWatchlist = () => switchTab('stocks')
  const handleSetAlert = () => switchTab('stocks')
  const handleScreenStocks = () => switchTab('screener')
  const handleViewPortfolio = () => switchTab('portfolio')

  const ActionButton = ({ label, onClick, icon }) => (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '12px 16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        color: 'var(--text)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}

    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      {label}
    </button>
  )

  return (
    <div style={{ marginBottom: 0 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Quick Actions
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <ActionButton icon="+" label="Add to Watchlist" onClick={handleAddToWatchlist} />
        <ActionButton icon="🔔" label="Set Alert" onClick={handleSetAlert} />
        <ActionButton icon="🔍" label="Screen Stocks" onClick={handleScreenStocks} />
        <ActionButton icon="📊" label="View Portfolio" onClick={handleViewPortfolio} />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Main DashboardTab Component
   ──────────────────────────────────────────────────────────────────── */
export default function DashboardTab({ user = null, alerts = [] }) {
  const { isDark } = useTheme()

  return (
    <div style={{
      padding: '24px',
      maxWidth: 1400,
      margin: '0 auto',
      background: 'var(--bg)',
      minHeight: '100vh',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: 6,
        }}>
          {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
        </h1>
        <p style={{
          fontSize: 14,
          color: 'var(--text-secondary)',
        }}>
          {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Market Overview */}
      <MarketOverview />

      {/* Portfolio Snapshot */}
      {user && <PortfolioSnapshot user={user} />}

      {/* Top Movers */}
      <TopMovers />

      {/* Active Alerts */}
      <ActiveAlerts alerts={alerts} />

      {/* Market News */}
      <MarketNews />

      {/* Quick Actions */}
      <QuickActions />

      {/* CSS Animations (injected as style) */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        @media (max-width: 768px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
