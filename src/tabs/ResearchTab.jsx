import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts'
import ChartDragOverlay from '../components/ChartDragOverlay.jsx'
import { apiUrl } from '../lib/apiBase.js'

const AVATAR_COLORS = ['var(--text)','#0A7C5C','#3A5A8A','#7A4040','#6B4F8A','#8B6914','#2D6A4F','#5A3080']

function ResearchLogo({ symbol, name, size = 40 }) {
  const upper = (symbol ?? '').toUpperCase()
  const clean = upper.replace(/\.(TO|NE|V|CN|L|DE|T)$/i, '').replace(/-[A-Z]$/, '')
  const [failed, setFailed] = useState(false)
  const letter = (clean?.[0] ?? '?').toUpperCase()
  const bg = AVATAR_COLORS[clean.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]

  if (!failed) {
    return (
      <img
        src={`https://financialmodelingprep.com/image-stock/${upper}.png`}
        alt={name}
        onError={() => setFailed(true)}
        style={{
          width: size, height: size, borderRadius: 6,
          objectFit: 'contain', background: 'var(--bg-card)',
          padding: 4, flexShrink: 0, boxSizing: 'border-box',
          border: '1px solid var(--border)',
        }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 500, color: '#FFFFFF', flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}
import { searchSymbol, fetchMetrics, fetchNews } from '../api/yahoo.js'

// ── API ────────────────────────────────────────────────────────────────────────
async function fetchLiveQuote(symbol) {
  const res = await fetch(apiUrl(`/finance/v8/finance/chart/${symbol}?interval=1d&range=1d`))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const r = json.chart?.result?.[0]
  if (!r) throw new Error('No data returned')
  const m = r.meta
  const price = m.regularMarketPrice
  const prev  = m.chartPreviousClose ?? m.previousClose ?? price
  return {
    price, prev,
    change:      price - prev,
    changePct:   prev ? ((price - prev) / prev) * 100 : 0,
    currency:    m.currency ?? 'USD',
    exchange:    m.fullExchangeName ?? m.exchangeName ?? '',
    marketState: m.marketState,
    name:        m.shortName ?? symbol,
    volume:      m.regularMarketVolume,
  }
}

async function fetchFullFundamentals(symbol) {
  const mods = [
    'summaryDetail,defaultKeyStatistics,financialData,price,assetProfile',
    'incomeStatementHistory,incomeStatementHistoryQuarterly',
    'balanceSheetHistory,balanceSheetHistoryQuarterly',
    'cashflowStatementHistory,cashflowStatementHistoryQuarterly',
    'recommendationTrend,upgradeDowngradeHistory',
  ].join(',')
  const res = await fetch(apiUrl(`/finance/v10/finance/quoteSummary/${symbol}?modules=${mods}`))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.quoteSummary?.result?.[0] ?? {}
}

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmtMktCap(v) {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toLocaleString()}`
}

function fmtBig(v) {
  if (v == null) return '—'
  const abs  = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(0)}M`
  return `${sign}$${abs.toLocaleString()}`
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - (typeof ts === 'number' && ts < 2e10 ? ts * 1000 : new Date(ts).getTime())
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Skel({ w = '100%', h = 13 }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: 3 }} />
}

// ── Overview Tab ───────────────────────────────────────────────────────────────
function OverviewTab({ metrics, fundamentals, loading }) {
  const ap = fundamentals?.assetProfile ?? {}
  const sd = fundamentals?.summaryDetail ?? {}
  const ks = fundamentals?.defaultKeyStatistics ?? {}
  const fd = fundamentals?.financialData ?? {}
  const pr = fundamentals?.price ?? {}

  const description = ap.longBusinessSummary ?? null
  const sector      = ap.sector   ?? pr.sector   ?? null
  const industry    = ap.industry ?? pr.industry ?? null
  const employees   = ap.fullTimeEmployees
  const website     = ap.website

  const stats = [
    { label: 'P/E (TTM)',    val: (sd.trailingPE?.raw ?? ks.trailingPE?.raw ?? metrics?.trailingPE)?.toFixed(1) ?? '—' },
    { label: 'Fwd P/E',     val: (sd.forwardPE?.raw  ?? ks.forwardPE?.raw  ?? metrics?.forwardPE)?.toFixed(1)  ?? '—' },
    { label: 'EPS (TTM)',   val: ks.trailingEps?.raw  != null ? `$${ks.trailingEps.raw.toFixed(2)}`  : metrics?.eps != null ? `$${metrics.eps.toFixed(2)}` : '—' },
    { label: 'Market Cap',  val: fmtMktCap(pr.marketCap?.raw ?? metrics?.marketCap) },
    { label: 'Revenue',     val: fmtBig(fd.totalRevenue?.raw) },
    { label: 'Rev Growth',  val: fd.revenueGrowth?.raw != null  ? `${fd.revenueGrowth.raw  >= 0 ? '+' : ''}${(fd.revenueGrowth.raw  * 100).toFixed(1)}%` : metrics?.revenueGrowth != null ? `${metrics.revenueGrowth >= 0 ? '+' : ''}${(metrics.revenueGrowth * 100).toFixed(1)}%` : '—' },
    { label: 'Gross Margin',val: fd.grossMargins?.raw  != null  ? `${(fd.grossMargins.raw   * 100).toFixed(1)}%` : metrics?.grossMargin  != null ? `${(metrics.grossMargin  * 100).toFixed(1)}%` : '—' },
    { label: 'Net Margin',  val: fd.profitMargins?.raw != null  ? `${(fd.profitMargins.raw  * 100).toFixed(1)}%` : metrics?.profitMargin != null ? `${(metrics.profitMargin * 100).toFixed(1)}%` : '—' },
    { label: 'Div Yield',   val: (sd.dividendYield?.raw ?? metrics?.dividendYield) > 0 ? `${((sd.dividendYield?.raw ?? metrics?.dividendYield) * 100).toFixed(2)}%` : 'None' },
    { label: 'Beta',        val: (sd.beta?.raw ?? ks.beta?.raw ?? metrics?.beta)?.toFixed(2) ?? '—' },
    { label: 'P/B Ratio',   val: (ks.priceToBook?.raw ?? metrics?.priceToBook)?.toFixed(2) ?? '—' },
    { label: '52W High',    val: sd.fiftyTwoWeekHigh?.raw != null ? `$${sd.fiftyTwoWeekHigh.raw.toFixed(2)}` : metrics?.high52w != null ? `$${metrics.high52w.toFixed(2)}` : '—' },
    { label: '52W Low',     val: sd.fiftyTwoWeekLow?.raw  != null ? `$${sd.fiftyTwoWeekLow.raw.toFixed(2)}`  : metrics?.low52w  != null ? `$${metrics.low52w.toFixed(2)}`  : '—' },
    { label: 'Short Ratio', val: (ks.shortRatio?.raw ?? metrics?.shortRatio)?.toFixed(1) ?? '—' },
    { label: 'Book Value',  val: ks.bookValue?.raw != null ? `$${ks.bookValue.raw.toFixed(2)}` : metrics?.bookValue != null ? `$${metrics.bookValue.toFixed(2)}` : '—' },
    { label: 'Employees',   val: employees != null ? employees.toLocaleString() : '—' },
  ]

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Skel h={80} />
      <div className="research-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {Array.from({ length: 16 }).map((_, i) => <Skel key={i} h={54} />)}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {sector && <span style={{ fontSize: 11, background: 'var(--bg-hover)', borderRadius: 4, padding: '3px 10px', color: 'var(--text-secondary)' }}>{sector}</span>}
        {industry && industry !== sector && <span style={{ fontSize: 11, background: 'var(--bg-hover)', borderRadius: 4, padding: '3px 10px', color: 'var(--text-secondary)' }}>{industry}</span>}
        {website && (
          <a href={website} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: 'var(--text)', textDecoration: 'none', marginLeft: 2 }}
            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
          >{website.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗</a>
        )}
      </div>

      {/* Business description */}
      {description && (
        <div style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>About</div>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8, margin: 0 }}>
            {description.length > 700 ? description.slice(0, 700) + '…' : description}
          </p>
        </div>
      )}

      {/* Key stats */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Key Statistics</div>
        <div className="stagger research-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {stats.map(({ label, val }) => (
            <div key={label} className="card-hover" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Financials Tab ─────────────────────────────────────────────────────────────
function FinancialsTab({ fundamentals, loading }) {
  const [period, setPeriod] = useState('annual')

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: 6 }).map((_, i) => <Skel key={i} h={40} />)}
    </div>
  )

  const incomeA  = fundamentals?.incomeStatementHistory?.incomeStatementHistory ?? []
  const incomeQ  = fundamentals?.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? []
  const balanceA = fundamentals?.balanceSheetHistory?.balanceSheetHistory ?? []
  const balanceQ = fundamentals?.balanceSheetHistoryQuarterly?.balanceSheetHistory ?? []
  const cashA    = fundamentals?.cashflowStatementHistory?.cashflowStatementHistory ?? []
  const cashQ    = fundamentals?.cashflowStatementHistoryQuarterly?.cashflowStatementHistory ?? []

  const incomeH  = period === 'annual' ? incomeA : incomeQ
  const balanceH = period === 'annual' ? balanceA : balanceQ
  const cashH    = period === 'annual' ? cashA : cashQ

  if (!incomeA.length && !incomeQ.length && !balanceA.length && !balanceQ.length) {
    return <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '24px 0' }}>No financial statement data available for this ticker.</div>
  }

  function pct(curr, prev) {
    if (curr == null || prev == null || prev === 0) return null
    return ((curr - prev) / Math.abs(prev)) * 100
  }

  function fmtV(v) {
    if (v == null) return '—'
    if (v === 0) return '$0'
    const abs = Math.abs(v), sign = v < 0 ? '-' : ''
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`
    if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(1)}B`
    if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(0)}M`
    if (abs >= 1e3)  return `${sign}$${(abs / 1e3).toFixed(1)}K`
    if (abs >= 1)    return `${sign}$${v.toFixed(2)}`
    return `${sign}$${v.toFixed(4)}`
  }

  const dateKey = period === 'annual' ? 'fmt' : 'fmt'
  const headers = incomeH.slice(0, 4).map(r => {
    const d = r.endDate?.fmt
    if (!d) return '?'
    return period === 'annual' ? d.slice(0, 4) : new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  })
  const cols = headers.length

  function Table({ title, rows }) {
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>
        <div className="financials-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `200px repeat(${cols}, 1fr)`, background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Metric</div>
            {headers.map((y, i) => (
              <div key={i} style={{ padding: '8px 14px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.3 }}>{y}</div>
            ))}
          </div>
          {rows.map(({ label, vals, inverse }, ri) => (
            <div key={label} style={{
              display: 'grid', gridTemplateColumns: `200px repeat(${cols}, 1fr)`,
              borderBottom: ri < rows.length - 1 ? '1px solid var(--border)' : 'none',
              background: ri % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-muted)',
            }}>
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>{label}</div>
              {Array.from({ length: cols }).map((_, i) => {
                const v   = vals[i] ?? null
                const chg = pct(vals[i], vals[i + 1])
                const bad  = chg != null && (inverse ? chg > 10  : chg < -10)
                const good = chg != null && (inverse ? chg < -10 : chg > 10)
                return (
                  <div key={i} style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: v == null ? 'var(--text-muted)' : 'var(--text)' }}>{fmtV(v)}</div>
                    {i < cols - 1 && chg != null && (
                      <div style={{ fontSize: 11, color: bad ? '#EF4444' : good ? '#0A7C5C' : 'var(--text-secondary)', marginTop: 1 }}>
                        {chg >= 0 ? '+' : ''}{chg.toFixed(1)}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Annual / Quarterly toggle */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--bg-hover)', borderRadius: 6, padding: 2, width: 'fit-content' }}>
        {[{ key: 'annual', label: 'Annual' }, { key: 'quarterly', label: 'Quarterly' }].map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            style={{
              background: period === p.key ? 'var(--bg-card)' : 'transparent',
              border: 'none', borderRadius: 4,
              color: period === p.key ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 600, padding: '6px 16px', cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: period === p.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >{p.label}</button>
        ))}
      </div>

      {incomeH.length > 0 && <Table title="Income Statement" rows={[
        { label: 'Total Revenue',       vals: incomeH.slice(0, 4).map(r => r.totalRevenue?.raw) },
        { label: 'Cost of Revenue',     vals: incomeH.slice(0, 4).map(r => r.costOfRevenue?.raw), inverse: true },
        { label: 'Gross Profit',        vals: incomeH.slice(0, 4).map(r => r.grossProfit?.raw) },
        { label: 'Operating Expenses',  vals: incomeH.slice(0, 4).map(r => r.totalOperatingExpenses?.raw ?? r.operatingExpense?.raw), inverse: true },
        { label: 'Operating Income',    vals: incomeH.slice(0, 4).map(r => r.operatingIncome?.raw) },
        { label: 'Interest Expense',    vals: incomeH.slice(0, 4).map(r => r.interestExpense?.raw), inverse: true },
        { label: 'Income Before Tax',   vals: incomeH.slice(0, 4).map(r => r.incomeBeforeTax?.raw) },
        { label: 'Income Tax',          vals: incomeH.slice(0, 4).map(r => r.incomeTaxExpense?.raw), inverse: true },
        { label: 'Net Income',          vals: incomeH.slice(0, 4).map(r => r.netIncome?.raw) },
        { label: 'EPS (Basic)',         vals: incomeH.slice(0, 4).map(r => r.basicEPS?.raw) },
        { label: 'EPS (Diluted)',       vals: incomeH.slice(0, 4).map(r => r.dilutedEPS?.raw) },
        { label: 'EBITDA',             vals: incomeH.slice(0, 4).map(r => r.ebitda?.raw) },
      ]} />}
      {balanceH.length > 0 && <Table title="Balance Sheet" rows={[
        { label: 'Cash & Equivalents',   vals: balanceH.slice(0, 4).map(r => r.cash?.raw ?? r.cashAndCashEquivalents?.raw) },
        { label: 'Short-term Investments', vals: balanceH.slice(0, 4).map(r => r.shortTermInvestments?.raw) },
        { label: 'Net Receivables',      vals: balanceH.slice(0, 4).map(r => r.netReceivables?.raw) },
        { label: 'Inventory',            vals: balanceH.slice(0, 4).map(r => r.inventory?.raw) },
        { label: 'Total Current Assets', vals: balanceH.slice(0, 4).map(r => r.totalCurrentAssets?.raw) },
        { label: 'Total Assets',         vals: balanceH.slice(0, 4).map(r => r.totalAssets?.raw) },
        { label: 'Current Liabilities',  vals: balanceH.slice(0, 4).map(r => r.totalCurrentLiabilities?.raw), inverse: true },
        { label: 'Long-term Debt',       vals: balanceH.slice(0, 4).map(r => r.longTermDebt?.raw), inverse: true },
        { label: 'Total Liabilities',    vals: balanceH.slice(0, 4).map(r => r.totalLiab?.raw), inverse: true },
        { label: 'Stockholder Equity',   vals: balanceH.slice(0, 4).map(r => r.totalStockholderEquity?.raw) },
        { label: 'Retained Earnings',    vals: balanceH.slice(0, 4).map(r => r.retainedEarnings?.raw) },
      ]} />}
      {cashH.length > 0 && <Table title="Cash Flow" rows={[
        { label: 'Operating CF',         vals: cashH.slice(0, 4).map(r => r.totalCashFromOperatingActivities?.raw) },
        { label: 'Capital Expenditures',  vals: cashH.slice(0, 4).map(r => r.capitalExpenditures?.raw), inverse: true },
        { label: 'Free Cash Flow',       vals: cashH.slice(0, 4).map(r => {
            const ocf = r.totalCashFromOperatingActivities?.raw
            const cap = r.capitalExpenditures?.raw ?? 0
            return ocf != null ? ocf + cap : null
          }),
        },
        { label: 'Investing CF',         vals: cashH.slice(0, 4).map(r => r.totalCashflowsFromInvestingActivities?.raw) },
        { label: 'Financing CF',         vals: cashH.slice(0, 4).map(r => r.totalCashFromFinancingActivities?.raw) },
        { label: 'Dividends Paid',       vals: cashH.slice(0, 4).map(r => r.dividendsPaid?.raw), inverse: true },
        { label: 'Net Change in Cash',   vals: cashH.slice(0, 4).map(r => r.changeInCash?.raw ?? r.netChangeInCash?.raw) },
      ]} />}
    </div>
  )
}

// ── News Tab ───────────────────────────────────────────────────────────────────
function NewsTab({ news, loading }) {
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: 5 }).map((_, i) => <Skel key={i} h={62} />)}
    </div>
  )
  if (!news.length) return (
    <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '24px 0' }}>No news available.</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {news.map((n, i) => (
        <a key={i} href={n.link} target="_blank" rel="noreferrer"
          style={{ display: 'block', padding: '14px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.marginLeft = '-4px'; e.currentTarget.style.paddingLeft = '4px' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.marginLeft = '0'; e.currentTarget.style.paddingLeft = '0' }}
        >
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 6 }}>{n.title}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{n.publisher}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(n.time)}</span>
          </div>
        </a>
      ))}
    </div>
  )
}

// ── Reddit Tab ─────────────────────────────────────────────────────────────────
function RedditTab({ symbol }) {
  const clean = (symbol ?? '').replace(/\.(TO|NE|V|CN)$/i, '').split('.')[0].toUpperCase()
  const cards = [
    { sub: 'r/wallstreetbets', color: '#EF4444', desc: 'High-conviction trades, options plays, and meme stock discussion.' },
    { sub: 'r/stocks',         color: 'var(--text)', desc: 'In-depth DD, fundamentals, and long-term investment discussion.' },
    { sub: 'r/investing',      color: '#0A7C5C', desc: 'Conservative strategies, index funds, and wealth-building.' },
    { sub: 'r/SecurityAnalysis', color: '#B8860B', desc: 'Professional-grade analysis, valuations, and earnings deep-dives.' },
    { sub: 'r/options',        color: 'var(--text-secondary)', desc: 'Options strategies, implied volatility, and Greeks discussion.' },
    { sub: 'Reddit (All)',     color: 'var(--text-secondary)', desc: 'Broad Reddit-wide search for unfiltered community sentiment.' },
  ]
  const urls = [
    `https://www.google.com/search?q=site:reddit.com/r/wallstreetbets+${clean}`,
    `https://www.google.com/search?q=site:reddit.com/r/stocks+${clean}`,
    `https://www.google.com/search?q=site:reddit.com/r/investing+${clean}`,
    `https://www.google.com/search?q=site:reddit.com/r/SecurityAnalysis+${clean}`,
    `https://www.google.com/search?q=site:reddit.com/r/options+${clean}`,
    `https://www.google.com/search?q=site:reddit.com+${clean}+stock+discussion`,
  ]
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, marginTop: 0, lineHeight: 1.6 }}>
        Pre-formatted Google search links to surface Reddit discussions for <strong>{clean}</strong>.
      </p>
      <div className="research-reddit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {cards.map((c, i) => (
          <div key={c.sub} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: c.color }}>{c.sub}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>{c.desc}</div>
            <a href={urls[i]} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', fontSize: 12, color: 'var(--text)', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 12px', textDecoration: 'none', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >Open Search ↗</a>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Analyst Tab ────────────────────────────────────────────────────────────────
