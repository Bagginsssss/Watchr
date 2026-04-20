import { useState, useEffect, useMemo } from 'react'
import { fetchMetrics } from '../api/yahoo.js'
import { MARKETS } from '../data/stocks.js'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { formatNum } from '../utils/format.js'
import { supabase, supabaseReady } from '../lib/supabase.js'

/* ── Hardcoded Canadian Dividend Calendar ──────────────────────────── */
const DIVIDEND_CALENDAR = [
  { symbol: 'RY.TO', name: 'Royal Bank of Canada', yield: 3.2, rate: 1.42, months: [2, 5, 8, 11], frequency: 'Quarterly' },
  { symbol: 'TD.TO', name: 'TD Bank', yield: 3.8, rate: 1.02, months: [1, 4, 7, 10], frequency: 'Quarterly' },
  { symbol: 'ENB.TO', name: 'Enbridge', yield: 6.5, rate: 0.915, months: [3, 6, 9, 12], frequency: 'Quarterly' },
  { symbol: 'BCE.TO', name: 'BCE', yield: 5.1, rate: 0.9975, months: [1, 4, 7, 10], frequency: 'Quarterly' },
  { symbol: 'T.TO', name: 'TELUS', yield: 5.8, rate: 0.3891, months: [1, 4, 7, 10], frequency: 'Quarterly' },
  { symbol: 'BMO.TO', name: 'Bank of Montreal', yield: 4.2, rate: 1.55, months: [2, 5, 8, 11], frequency: 'Quarterly' },
  { symbol: 'BNS.TO', name: 'Scotiabank', yield: 5.3, rate: 1.06, months: [1, 4, 7, 10], frequency: 'Quarterly' },
  { symbol: 'FTS.TO', name: 'Fortis', yield: 3.8, rate: 0.59, months: [3, 6, 9, 12], frequency: 'Quarterly' },
  { symbol: 'CNQ.TO', name: 'Canadian Natural Resources', yield: 4.1, rate: 0.525, months: [1, 4, 7, 10], frequency: 'Quarterly' },
  { symbol: 'TRP.TO', name: 'TC Energy', yield: 4.5, rate: 0.96, months: [1, 4, 7, 10], frequency: 'Quarterly' },
]

