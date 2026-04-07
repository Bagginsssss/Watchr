import { useState, useEffect, useCallback, useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts'
import ChartDragOverlay from '../components/ChartDragOverlay.jsx'
import CryptoCard from '../components/CryptoCard.jsx'
import { CRYPTO_LIST, CRYPTO_RANGES } from '../data/crypto.js'
import { fetchCryptoMarkets, fetchCryptoHistory, fetchGlobalStats, fetchCoinMetadata, fetchFearGreedIndex } from '../api/crypto.js'
import { useCurrency } from '../context/CurrencyContext.jsx'

function formatMarketCap(v, sym) {
  if (v == null) return '—'
  if (v >= 1e12) return `${sym}${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `${sym}${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `${sym}${(v / 1e6).toFixed(2)}M`
  return `${sym}${v.toLocaleString()}`
}

function formatSupply(v, symbol) {
  if (v == null) return '—'
  if (v >= 1e9)  return `${(v / 1e9).toFixed(2)}B ${symbol}`
  if (v >= 1e6)  return `${(v / 1e6).toFixed(2)}M ${symbol}`
  return `${v.toLocaleString()} ${symbol}`
}

// ── Fear & Greed gauge colors ─────────────────────────────────────────────────
function fgColor(val) {
  if (val <= 25) return '#C0392B'
  if (val <= 45) return '#E67E22'
  if (val <= 55) return '#F1C40F'
  if (val <= 75) return '#27AE60'
  return '#0A7C5C'
}

// ── Dominance donut colors ────────────────────────────────────────────────────
const DONUT_COLORS = ['#F7931A', '#627EEA', '#8B5CF6', '#6B7280']

export default function CryptoTab() {
  const { convert, sym } = useCurrency()
  const [coins, setCoins] = useState([])
  const [coinsLoading, setCoinsLoading] = useState(true)
  const [selected, setSelected] = useState('bitcoin')
  const [range, setRange] = useState(CRYPTO_RANGES[2]) // 1M
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [globalStats, setGlobalStats] = useState(null)
  const [fearGreed, setFearGreed] = useState(null)
  const [metadata, setMetadata] = useState({})
  const [moverTab, setMoverTab] = useState('gainers')
  const [descExpanded, setDescExpanded] = useState(false)

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadCoins = useCallback(async () => {
    try {
      const data = await fetchCryptoMarkets()
      setCoins(data)
    } catch { setCoins([]) }
    finally { setCoinsLoading(false) }
  }, [])

  const loadHistory = useCallback(async (id, r) => {
    setHistoryLoading(true)
    try { setHistory(await fetchCryptoHistory(id, r.days)) }
    catch { setHistory([]) }
    finally { setHistoryLoading(false) }
  }, [])

  useEffect(() => {
    loadCoins()
    fetchGlobalStats().then(setGlobalStats).catch(() => {})
    fetchFearGreedIndex().then(setFearGreed).catch(() => {})
    const id = setInterval(loadCoins, 90000)
    return () => clearInterval(id)
  }, [loadCoins])

  useEffect(() => { loadHistory(selected, range) }, [selected, range, loadHistory])

  // Load metadata when a coin is selected
  useEffect(() => {
    const crypto = CRYPTO_LIST.find(c => c.id === selected)
    if (!crypto || metadata[crypto.cmcId]) return
    fetchCoinMetadata([crypto.cmcId])
      .then(m => setMetadata(prev => ({ ...prev, ...m })))
      .catch(() => {})
  }, [selected, metadata])

  // ── Derived data ──────────────────────────────────────────────────────────
  const selectedCoin = coins.find(c => c.id === selected)
  const selectedMeta = metadata[CRYPTO_LIST.find(c => c.id === selected)?.cmcId]
  const pct24h = selectedCoin?.price_change_percentage_24h ?? 0
  const isUp = pct24h >= 0
  const lineColor = isUp ? '#0A7C5C' : '#C0392B'

  const gainers = useMemo(() =>
    [...coins].sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0)).slice(0, 5)
  , [coins])

  const losers = useMemo(() =>
    [...coins].sort((a, b) => (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0)).slice(0, 5)
  , [coins])

  const dominanceData = useMemo(() => {
    if (!globalStats?.market_cap_percentage) return []
    const btc = Number(globalStats.market_cap_percentage.btc) || 0
    const eth = Number(globalStats.market_cap_percentage.eth) || 0
    const others = Math.max(0, 100 - btc - eth)
    return [
      { name: 'BTC', value: btc },
      { name: 'ETH', value: eth },
      { name: 'Others', value: others },
    ]
  }, [globalStats])

  const fmt = (v) => {
    if (v == null) return '—'
    const c = convert(v, 'USD')
    if (c == null) return '—'
    if (c >= 1e9)  return `${sym}${(c / 1e9).toFixed(2)}B`
    if (c >= 1e6)  return `${sym}${(c / 1e6).toFixed(2)}M`
    if (c >= 1)    return `${sym}${c.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    return `${sym}${c.toFixed(6)}`
  }

  const convertedHistory = history.map(d => ({
    ...d, close: d.close != null ? convert(d.close, 'USD') : null,
  }))

  const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          {sym}{payload[0].value?.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '16px 0' }}>

      {/* ── Market Overview Bar ─────────────────────────────────── */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Total Mkt Cap', val: globalStats?.total_market_cap?.usd != null ? formatMarketCap(convert(globalStats.total_market_cap.usd, 'USD'), sym) : '—' },
          { label: '24h Volume', val: globalStats?.total_volume?.usd != null ? formatMarketCap(convert(globalStats.total_volume.usd, 'USD'), sym) : '—' },
          { label: 'BTC Dominance', val: globalStats?.market_cap_percentage?.btc != null ? `${Number(globalStats.market_cap_percentage.btc).toFixed(1)}%` : '—' },
          { label: 'ETH Dominance', val: globalStats?.market_cap_percentage?.eth != null ? `${Number(globalStats.market_cap_percentage.eth).toFixed(1)}%` : '—' },
          { label: 'Fear & Greed', val: fearGreed ? `${fearGreed.value}` : '—', extra: fearGreed?.classification, color: fearGreed ? fgColor(fearGreed.value) : undefined },
          { label: 'Coins Tracked', val: globalStats?.active_cryptocurrencies ? globalStats.active_cryptocurrencies.toLocaleString() : `${coins.length}` },
        ].map(({ label, val, extra, color }) => (
          <div key={label} className="card-hover" style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: color ?? 'var(--text)' }}>{val}</div>
            {extra && <div style={{ fontSize: 10, color: color ?? 'var(--text-muted)', marginTop: 2 }}>{extra}</div>}
          </div>
        ))}
      </div>

      {/* ── Main Layout: List + Detail ──────────────────────────── */}
      <div className="crypto-layout" style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, marginBottom: 24 }}>

        {/* Left: Coin list */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Cryptocurrencies</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{coins.length} coins</div>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '24px 32px 1fr auto auto auto', gap: 10, padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>#</span>
            <span />
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Name</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'right', minWidth: 80, textTransform: 'uppercase' }}>Price</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'right', minWidth: 52, textTransform: 'uppercase' }}>7d</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 72, textTransform: 'uppercase' }}>Chart</span>
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 480 }}>
            {coinsLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px' }}>
                  <div className="skeleton" style={{ width: 16, height: 11 }} />
                  <div className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: 40, height: 12, marginBottom: 4 }} />
                    <div className="skeleton" style={{ width: 70, height: 10 }} />
                  </div>
                  <div className="skeleton" style={{ width: 64, height: 12 }} />
                </div>
              ))
            ) : (
              coins.map(coin => (
                <CryptoCard key={coin.id} coin={coin} selected={selected === coin.id}
                  onClick={() => { setSelected(coin.id); setDescExpanded(false) }} />
              ))
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div style={{ overflowY: 'auto' }}>
          {selectedCoin && (
            <div className="fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 28px' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {selectedCoin.image ? (
                    <img src={selectedCoin.image} alt={selectedCoin.name} width={48} height={48}
                      style={{ borderRadius: '50%', background: 'var(--bg-muted)' }}
                      onError={e => e.target.style.display = 'none'} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: '#fff' }}>
                      {selectedCoin.symbol?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 300, color: 'var(--text)', fontFamily: 'Georgia, serif', letterSpacing: '-0.5px' }}>
                      {selectedCoin.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {selectedCoin.symbol?.toUpperCase()}{selectedCoin.market_cap_rank ? ` · Rank #${selectedCoin.market_cap_rank}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 300, color: 'var(--text)', fontFamily: 'Georgia, serif', letterSpacing: '-1px' }}>
                    {fmt(selectedCoin.current_price)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: lineColor }}>
                    {isUp ? '+' : ''}{pct24h.toFixed(2)}% <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>24h</span>
                  </div>
                </div>
              </div>

              {/* Links */}
              {selectedMeta && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {selectedMeta.website && (
                    <a href={selectedMeta.website} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: 'var(--bg-muted)', color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border)' }}>
                      🌐 Website
                    </a>
                  )}
                  {selectedMeta.explorer && (
                    <a href={selectedMeta.explorer} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: 'var(--bg-muted)', color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border)' }}>
                      🔍 Explorer
                    </a>
                  )}
                  {selectedMeta.twitter && (
                    <a href={selectedMeta.twitter} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: 'var(--bg-muted)', color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border)' }}>
                      𝕏 Twitter
                    </a>
                  )}
                </div>
              )}

              {/* Chart range selector */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-hover)', borderRadius: 6, padding: 2, marginBottom: 8, width: 'fit-content' }}>
                {CRYPTO_RANGES.map(r => (
                  <button key={r.label} onClick={() => setRange(r)}
                    style={{
                      background: range.label === r.label ? 'var(--bg-card)' : 'transparent',
                      border: 'none', borderRadius: 4,
                      color: range.label === r.label ? 'var(--text)' : 'var(--text-muted)',
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
                      boxShadow: range.label === r.label ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Chart */}
              {historyLoading ? (
                <div className="skeleton" style={{ width: '100%', height: 220, borderRadius: 8, marginBottom: 16 }} />
              ) : convertedHistory.length > 1 ? (
                <div style={{ marginBottom: 16 }}>
                  <ChartDragOverlay data={convertedHistory} dataKey="close" height={220}>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={convertedHistory}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false}
                          interval={Math.max(1, Math.floor(convertedHistory.length / 6))} />
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={1.5} dot={false}
                          activeDot={{ r: 3, fill: lineColor, strokeWidth: 0 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartDragOverlay>
                </div>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No chart data
                </div>
              )}

              {/* Metrics grid */}
              <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 20px' }}>
                {[
                  { label: 'Market Cap', val: selectedCoin.market_cap != null ? formatMarketCap(convert(selectedCoin.market_cap, 'USD'), sym) : '—' },
                  { label: '24h Volume', val: selectedCoin.total_volume != null ? formatMarketCap(convert(selectedCoin.total_volume, 'USD'), sym) : '—' },
                  { label: 'Circ. Supply', val: selectedCoin.circulating_supply != null ? formatSupply(selectedCoin.circulating_supply, selectedCoin.symbol?.toUpperCase()) : '—' },
                  { label: 'Total Supply', val: selectedCoin.total_supply != null ? formatSupply(selectedCoin.total_supply, selectedCoin.symbol?.toUpperCase()) : '—' },
                  { label: 'Max Supply', val: selectedCoin.max_supply != null ? formatSupply(selectedCoin.max_supply, selectedCoin.symbol?.toUpperCase()) : '∞' },
                  { label: '7d Change', val: selectedCoin.price_change_percentage_7d_in_currency != null ? `${selectedCoin.price_change_percentage_7d_in_currency >= 0 ? '+' : ''}${selectedCoin.price_change_percentage_7d_in_currency.toFixed(2)}%` : '—',
                    color: (selectedCoin.price_change_percentage_7d_in_currency ?? 0) >= 0 ? '#0A7C5C' : '#C0392B' },
                  { label: '1h Change', val: selectedCoin.price_change_percentage_1h_in_currency != null ? `${selectedCoin.price_change_percentage_1h_in_currency >= 0 ? '+' : ''}${selectedCoin.price_change_percentage_1h_in_currency.toFixed(2)}%` : '—',
                    color: (selectedCoin.price_change_percentage_1h_in_currency ?? 0) >= 0 ? '#0A7C5C' : '#C0392B' },
                  { label: '24h Change', val: `${pct24h >= 0 ? '+' : ''}${pct24h.toFixed(2)}%`, color: lineColor },
                  { label: 'Data Source', val: selectedCoin._source === 'cmc' ? 'CoinMarketCap' : selectedCoin._source === 'yahoo' ? 'Yahoo Finance' : 'Live' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: color ?? 'var(--text)' }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Description */}
              {selectedMeta?.description && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>About</div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                    maxHeight: descExpanded ? 'none' : 60, overflow: 'hidden',
                    position: 'relative',
                  }}>
                    {selectedMeta.description.replace(/<[^>]*>/g, '').slice(0, descExpanded ? undefined : 200)}
                    {!descExpanded && selectedMeta.description.length > 200 && '...'}
                  </div>
                  {selectedMeta.description.length > 200 && (
                    <button onClick={() => setDescExpanded(!descExpanded)}
                      style={{ background: 'none', border: 'none', color: '#0A7C5C', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 4, padding: 0 }}>
                      {descExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Section: Movers + Dominance ──────────────────── */}
      <div className="crypto-bottom" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

        {/* Top Movers */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {['gainers', 'losers'].map(tab => (
              <button key={tab} onClick={() => setMoverTab(tab)}
                style={{
                  flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
                  background: moverTab === tab ? 'var(--bg-card)' : 'var(--bg-muted)',
                  color: moverTab === tab ? (tab === 'gainers' ? '#0A7C5C' : '#C0392B') : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 600,
                  borderBottom: moverTab === tab ? `2px solid ${tab === 'gainers' ? '#0A7C5C' : '#C0392B'}` : '2px solid transparent',
                }}>
                {tab === 'gainers' ? '▲ Top Gainers' : '▼ Top Losers'}
              </button>
            ))}
          </div>
          {(moverTab === 'gainers' ? gainers : losers).map((coin, i) => {
            const pct = coin.price_change_percentage_24h ?? 0
            const up = pct >= 0
            return (
              <div key={coin.id} onClick={() => setSelected(coin.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 20 }}>{i + 1}</span>
                {coin.image && <img src={coin.image} width={24} height={24} style={{ borderRadius: '50%' }} onError={e => e.target.style.display = 'none'} />}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{coin.symbol?.toUpperCase()}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{coin.name}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmt(coin.current_price)}</div>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: up ? '#0A7C5C' : '#C0392B',
                    background: up ? 'rgba(10,124,92,0.08)' : 'rgba(192,57,43,0.08)',
                    padding: '1px 6px', borderRadius: 4, display: 'inline-block',
                  }}>
                    {up ? '+' : ''}{pct.toFixed(2)}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Market Dominance */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Market Dominance</div>
          {dominanceData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={dominanceData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                    dataKey="value" paddingAngle={3} strokeWidth={0}>
                    {dominanceData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${v.toFixed(1)}%`}
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {dominanceData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: DONUT_COLORS[i], flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{d.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{d.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading...
            </div>
          )}

          {/* Fear & Greed mini gauge */}
          {fearGreed && (
            <div style={{ marginTop: 20, padding: '16px', background: 'var(--bg-muted)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Fear & Greed Index</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  border: `3px solid ${fgColor(fearGreed.value)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700, color: fgColor(fearGreed.value),
                }}>
                  {fearGreed.value}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: fgColor(fearGreed.value) }}>
                    {fearGreed.classification}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {fearGreed.value <= 25 ? 'Extreme fear — potential buying opportunity' :
                     fearGreed.value <= 45 ? 'Market is cautious' :
                     fearGreed.value <= 55 ? 'Market is neutral' :
                     fearGreed.value <= 75 ? 'Investors are optimistic' :
                     'Extreme greed — market may be overheated'}
                  </div>
                </div>
              </div>
              {/* Bar gauge */}
              <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, width: `${fearGreed.value}%`,
                  background: `linear-gradient(90deg, #C0392B, #E67E22, #F1C40F, #27AE60, #0A7C5C)`,
                }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