function AnalystTab({ fundamentals, metrics, loading }) {
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: 4 }).map((_, i) => <Skel key={i} h={44} />)}
    </div>
  )

  const trend   = fundamentals?.recommendationTrend?.trend?.[0] ?? {}
  const history = (fundamentals?.upgradeDowngradeHistory?.history ?? []).slice(0, 12)
  const fd      = fundamentals?.financialData ?? {}

  const rec        = (fd.recommendationKey ?? metrics?.recommendation ?? '').replace(/_/g, ' ').toUpperCase() || null
  const targetMean = fd.targetMeanPrice?.raw ?? metrics?.targetMeanPrice
  const targetHigh = fd.targetHighPrice?.raw
  const targetLow  = fd.targetLowPrice?.raw

  const strongBuy  = trend.strongBuy  ?? 0
  const buy        = trend.buy        ?? 0
  const hold       = trend.hold       ?? 0
  const sell       = trend.sell       ?? 0
  const strongSell = trend.strongSell ?? 0
  const total      = strongBuy + buy + hold + sell + strongSell

  const REC_COLOR = { 'STRONG BUY': '#0A7C5C', BUY: '#0A7C5C', HOLD: '#B8860B', SELL: '#EF4444', 'STRONG SELL': '#EF4444', OUTPERFORM: '#0A7C5C', UNDERPERFORM: '#EF4444', OVERWEIGHT: '#0A7C5C', UNDERWEIGHT: '#EF4444', NEUTRAL: 'var(--text-secondary)' }
  const recColor = rec ? (REC_COLOR[rec] ?? 'var(--text-secondary)') : 'var(--text-secondary)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div className="research-analyst-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Consensus Rating</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: recColor, marginBottom: 4, letterSpacing: '-0.5px' }}>{rec ?? '—'}</div>
          {total > 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Based on {total} analyst{total !== 1 ? 's' : ''}</div>}
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>Price Targets</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            {[
              { label: 'Low',  val: targetLow,  color: '#EF4444' },
              { label: 'Mean', val: targetMean, color: 'var(--text)', big: true },
              { label: 'High', val: targetHigh, color: '#0A7C5C' },
            ].map(({ label, val, color, big }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: big ? 24 : 18, fontWeight: big ? 600 : 500, fontFamily: 'var(--font-mono)', color, letterSpacing: '-0.3px' }}>
                  {val != null ? `$${val.toFixed(2)}` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {total > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>Rating Breakdown</div>
          {[
            { label: 'Strong Buy',  count: strongBuy,  color: '#0A7C5C' },
            { label: 'Buy',         count: buy,         color: '#34A47C' },
            { label: 'Hold',        count: hold,        color: '#B8860B' },
            { label: 'Sell',        count: sell,        color: '#EF4444' },
            { label: 'Strong Sell', count: strongSell,  color: '#A02020' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', width: 80, flexShrink: 0 }}>{label}</div>
              <div style={{ flex: 1, height: 8, background: 'var(--bg-hover)', borderRadius: 2 }}>
                <div style={{ width: `${total ? (count / total) * 100 : 0}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: 12, color, width: 20, textAlign: 'right' }}>{count}</div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>Recent Upgrades / Downgrades</div>
          {history.map((h, i) => {
            const isUp   = h.action === 'up'
            const isInit = !['up', 'down'].includes(h.action)
            const clr    = isUp ? '#0A7C5C' : isInit ? 'var(--text-secondary)' : '#EF4444'
            const date   = h.epochGradeDate ? new Date(h.epochGradeDate * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 11, color: clr, flexShrink: 0, width: 12 }}>{isUp ? '▲' : isInit ? '◆' : '▼'}</span>
                <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{h.firm}</span>
                {h.fromGrade && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.fromGrade} →</span>}
                <span style={{ fontSize: 12, fontWeight: 500, color: clr }}>{h.toGrade ?? '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{date}</span>
              </div>
            )
          })}
        </div>
      )}

      {!rec && total === 0 && !history.length && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>No analyst data available.</div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
// ── Chart Tab ──────────────────────────────────────────────────────────────
const CHART_RANGES = [
  { label: '1D', range: '1d', interval: '5m' },
  { label: '1W', range: '5d', interval: '30m' },
  { label: '1M', range: '1mo', interval: '1d' },
  { label: '6M', range: '6mo', interval: '1d' },
  { label: '1Y', range: '1y', interval: '1wk' },
  { label: '5Y', range: '5y', interval: '1mo' },
]

function computeRSI(closes, period = 14) {
  const rsi = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { rsi.push(null); continue }
    let gains = 0, losses = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1]
      if (diff > 0) gains += diff; else losses -= diff
    }
    const avgGain = gains / period
    const avgLoss = losses / period
    rsi.push(avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1)))
  }
  return rsi
}

function computeSMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += closes[j]
    return parseFloat((sum / period).toFixed(2))
  })
}

function computeEMA(closes, period) {
  const k = 2 / (period + 1)
  const ema = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { ema.push(null); continue }
    if (i === period - 1) {
      let sum = 0; for (let j = 0; j < period; j++) sum += closes[j]
      ema.push(sum / period); continue
    }
    ema.push(closes[i] * k + ema[i - 1] * (1 - k))
  }
  return ema
}

function computeMACD(closes) {
  const ema12 = computeEMA(closes, 12)
  const ema26 = computeEMA(closes, 26)
  const macd = closes.map((_, i) => (ema12[i] != null && ema26[i] != null) ? parseFloat((ema12[i] - ema26[i]).toFixed(4)) : null)
  const macdVals = macd.filter(v => v != null)
  const signal = computeEMA(macdVals, 9)
  // Align signal with original array
  const signalFull = []
  let si = 0
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] == null) { signalFull.push(null); continue }
    signalFull.push(signal[si] != null ? parseFloat(signal[si].toFixed(4)) : null)
    si++
  }
  const histogram = macd.map((v, i) => (v != null && signalFull[i] != null) ? parseFloat((v - signalFull[i]).toFixed(4)) : null)
  return { macd, signal: signalFull, histogram }
}

function computeBollinger(closes, period = 20, mult = 2) {
  const sma = computeSMA(closes, period)
  return closes.map((_, i) => {
    if (sma[i] == null) return { bbUpper: null, bbMiddle: null, bbLower: null }
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - sma[i]) ** 2
    const std = Math.sqrt(sumSq / period)
    return {
      bbUpper: parseFloat((sma[i] + mult * std).toFixed(2)),
      bbMiddle: sma[i],
      bbLower: parseFloat((sma[i] - mult * std).toFixed(2)),
    }
  })
}

function computeATR(highs, lows, closes, period = 14) {
  const trs = []
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { trs.push(highs[i] - lows[i]); continue }
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])))
  }
  const atr = []
  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) { atr.push(null); continue }
    if (i === period - 1) {
      let sum = 0; for (let j = 0; j < period; j++) sum += trs[j]
      atr.push(sum / period); continue
    }
    atr.push((atr[i - 1] * (period - 1) + trs[i]) / period)
  }
  return atr
}

function ChartTab({ symbol }) {
  const [range, setRange] = useState(CHART_RANGES[3]) // Default 6M for enough data for MACD
  const [rawData, setRawData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    fetch(apiUrl(`/finance/v8/finance/chart/${symbol}?interval=${range.interval}&range=${range.range}`))
      .then(r => r.json())
      .then(json => {
        const result = json.chart?.result?.[0]
        if (!result) { setRawData([]); return }
        const timestamps = result.timestamp ?? []
        const quotes = result.indicators?.quote?.[0] ?? {}
        const closes = quotes.close ?? []
        const volumes = quotes.volume ?? []
        const highs = quotes.high ?? []
        const lows = quotes.low ?? []
        const opens = quotes.open ?? []
        const data = timestamps.map((ts, i) => ({
          date: new Date(ts * 1000).toLocaleDateString('en-US', range.range === '1d' ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' }),
          close: closes[i] != null ? parseFloat(closes[i].toFixed(2)) : null,
          volume: volumes[i] ?? 0,
          high: highs[i] != null ? parseFloat(highs[i].toFixed(2)) : null,
          low: lows[i] != null ? parseFloat(lows[i].toFixed(2)) : null,
          open: opens[i] != null ? parseFloat(opens[i].toFixed(2)) : null,
        })).filter(d => d.close != null)
        setRawData(data)
      })
      .catch(() => setRawData([]))
      .finally(() => setLoading(false))
  }, [symbol, range])

  const [showBB, setShowBB] = useState(true)
  const [showSMA200, setShowSMA200] = useState(false)
  const [showMACD, setShowMACD] = useState(true)

  const chartData = useMemo(() => {
    if (!rawData.length) return []
    const closes = rawData.map(d => d.close)
    const highs = rawData.map(d => d.high ?? d.close)
    const lows = rawData.map(d => d.low ?? d.close)
    const rsi = computeRSI(closes)
    const sma20 = computeSMA(closes, Math.min(20, Math.floor(closes.length / 3)))
    const sma50 = computeSMA(closes, Math.min(50, Math.floor(closes.length / 2)))
    const sma200 = closes.length > 200 ? computeSMA(closes, 200) : closes.map(() => null)
    const bb = computeBollinger(closes, Math.min(20, Math.floor(closes.length / 3)))
    const { macd, signal, histogram } = computeMACD(closes)
    const atr = computeATR(highs, lows, closes)
    return rawData.map((d, i) => ({
      ...d, rsi: rsi[i], sma20: sma20[i], sma50: sma50[i], sma200: sma200[i],
      ...bb[i], macd: macd[i], macdSignal: signal[i], macdHist: histogram[i], atr: atr[i],
    }))
  }, [rawData])

  const firstClose = chartData[0]?.close
  const lastClose = chartData[chartData.length - 1]?.close
  const change = firstClose && lastClose ? lastClose - firstClose : null
  const changePct = change != null && firstClose > 0 ? (change / firstClose) * 100 : null
  const isUp = (change ?? 0) >= 0
  const lineColor = isUp ? '#0A7C5C' : '#EF4444'
  const maxVol = Math.max(...chartData.map(d => d.volume || 0), 1)
  const lastRSI = chartData.filter(d => d.rsi != null).slice(-1)[0]?.rsi
  const avgVol = chartData.length > 0 ? chartData.reduce((s, d) => s + (d.volume || 0), 0) / chartData.length : 0
  const dayHigh = Math.max(...chartData.map(d => d.high ?? 0))
  const dayLow = Math.min(...chartData.filter(d => d.low != null).map(d => d.low))
  const lastATR = chartData.filter(d => d.atr != null).slice(-1)[0]?.atr
  const lastBBUpper = chartData.filter(d => d.bbUpper != null).slice(-1)[0]?.bbUpper
  const lastBBLower = chartData.filter(d => d.bbLower != null).slice(-1)[0]?.bbLower
  const lastMACD = chartData.filter(d => d.macd != null).slice(-1)[0]
  const bbPercentB = (lastClose && lastBBUpper && lastBBLower && lastBBUpper !== lastBBLower)
    ? ((lastClose - lastBBLower) / (lastBBUpper - lastBBLower) * 100).toFixed(1)
    : null
  // 52-week position (only meaningful for 1Y+ ranges)
  const allHighs = chartData.map(d => d.high).filter(Boolean)
  const allLows = chartData.map(d => d.low).filter(Boolean)
  const rangeHigh = allHighs.length ? Math.max(...allHighs) : null
  const rangeLow = allLows.length ? Math.min(...allLows) : null
  const rangePosn = (rangeHigh && rangeLow && rangeHigh !== rangeLow && lastClose)
    ? ((lastClose - rangeLow) / (rangeHigh - rangeLow) * 100).toFixed(0) : null

  const fmtVol = v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : Math.round(v).toLocaleString()

  const metrics = [
    { label: 'Period Change', val: change != null ? `${isUp ? '+' : ''}$${Math.abs(change).toFixed(2)}` : '—', color: isUp ? '#0A7C5C' : '#EF4444' },
    { label: 'Change %', val: changePct != null ? `${isUp ? '+' : ''}${changePct.toFixed(2)}%` : '—', color: isUp ? '#0A7C5C' : '#EF4444' },
    { label: 'RSI (14)', val: lastRSI != null ? lastRSI.toFixed(1) : '—', color: lastRSI > 70 ? '#EF4444' : lastRSI < 30 ? '#0A7C5C' : 'var(--text)' },
    { label: 'ATR (14)', val: lastATR != null ? `$${lastATR.toFixed(2)}` : '—', color: 'var(--text)' },
    { label: 'BB %B', val: bbPercentB != null ? `${bbPercentB}%` : '—', color: bbPercentB > 100 ? '#EF4444' : bbPercentB < 0 ? '#0A7C5C' : 'var(--text)' },
    { label: 'MACD', val: lastMACD?.macd != null ? lastMACD.macd.toFixed(3) : '—', color: lastMACD?.macd >= 0 ? '#0A7C5C' : '#EF4444' },
    { label: 'High', val: dayHigh > 0 ? `$${dayHigh.toFixed(2)}` : '—', color: 'var(--text)' },
    { label: 'Low', val: dayLow < Infinity ? `$${dayLow.toFixed(2)}` : '—', color: 'var(--text)' },
    { label: 'Range Pos.', val: rangePosn != null ? `${rangePosn}%` : '—', color: 'var(--text)' },
    { label: 'Avg Volume', val: fmtVol(avgVol), color: 'var(--text)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Range selector + overlays + change */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-hover)', borderRadius: 6, padding: 2 }}>
          {CHART_RANGES.map(r => (
            <button key={r.label} onClick={() => setRange(r)}
              style={{
                background: range.label === r.label ? 'var(--bg-card)' : 'transparent',
                border: 'none', borderRadius: 4,
                color: range.label === r.label ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: range.label === r.label ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >{r.label}</button>
          ))}
        </div>
        {change != null && !loading && (
          <span style={{
            fontSize: 13, fontWeight: 500, color: lineColor,
            background: isUp ? 'rgba(10,124,92,0.08)' : 'rgba(192,57,43,0.08)',
            padding: '4px 10px', borderRadius: 4,
          }}>
            {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct?.toFixed(2)}%)
          </span>
        )}
      </div>

      {/* Overlay toggles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'bb', label: 'Bollinger Bands', active: showBB, toggle: () => setShowBB(!showBB) },
          { key: 'sma200', label: 'SMA 200', active: showSMA200, toggle: () => {
            if (!showSMA200 && chartData.length < 200) setRange(CHART_RANGES[4]) // Switch to 1Y
            setShowSMA200(!showSMA200)
          }},
          { key: 'macd', label: 'MACD', active: showMACD, toggle: () => {
            if (!showMACD && chartData.length < 35) setRange(CHART_RANGES[3]) // Switch to 6M
            setShowMACD(!showMACD)
          }},
        ].map(o => (
          <button key={o.key} onClick={o.toggle}
            style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500,
              border: o.active ? '1px solid #0A7C5C' : '1px solid var(--border)',
              background: o.active ? 'rgba(10,124,92,0.06)' : 'transparent',
              color: o.active ? '#0A7C5C' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
            {o.active ? '✓ ' : ''}{o.label}
          </button>
        ))}
        {(showSMA200 && chartData.length < 200) && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            SMA 200 needs 1Y+ range
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ width: '100%', height: 280, borderRadius: 6 }} />
          <div className="skeleton" style={{ width: '100%', height: 80, borderRadius: 6 }} />
        </div>
      ) : chartData.length === 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-muted)', borderRadius: 6 }}>
          No chart data available
        </div>
      ) : (
        <>
          {/* Price chart with SMA overlays */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px 8px 8px' }}>
            <ChartDragOverlay data={chartData} dataKey="close" height={280}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="researchPriceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-hover)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={52}
                  tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`} />
                {firstClose && <ReferenceLine y={firstClose} stroke="var(--border)" strokeDasharray="4 4" />}
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  labelStyle={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}
                  formatter={(v, name) => {
                    if (name === 'close') return [`$${v?.toFixed(2)}`, 'Price']
                    if (name === 'sma20') return [`$${v?.toFixed(2)}`, 'SMA 20']
                    if (name === 'sma50') return [`$${v?.toFixed(2)}`, 'SMA 50']
                    return [v, name]
                  }}
                />
                {/* Bollinger Bands */}
                {showBB && (
                  <>
                    <Area type="monotone" dataKey="bbUpper" stroke="rgba(107,79,138,0.3)" strokeWidth={1} fill="none" dot={false} strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="bbLower" stroke="rgba(107,79,138,0.3)" strokeWidth={1} fill="none" dot={false} strokeDasharray="3 3" />
                  </>
                )}
                <Area type="monotone" dataKey="close" stroke={lineColor} strokeWidth={1.5}
                  fill="url(#researchPriceGrad)" dot={false}
                  activeDot={{ r: 4, fill: lineColor, strokeWidth: 2, stroke: '#FFFFFF' }} />
                <Line type="monotone" dataKey="sma20" stroke="#3A5A8A" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="sma50" stroke="#D97706" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                {showSMA200 && <Line type="monotone" dataKey="sma200" stroke="#EF4444" strokeWidth={1.2} dot={false} strokeDasharray="6 3" />}
              </AreaChart>
            </ResponsiveContainer>
            </ChartDragOverlay>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '4px 0', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 2, background: lineColor, display: 'inline-block' }} /> Price
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 2, background: '#3A5A8A', display: 'inline-block', borderTop: '1px dashed #3A5A8A' }} /> SMA 20
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 2, background: '#D97706', display: 'inline-block', borderTop: '1px dashed #D97706' }} /> SMA 50
              </span>
              {showSMA200 && <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 2, background: '#EF4444', display: 'inline-block', borderTop: '1px dashed #EF4444' }} /> SMA 200
              </span>}
              {showBB && <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 2, background: '#6B4F8A', display: 'inline-block', borderTop: '1px dashed #6B4F8A' }} /> Bollinger
              </span>}
            </div>
          </div>

          {/* Volume chart */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 8px 4px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 8, marginBottom: 4 }}>Volume</div>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={false} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={52}
                  tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                  formatter={v => [v?.toLocaleString(), 'Volume']}
                  labelStyle={{ color: 'var(--text-muted)', fontSize: 10 }}
                />
                <Bar dataKey="volume" fill="rgba(10,124,92,0.2)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* RSI chart */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 8px 4px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 8, marginBottom: 4 }}>RSI (14)</div>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={false} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={52} />
                <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="3 3" strokeOpacity={0.4} />
                <ReferenceLine y={30} stroke="#0A7C5C" strokeDasharray="3 3" strokeOpacity={0.4} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                  formatter={v => [v?.toFixed(1), 'RSI']}
                  labelStyle={{ color: 'var(--text-muted)', fontSize: 10 }}
                />
                <Line type="monotone" dataKey="rsi" stroke="#6B4F8A" strokeWidth={1.5} dot={false}
                  activeDot={{ r: 3, fill: '#6B4F8A', strokeWidth: 1.5, stroke: '#FFFFFF' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* MACD chart */}
          {showMACD && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 8px 4px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 8, marginBottom: 4 }}>MACD (12, 26, 9)</div>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={false} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={52}
                    tickFormatter={v => v?.toFixed(2)} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                    formatter={(v, name) => {
                      if (name === 'macdHist') return [v?.toFixed(3), 'Histogram']
                      if (name === 'macd') return [v?.toFixed(3), 'MACD']
                      if (name === 'macdSignal') return [v?.toFixed(3), 'Signal']
                      return [v, name]
                    }}
                    labelStyle={{ color: 'var(--text-muted)', fontSize: 10 }}
                  />
                  <Bar dataKey="macdHist" fill="rgba(10,124,92,0.3)" radius={[1, 1, 0, 0]}
                    shape={(props) => {
                      const { x, y, width, height, payload } = props
                      const val = payload?.macdHist
                      if (val == null || !isFinite(y) || !isFinite(height)) return null
                      return <rect x={x} y={y} width={width} height={Math.max(Math.abs(height), 0.5)}
                        fill={val >= 0 ? 'rgba(10,124,92,0.35)' : 'rgba(192,57,43,0.35)'}
                        rx={1} />
                    }}
                  />
                  <Line type="monotone" dataKey="macd" stroke="#3B82F6" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="macdSignal" stroke="#F59E0B" strokeWidth={1} dot={false} strokeDasharray="3 2" />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '4px 0' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 2, background: '#3B82F6', display: 'inline-block' }} /> MACD
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 2, background: '#F59E0B', display: 'inline-block', borderTop: '1px dashed #F59E0B' }} /> Signal
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'rgba(10,124,92,0.3)', display: 'inline-block', borderRadius: 1 }} /> Histogram
                </span>
              </div>
            </div>
          )}

          {/* Key metrics row */}
          <div className="research-chart-metrics" style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
          }}>
            {metrics.map(({ label, val, color }) => (
              <div key={label} className="card-hover" style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '12px 14px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color }}>{val}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'chart',      label: 'Chart' },
  { id: 'financials', label: 'Financials' },
  { id: 'news',       label: 'News' },
  { id: 'reddit',     label: 'Reddit & Social' },
  { id: 'analyst',    label: 'Analyst' },
]

const HISTORY_LS_KEY = 'research_search_history'
const MAX_HISTORY = 10

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_LS_KEY)) || [] } catch { return [] }
}