/* ── Calendar Day ─────────────────────────────────────────────────── */
function CalendarDay({ date, isCurrentMonth, isToday, isSelected, events, onDayClick }) {
  const hasEvents = events && events.length > 0
  const dividendCount = events?.filter(e => e.type === 'dividend').length || 0
  const earningsCount = events?.filter(e => e.type === 'earnings').length || 0

  return (
    <div
      onClick={() => onDayClick?.(date, events)}
      style={{
        aspectRatio: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '8px 4px',
        borderRadius: 8,
        border: isSelected ? '2px solid var(--text)' : isToday ? '2px solid var(--green)' : isCurrentMonth ? '1px solid var(--border)' : '1px solid var(--bg-muted)',
        backgroundColor: isSelected ? 'var(--bg-hover)' : isToday ? 'var(--green-bg)' : isCurrentMonth ? 'var(--bg-card)' : 'var(--bg-muted)',
        cursor: hasEvents ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        opacity: isCurrentMonth ? 1 : 0.5,
        fontSize: '12px',
        fontWeight: isToday || isSelected ? 600 : 500,
        color: isToday ? 'var(--green)' : 'var(--text)',
      }}

    >
      <span>{date.getDate()}</span>
      {hasEvents && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {dividendCount > 0 && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--green)',
              }}
            />
          )}
          {earningsCount > 0 && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#3B82F6',
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

/* ── Month Navigation & Calendar Grid ─────────────────────────────── */
function MonthCalendar({ selectedMonth, setSelectedMonth, events, onDayClick, selectedDate }) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const firstDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)
  const lastDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0)
  const prevLastDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 0)

  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - firstDay.getDay())

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weeks = []
  let currentDate = new Date(startDate)
  while (weeks.length < 6) {
    const week = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
    weeks.push(week)
  }

  const getEventsForDate = (date) => {
    return (events || []).filter(e => {
      const eDate = new Date(e.date)
      return eDate.getFullYear() === date.getFullYear() &&
             eDate.getMonth() === date.getMonth() &&
             eDate.getDate() === date.getDate()
    })
  }

  const handlePrevMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '24px',
        marginBottom: '24px',
      }}
    >
      {/* Month Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <button
          onClick={handlePrevMonth}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
        >
          ← Prev
        </button>

        <h2
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          {monthNames[selectedMonth.getMonth()]} {selectedMonth.getFullYear()}
        </h2>

        <button
          onClick={handleNextMonth}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
        >
          Next →
        </button>
      </div>

      {/* Day Names */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        {dayNames.map(day => (
          <div
            key={day}
            style={{
              textAlign: 'center',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              padding: '8px 0',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div
        className="calendar-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
        }}
      >
        {weeks.map((week, weekIdx) =>
          week.map((date, dayIdx) => (
            <CalendarDay
              key={`${weekIdx}-${dayIdx}`}
              date={date}
              isCurrentMonth={date.getMonth() === selectedMonth.getMonth()}
              isToday={date.getTime() === today.getTime()}
              isSelected={selectedDate && date.toDateString() === selectedDate.toDateString()}
              events={getEventsForDate(date)}
              onDayClick={onDayClick}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ── Event Card ───────────────────────────────────────────────────── */
function EventCard({ event, isDark }) {
  const isEarnings = event.type === 'earnings'
  const icon = isEarnings ? '📊' : '💰'
  const bgColor = isEarnings ? '#3B82F615' : 'var(--green-bg)'
  const accentColor = isEarnings ? '#3B82F6' : 'var(--green)'

  const dateStr = new Date(event.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${accentColor}33`,
        borderRadius: 10,
        padding: '16px',
        marginBottom: '12px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        animation: 'slideInLeft 0.3s ease-out',
      }}
    >
      <div
        style={{
          fontSize: '24px',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: accentColor,
            }}
          >
            {event.symbol}
          </span>
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            {event.name}
          </span>
        </div>

        <div
          style={{
            fontSize: '13px',
            color: 'var(--text)',
            marginBottom: '8px',
          }}
        >
          {dateStr}
        </div>

        {event.type === 'dividend' && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <span>
              <strong>Yield:</strong> {event.yield?.toFixed(2) ?? '—'}%
            </span>
            <span>
              <strong>Per Share:</strong> ${event.rate?.toFixed(4) ?? '—'}
            </span>
            {event.exDivDate && (
              <span>
                <strong>Ex-Date:</strong> {new Date(event.exDivDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {event.payDate && (
              <span>
                <strong>Pay Date:</strong> {new Date(event.payDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        )}

        {event.type === 'earnings' && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            {event.estimated && (
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#F59E0B22', color: '#F59E0B', fontWeight: 600 }}>
                Est.
              </span>
            )}
            {event.eps !== undefined && (
              <span>
                <strong>EPS:</strong> ${event.eps.toFixed(2)}
              </span>
            )}
            {event.expectedEps != null && (
              <span>
                <strong>Fwd EPS:</strong> ${event.expectedEps.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expected payout — right side, prominent */}
      {event.type === 'dividend' && event.shares > 0 && event.expectedPayout > 0 && (
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--brand)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.2px' }}>
            ${event.expectedPayout.toFixed(2)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{event.shares} shares</div>
        </div>
      )}
    </div>
  )
}

/* ── Dividend Summary Card ────────────────────────────────────────── */
function DividendSummary({ events, currency, convert, sym }) {
  const dividendsByStock = useMemo(() => {
    const map = {}
    events
      .filter(e => e.type === 'dividend' && e.isInPortfolio)
      .forEach(e => {
        const native = e.market === 'TSX' ? 'CAD' : 'USD'
        if (!map[e.symbol]) {
          map[e.symbol] = {
            name: e.name,
            shares: e.shares ?? 0,
            rate: e.rate,
            yield: e.yield,
            native,
            count: 0,
            total: 0,
          }
        }
        map[e.symbol].count += 1
        map[e.symbol].total += e.expectedPayout ?? 0
      })
    return map
  }, [events])

  const totalExpected = useMemo(() => {
    return Object.values(dividendsByStock).reduce((sum, stock) => {
      return sum + convert(stock.total, stock.native)
    }, 0)
  }, [dividendsByStock, convert])

  const portfolioDividends = Object.entries(dividendsByStock).filter(([, v]) => v.shares > 0)

  return (
    <div
      style={{
        backgroundColor: 'var(--green-bg)',
        border: '1px solid var(--green)',
        borderRadius: 12,
        padding: '20px',
        marginBottom: '24px',
      }}
    >
      <h3
        style={{
          margin: '0 0 16px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--green)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        💰 Dividend Summary
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            Total Expected Income
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--green)',
            }}
          >
            {sym}{formatNum(totalExpected, 2)}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            Total Dividend Events
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--green)',
            }}
          >
            {events.filter(e => e.type === 'dividend').length}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            Stocks Paying
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--green)',
            }}
          >
            {Object.keys(dividendsByStock).length}
          </div>
        </div>
      </div>

      {portfolioDividends.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: '12px',
            }}
          >
            Your Portfolio Dividend Income
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {portfolioDividends.map(([symbol, data]) => {
              const clean = symbol.replace('.TO', '').replace('.NE', '').replace('.V', '')
              return (
                <div
                  key={symbol}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--text)' }}>{clean}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {data.shares} shares · {data.count} payment{data.count !== 1 ? 's' : ''}{data.yield > 0 ? ` · ${data.yield.toFixed(1)}% yield` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                    ${data.rate?.toFixed(2)}/payment
                  </div>
                  <div style={{ color: 'var(--green)', fontWeight: 700, textAlign: 'right', minWidth: 70 }}>
                    {sym}{formatNum(convert(data.total, data.native), 2)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {portfolioDividends.length === 0 && Object.keys(dividendsByStock).length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          Add dividend stocks to your portfolio to see expected income.
        </div>
      )}
    </div>
  )
}

/* ── Main Calendar Tab Component ──────────────────────────────────── */
export default function CalendarTab({ user }) {
  const { isDark } = useTheme()
  const { currency, convert, sym } = useCurrency()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [filterType, setFilterType] = useState('all')
  const [filterMarket, setFilterMarket] = useState('all')
  const [allEvents, setAllEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [holdings, setHoldings] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedDateEvents, setSelectedDateEvents] = useState([])

  /* Load portfolio holdings from Supabase + fetch dividend data from Yahoo */
  useEffect(() => {
    const loadCalendarData = async () => {
      try {
        setLoading(true)
        const events = []
        const now = new Date()
        const year = now.getFullYear()

        // 1. Load portfolio holdings from Supabase (if logged in)
        let portfolioHoldings = []
        if (user && supabaseReady) {
          const { data } = await supabase
            .from('holdings')
            .select('*')
            .eq('user_id', user.id)
          if (data) portfolioHoldings = data
        }
        setHoldings(portfolioHoldings)

        // 2. Only show stocks the user actually owns
        const holdingSymbols = new Set(portfolioHoldings.map(h => h.symbol))
        const allStockSymbols = new Set(portfolioHoldings.map(h => h.symbol))

        // 3. Fetch real dividend data from Yahoo Finance for all stocks
        const symbolsToFetch = [...allStockSymbols]
        const metricsResults = await Promise.allSettled(
          symbolsToFetch.map(sym => fetchMetrics(sym))
        )

        // Build metrics lookup
        const metricsMap = {}
        symbolsToFetch.forEach((sym, i) => {
          if (metricsResults[i].status === 'fulfilled') {
            metricsMap[sym] = metricsResults[i].value
          }
        })

        // 4. Generate dividend events for portfolio stocks
        for (const sym of allStockSymbols) {
          const metrics = metricsMap[sym]
          const holding = portfolioHoldings.find(h => h.symbol === sym)
          const hardcoded = DIVIDEND_CALENDAR.find(d => d.symbol === sym)
          const shares = holding?.shares ?? 0
          const isInPortfolio = holdingSymbols.has(sym)

          // Get dividend rate from Yahoo or hardcoded fallback
          const divRate = metrics?.dividendRate ?? hardcoded?.rate ?? 0
          const divYield = metrics?.dividendYield ? metrics.dividendYield * 100 : (hardcoded?.yield ?? 0)
          const stockName = holding?.name ?? hardcoded?.name ?? sym

          if (divRate <= 0 && divYield <= 0) continue // Skip non-dividend stocks

          // Determine payment months from hardcoded data or assume quarterly
          const months = hardcoded?.months ?? [1, 4, 7, 10]
          const frequency = hardcoded?.frequency ?? 'Quarterly'
          const perPayment = divRate / (months.length > 0 ? months.length : 4)

          // Generate dividend events for 12 months forward
          for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
            const monthNum = (now.getMonth() + monthIdx) % 12
            const eventYear = year + Math.floor((now.getMonth() + monthIdx) / 12)

            if (months.includes(monthNum + 1)) {
              const eventDate = new Date(eventYear, monthNum, 15)
              const exDivDate = new Date(eventDate)
              exDivDate.setDate(exDivDate.getDate() - 10)
              const payDate = new Date(eventDate)
              payDate.setDate(payDate.getDate() + 15)

              events.push({
                type: 'dividend',
                date: eventDate,
                exDivDate,
                payDate,
                symbol: sym,
                name: stockName,
                yield: divYield,
                rate: perPayment,
                shares,
                expectedPayout: shares > 0 ? perPayment * shares : null,
                isInPortfolio,
                frequency,
                market: sym.endsWith('.TO') || sym.endsWith('.NE') || sym.endsWith('.V') ? 'TSX' : 'US',
              })
            }
          }

          // Add earnings event if we have EPS data
          if (metrics?.trailingEps != null) {
            // Approximate next earnings ~90 days from now (quarterly)
            const earningsDate = new Date(now)
            // Use a deterministic offset based on symbol hash to spread events
            const hash = sym.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
            earningsDate.setDate(earningsDate.getDate() + (hash % 90) + 10)

            events.push({
              type: 'earnings',
              estimated: true,
              date: earningsDate,
              symbol: sym,
              name: stockName,
              eps: metrics.trailingEps,
              expectedEps: metrics.forwardEps ?? null,
              surprise: (metrics.forwardEps && metrics.trailingEps)
                ? ((metrics.forwardEps - metrics.trailingEps) / Math.abs(metrics.trailingEps) * 100)
                : null,
              isInPortfolio,
              market: sym.endsWith('.TO') || sym.endsWith('.NE') || sym.endsWith('.V') ? 'TSX' : 'US',
            })
          }
        }

        setAllEvents(events.sort((a, b) => a.date - b.date))
      } catch (err) {
        console.error('Error loading calendar events:', err)
      } finally {
        setLoading(false)
      }
    }

    loadCalendarData()
  }, [user])

  /* Filter events */
  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      if (filterType === 'dividends' && event.type !== 'dividend') return false
      if (filterType === 'earnings' && event.type !== 'earnings') return false
      if (filterMarket !== 'all' && event.market !== filterMarket) return false
      return true
    })
  }, [allEvents, filterType, filterMarket])

  /* Upcoming events (next 30 days) */
  const upcomingEvents = useMemo(() => {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    return filteredEvents.filter(e => e.date >= now && e.date <= thirtyDaysFromNow)
  }, [filteredEvents])

  /* Events for the currently selected month only */
  const monthEvents = useMemo(() => {
    const m = selectedMonth.getMonth()
    const y = selectedMonth.getFullYear()
    return filteredEvents.filter(e => e.date.getMonth() === m && e.date.getFullYear() === y)
  }, [filteredEvents, selectedMonth])

  /* CSS Keyframes for animations */
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes slideInLeft {
        from {
          opacity: 0;
          transform: translateX(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @media (max-width: 768px) {
        .calendar-grid {
          grid-template-columns: repeat(7, 1fr) !important;
        }
      }
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div>
        <h1
          style={{
            margin: '0 0 8px 0',
            fontSize: '28px',
            fontWeight: 700,
            color: 'var(--text)',
          }}
        >
          📅 Earnings & Dividend Calendar
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            color: 'var(--text-secondary)',
          }}
        >
          Track dividend payments and earnings releases for your portfolio
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '16px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}
        >
          Filter:
        </span>

        {['all', 'dividends', 'earnings'].map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: 6,
              border: filterType === type ? '1px solid var(--text)' : '1px solid var(--border)',
              backgroundColor: filterType === type ? 'var(--bg-hover)' : 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {type === 'all' && 'All Events'}
            {type === 'dividends' && '💰 Dividends'}
            {type === 'earnings' && '📊 Earnings'}
          </button>
        ))}

        <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)' }} />

        {['all', 'TSX', 'US'].map(market => (
          <button
            key={market}
            onClick={() => setFilterMarket(market)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: 6,
              border: filterMarket === market ? '1px solid var(--text)' : '1px solid var(--border)',
              backgroundColor: filterMarket === market ? 'var(--bg-hover)' : 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {market === 'all' ? 'All Markets' : market}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        {/* Left Column: Calendar + Summary */}
        <div>
          <MonthCalendar
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            events={filteredEvents}
            selectedDate={selectedDate}
            onDayClick={(date, events) => {
              if (events && events.length > 0) {
                setSelectedDate(date)
                setSelectedDateEvents(events)
              } else {
                setSelectedDate(null)
                setSelectedDateEvents([])
              }
            }}
          />

          {/* Selected date detail */}
          {selectedDate && selectedDateEvents.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 16, marginTop: 12, marginBottom: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                <button onClick={() => { setSelectedDate(null); setSelectedDateEvents([]) }}
                  style={{ background: 'var(--bg-muted)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {selectedDateEvents.map((event, i) => {
                  const isDividend = event.type === 'dividend'
                  const color = isDividend ? '#0A7C5C' : '#3B82F6'
                  const clean = event.symbol.replace('.TO', '').replace('.NE', '').replace('.V', '')
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                      borderBottom: i < selectedDateEvents.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${color}15`, fontSize: 16, flexShrink: 0,
                      }}>
                        {isDividend ? '💰' : '📊'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          {clean} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>{event.name}</span>
                        </div>
                        {isDividend && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            ${event.rate?.toFixed(4)}/share · {event.yield?.toFixed(1)}% yield
                          </div>
                        )}
                        {!isDividend && event.eps != null && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            EPS: ${event.eps.toFixed(2)}{event.expectedEps != null && ` · Est: $${event.expectedEps.toFixed(2)}`}
                          </div>
                        )}
                      </div>
                      {/* Expected payout — big and prominent */}
                      {isDividend && event.shares > 0 ? (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--brand)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.2px' }}>
                            ${event.expectedPayout?.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{event.shares} shares</div>
                        </div>
                      ) : (
                        <div style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                          background: `${color}15`, color, flexShrink: 0,
                        }}>
                          {isDividend ? 'Dividend' : 'Earnings'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {filterType !== 'earnings' && (
            <>
              {/* Annual Dividend Total */}
              {(() => {
                const year = selectedMonth.getFullYear()
                const yearEvents = allEvents.filter(e => e.type === 'dividend' && e.date.getFullYear() === year && e.isInPortfolio && e.expectedPayout > 0)
                const annualTotal = yearEvents.reduce((sum, e) => {
                  const native = e.market === 'TSX' ? 'CAD' : 'USD'
                  return sum + convert(e.expectedPayout, native)
                }, 0)
                if (annualTotal <= 0) return null
                const monthlyAvg = annualTotal / 12
                return (
                  <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: 20, marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {year} Fiscal Year Dividend Income
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#0A7C5C', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {sym}{formatNum(annualTotal, 2)}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        ~{sym}{formatNum(monthlyAvg, 2)}/mo
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      From {yearEvents.length} dividend payment{yearEvents.length !== 1 ? 's' : ''} across your portfolio
                    </div>
                  </div>
                )
              })()}
              <DividendSummary
                events={monthEvents}
                currency={currency}
                convert={convert}
                sym={sym}
              />
            </>
          )}
        </div>

        {/* Right Column: Upcoming Events */}
        <div>
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '24px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              📌 Upcoming Events (30 days)
            </h3>

            {loading ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                Loading events...
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                No upcoming events in the next 30 days
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0px',
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
              >
                {upcomingEvents.map((event, idx) => (
                  <EventCard
                    key={`${event.symbol}-${event.date.getTime()}`}
                    event={event}
                    isDark={isDark}
                  />
                ))}
              </div>
            )}
          </div>

          {/* All Events List */}
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '24px',
              marginTop: '24px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              📊 {selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Events
            </h3>

            {monthEvents.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                No events this month. Navigate to a different month or add dividend stocks to your portfolio.
              </div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {monthEvents.map((event, idx) => (
                  <EventCard
                    key={`${event.symbol}-${event.date.getTime()}`}
                    event={event}
                    isDark={isDark}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