function saveToHistory(sym, name) {
  const history = loadHistory().filter(h => h.symbol !== sym)
  history.unshift({ symbol: sym, name, ts: Date.now() })
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(history))
  return history
}

export default function ResearchTab() {
  const [query, setQuery]                   = useState('')
  const [searchResults, setSearchResults]   = useState([])
  const [showDropdown, setShowDropdown]     = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')
  const [activeTab, setActiveTab]           = useState('overview')
  const [symbol, setSymbol]                 = useState('')
  const [quoteData, setQuoteData]           = useState(null)
  const [metricsData, setMetricsData]       = useState(null)
  const [fundamentals, setFundamentals]     = useState(null)
  const [newsData, setNewsData]             = useState([])
  const [searchHistory, setSearchHistory]   = useState(loadHistory)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const debounceRef = useRef(null)

  // Pick up symbol from Command Palette "Research" button
  useEffect(() => {
    const sym = sessionStorage.getItem('research_symbol')
    if (sym) {
      const name = sessionStorage.getItem('research_name') || sym
      sessionStorage.removeItem('research_symbol')
      sessionStorage.removeItem('research_name')
      setQuery(`${sym} — ${name}`)
      setSelectedSymbol(sym)
      loadStock(sym)
    }
  }, [])

  function handleQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    setSelectedSymbol(null)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setSearchResults([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchSymbol(val)
        setSearchResults(res.slice(0, 8))
        setShowDropdown(true)
      } catch { setSearchResults([]) }
    }, 300)
  }

  function handleSelectSymbol(item) {
    setQuery(`${item.symbol} — ${item.name}`)
    setSelectedSymbol(item.symbol)
    setSearchResults([])
    setShowDropdown(false)
  }

  async function loadStock(sym) {
    setLoading(true)
    setError('')
    setQuoteData(null)
    setMetricsData(null)
    setFundamentals(null)
    setNewsData([])
    setSymbol(sym)
    setActiveTab('overview')
    try {
      const [quote, metrics, news, fund] = await Promise.all([
        fetchLiveQuote(sym),
        fetchMetrics(sym).catch(() => null),
        fetchNews(sym).catch(() => []),
        fetchFullFundamentals(sym).catch(() => ({})),
      ])
      setQuoteData(quote)
      setMetricsData(metrics)
      setNewsData(news)
      setFundamentals(fund)
      setSearchHistory(saveToHistory(sym, quote.name ?? sym))
    } catch (err) {
      setError(err.message ?? 'Failed to load data. Check the ticker and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch() {
    const sym = (selectedSymbol ?? query.split('—')[0]).toUpperCase().trim()
    if (!sym) return
    await loadStock(sym)
  }

  const isUp = (quoteData?.changePct ?? 0) >= 0

  return (
    <div style={{ height: 'calc(100vh - 36px - 52px)', overflowY: 'auto' }}>

      {/* Search bar */}
      <div style={{ padding: '16px 0 12px', maxWidth: 640 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Search ticker or company name..."
              value={query}
              onChange={handleQueryChange}
              onFocus={e => { e.target.style.borderColor = 'var(--text)'; if (searchResults.length) setShowDropdown(true) }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; setTimeout(() => setShowDropdown(false), 150) }}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{
                flex: 1, height: 44, background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text)', fontSize: 14,
                padding: '0 14px', outline: 'none', transition: 'border-color 0.15s',
              }}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              style={{
                background: loading || !query.trim() ? 'var(--border)' : 'var(--text)',
                border: 'none', borderRadius: 4,
                color: loading || !query.trim() ? 'var(--text-muted)' : '#FFFFFF',
                fontSize: 13, fontWeight: 500, padding: '0 22px', height: 44,
                cursor: loading || !query.trim() ? 'default' : 'pointer',
                transition: 'background 0.15s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!loading && query.trim()) e.currentTarget.style.background = '#333' }}
              onMouseLeave={e => { if (!loading && query.trim()) e.currentTarget.style.background = 'var(--text)' }}
            >{loading ? 'Loading...' : 'Search'}</button>
          </div>

          {showDropdown && searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 90, zIndex: 200,
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)', maxHeight: 280, overflowY: 'auto', marginTop: 2,
            }}>
              {searchResults.map(r => (
                <div key={r.symbol} onClick={() => handleSelectSymbol(r)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{r.symbol}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{r.name}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.exchange}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && (
          <div style={{ fontSize: 13, color: '#EF4444', background: '#FDF3F2', borderRadius: 4, padding: '10px 14px', marginTop: 8 }}>{error}</div>
        )}
      </div>

      {/* Stock header */}
      {quoteData && symbol && (
        <div className="research-header" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', marginBottom: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
            <ResearchLogo symbol={symbol} name={quoteData.name} size={48} />
            <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.4px' }}>{quoteData.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-hover)', borderRadius: 4, padding: '2px 8px' }}>{symbol}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-hover)', borderRadius: 4, padding: '2px 8px' }}>{quoteData.exchange}</span>
              <span style={{ fontSize: 11, color: quoteData.marketState === 'REGULAR' ? '#0A7C5C' : 'var(--text-muted)' }}>
                {quoteData.marketState === 'REGULAR' ? 'Market Open' : 'Market Closed'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 32, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.8px' }}>${quoteData.price?.toFixed(2)}</span>
              <span style={{ fontSize: 14, color: isUp ? '#0A7C5C' : '#EF4444' }}>
                {isUp ? '+' : ''}{quoteData.change?.toFixed(2)}&nbsp;({isUp ? '+' : ''}{quoteData.changePct?.toFixed(2)}%)
              </span>
            </div>
          </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div className="research-header-stats" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Market Cap', val: fmtMktCap(metricsData?.marketCap) },
              { label: 'Volume',     val: quoteData.volume != null ? (quoteData.volume >= 1e6 ? `${(quoteData.volume / 1e6).toFixed(1)}M` : quoteData.volume.toLocaleString()) : '—' },
              { label: '52W High',   val: metricsData?.high52w != null ? `$${metricsData.high52w.toFixed(2)}` : '—' },
              { label: '52W Low',    val: metricsData?.low52w  != null ? `$${metricsData.low52w.toFixed(2)}`  : '—' },
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{val}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const printStyle = document.createElement('style')
              printStyle.textContent = `@media print { .nav-bar, .market-ticker-bar, .nav-container, .nav-controls, .research-tabs, button { display: none !important; } .content-area { overflow: visible !important; } .content-inner { padding: 0 !important; } body { background: white !important; } }`
              document.head.appendChild(printStyle)
              window.print()
              setTimeout(() => printStyle.remove(), 1000)
            }}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0A7C5C'; e.currentTarget.style.color = '#0A7C5C' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            📄 Export PDF
          </button>
          </div>
        </div>
      )}

      {/* Sticky tabs */}
      {symbol && (
        <div className="research-tabs" style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--bg)', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 0,
          margin: '0 -24px', padding: '0 24px',
        }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--text)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--text)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 400,
                padding: '10px 16px 12px', cursor: 'pointer',
                marginBottom: -1, transition: 'color 0.15s', whiteSpace: 'nowrap',
              }}
            >{tab.label}</button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {symbol && !loading && (
        <div style={{ paddingTop: 20, paddingBottom: 40 }}>
          {activeTab === 'overview'   && <OverviewTab   metrics={metricsData} fundamentals={fundamentals} loading={false} />}
          {activeTab === 'chart'      && <ChartTab     symbol={symbol} />}
          {activeTab === 'financials' && <FinancialsTab fundamentals={fundamentals} loading={false} />}
          {activeTab === 'news'       && <NewsTab       news={newsData} loading={false} />}
          {activeTab === 'reddit'     && <RedditTab     symbol={symbol} />}
          {activeTab === 'analyst'    && <AnalystTab    fundamentals={fundamentals} metrics={metricsData} loading={false} />}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skel h={100} />
          <div style={{ height: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {Array.from({ length: 16 }).map((_, i) => <Skel key={i} h={54} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!symbol && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.3px' }}>
            Stock Research
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto 28px' }}>
            Search any stock to view company overview, financials, news, analyst ratings, and more.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['AAPL', 'TSLA', 'NVDA', 'MSFT', 'SHOP.TO', 'RY.TO', 'BN.TO', 'CNQ.TO'].map(s => (
              <button key={s} onClick={() => { setQuery(s); setSelectedSymbol(s) }}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                  color: 'var(--text-secondary)', fontSize: 12, padding: '5px 14px', cursor: 'pointer',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >{s}</button>
            ))}
          </div>

          {/* Search history */}
          {searchHistory.length > 0 && (
            <div style={{ maxWidth: 480, margin: '36px auto 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Recent Searches
                </div>
                <button
                  onClick={() => { localStorage.removeItem(HISTORY_LS_KEY); setSearchHistory([]); setHistoryExpanded(false) }}
                  style={{
                    background: 'none', border: 'none', fontSize: 11, color: 'var(--text-muted)',
                    cursor: 'pointer', padding: '2px 6px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >Clear All</button>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {/* Always-visible first 3 */}
                {searchHistory.slice(0, 3).map((h, i) => (
                  <div
                    key={h.symbol}
                    onClick={() => { setQuery(h.symbol); setSelectedSymbol(h.symbol); loadStock(h.symbol) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 16px', cursor: 'pointer',
                      borderBottom: '1px solid var(--bg-hover)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <ResearchLogo symbol={h.symbol} name={h.name} size={28} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.symbol}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{h.name}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(h.ts)}</div>
                  </div>
                ))}
                {/* Expandable overflow with slide animation */}
                {searchHistory.length > 3 && (
                  <div style={{
                    maxHeight: historyExpanded ? searchHistory.slice(3, 10).length * 60 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.35s ease',
                  }}>
                    {searchHistory.slice(3, 10).map((h, i, arr) => (
                      <div
                        key={h.symbol}
                        onClick={() => { setQuery(h.symbol); setSelectedSymbol(h.symbol); loadStock(h.symbol) }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 16px', cursor: 'pointer',
                          borderBottom: i < arr.length - 1 ? '1px solid var(--bg-hover)' : 'none',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <ResearchLogo symbol={h.symbol} name={h.name} size={28} />
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.symbol}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{h.name}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(h.ts)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {searchHistory.length > 3 && (
                <button
                  onClick={() => setHistoryExpanded(!historyExpanded)}
                  style={{
                    background: 'none', border: 'none', width: '100%',
                    padding: '10px 0 4px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontSize: 12, color: 'var(--text-secondary)', transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                >
                  {historyExpanded ? 'Show less' : `Show ${Math.min(searchHistory.length - 3, 7)} more`}
                  <span style={{
                    display: 'inline-block',
                    transition: 'transform 0.2s',
                    transform: historyExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    fontSize: 10,
                  }}>{'\u25BC'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
