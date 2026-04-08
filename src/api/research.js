import { fetchNews } from './yahoo.js'

const BASE = '/finance'

// ─── Data Fetching ────────────────────────────────────────────────────────────

// Validate symbols for research API calls
const VALID_SYMBOL = /^[A-Za-z0-9\.\-\^=]{1,20}$/
function validateResearchSymbol(symbol) {
  if (!symbol || !VALID_SYMBOL.test(symbol)) throw new Error('Invalid symbol')
  return symbol
}

async function fetchFundamentals(symbol) {
  validateResearchSymbol(symbol)
  const encoded = encodeURIComponent(symbol)
  const mods1 = 'summaryDetail,defaultKeyStatistics,financialData,price,earningsHistory'
  const mods2 = 'insiderTransactions,recommendationTrend,upgradeDowngradeHistory,institutionOwnership'
  const [r1, r2] = await Promise.all([
    fetch(`${BASE}/v10/finance/quoteSummary/${encoded}?modules=${mods1}`),
    fetch(`${BASE}/v10/finance/quoteSummary/${encoded}?modules=${mods2}`),
  ])
  if (!r1.ok) throw new Error(`Fundamentals fetch failed: ${r1.status}`)
  if (!r2.ok) throw new Error(`Fundamentals fetch failed: ${r2.status}`)
  const [d1, d2] = await Promise.all([r1.json(), r2.json()])
  return {
    ...(d1.quoteSummary?.result?.[0] ?? {}),
    ...(d2.quoteSummary?.result?.[0] ?? {}),
  }
}

async function fetchPriceHistory(symbol) {
  validateResearchSymbol(symbol)
  const res = await fetch(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`)
  if (!res.ok) throw new Error(`Price history fetch failed: ${res.status}`)
  const json = await res.json()
  const result = json.chart?.result?.[0]
  if (!result) return []
  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const volumes = result.indicators?.quote?.[0]?.volume ?? []
  return timestamps.map((ts, i) => ({ ts, close: closes[i], volume: volumes[i] })).filter(d => d.close != null)
}

// ─── Technical Helpers ────────────────────────────────────────────────────────

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  let avgGain = changes.slice(0, period).filter(c => c > 0).reduce((s, c) => s + c, 0) / period
  let avgLoss = changes.slice(0, period).filter(c => c < 0).reduce((s, c) => s + Math.abs(c), 0) / period
  for (const change of changes.slice(period)) {
    avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period
  }
  if (avgLoss === 0) return 100
  return 100 - (100 / (1 + avgGain / avgLoss))
}

function calcMA(closes, period) {
  if (closes.length < period) return null
  return closes.slice(-period).reduce((s, c) => s + c, 0) / period
}

function fmtBillions(v) {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toLocaleString()}`
}

// ─── Category Scoring Functions (return { score: 0–1, data: {}, ... }) ────────

function scoreValuation(data) {
  const sd = data.summaryDetail ?? {}
  const ks = data.defaultKeyStatistics ?? {}
  const pe = sd.trailingPE?.raw ?? ks.trailingPE?.raw
  const fpe = sd.forwardPE?.raw ?? ks.forwardPE?.raw
  const pb = ks.priceToBook?.raw
  const ps = ks.priceToSalesTrailing12Months?.raw
  const evEbitda = ks.enterpriseToEbitda?.raw

  const scores = []
  if (pe != null) {
    if (pe < 0) scores.push(0.1)
    else if (pe < 10) scores.push(0.9)
    else if (pe < 15) scores.push(0.85)
    else if (pe < 20) scores.push(0.75)
    else if (pe < 25) scores.push(0.6)
    else if (pe < 35) scores.push(0.4)
    else if (pe < 50) scores.push(0.25)
    else scores.push(0.1)
  }
  if (fpe != null && fpe > 0) {
    if (fpe < 10) scores.push(0.9)
    else if (fpe < 15) scores.push(0.8)
    else if (fpe < 20) scores.push(0.7)
    else if (fpe < 25) scores.push(0.55)
    else if (fpe < 35) scores.push(0.35)
    else scores.push(0.15)
  }
  if (pb != null && pb > 0) {
    if (pb < 1) scores.push(0.9)
    else if (pb < 2) scores.push(0.75)
    else if (pb < 3) scores.push(0.6)
    else if (pb < 5) scores.push(0.45)
    else scores.push(0.2)
  }
  if (ps != null && ps > 0) {
    if (ps < 1) scores.push(0.9)
    else if (ps < 3) scores.push(0.7)
    else if (ps < 5) scores.push(0.5)
    else if (ps < 10) scores.push(0.35)
    else scores.push(0.15)
  }
  if (evEbitda != null && evEbitda > 0) {
    if (evEbitda < 8) scores.push(0.9)
    else if (evEbitda < 12) scores.push(0.75)
    else if (evEbitda < 18) scores.push(0.55)
    else if (evEbitda < 25) scores.push(0.35)
    else scores.push(0.15)
  }

  return {
    score: scores.length ? scores.reduce((a, b) => a + b) / scores.length : 0.5,
    data: {
      'P/E (Trailing)': pe != null ? pe.toFixed(1) : '—',
      'P/E (Forward)': fpe != null ? fpe.toFixed(1) : '—',
      'Price / Book': pb != null ? pb.toFixed(2) : '—',
      'Price / Sales': ps != null ? ps.toFixed(2) : '—',
      'EV / EBITDA': evEbitda != null ? evEbitda.toFixed(1) : '—',
    },
  }
}

function scoreGrowth(data) {
  const fd = data.financialData ?? {}
  const eh = data.earningsHistory ?? {}
  const revGrowth = fd.revenueGrowth?.raw
  const epsGrowth = fd.earningsGrowth?.raw
  const history = eh.history ?? []

  const scores = []
  if (revGrowth != null) {
    if (revGrowth > 0.3) scores.push(1.0)
    else if (revGrowth > 0.2) scores.push(0.9)
    else if (revGrowth > 0.1) scores.push(0.75)
    else if (revGrowth > 0.05) scores.push(0.6)
    else if (revGrowth > 0) scores.push(0.5)
    else if (revGrowth > -0.05) scores.push(0.35)
    else scores.push(0.15)
  }
  if (epsGrowth != null) {
    if (epsGrowth > 0.3) scores.push(1.0)
    else if (epsGrowth > 0.2) scores.push(0.85)
    else if (epsGrowth > 0.1) scores.push(0.7)
    else if (epsGrowth > 0) scores.push(0.55)
    else scores.push(0.2)
  }
  const recent = history.slice(-8)
  if (recent.length > 0) {
    const beats = recent.filter(q => (q.surprisePercent?.raw ?? 0) > 0).length
    scores.push(beats / recent.length)
  }

  const beatMiss = history.slice(-4).map(q => ({
    quarter: q.quarter?.raw ? new Date(q.quarter.raw * 1000).toLocaleDateString('en', { month: 'short', year: '2-digit' }) : '?',
    surprise: q.surprisePercent?.raw != null ? `${q.surprisePercent.raw >= 0 ? '+' : ''}${(q.surprisePercent.raw * 100).toFixed(1)}%` : '—',
    beat: (q.surprisePercent?.raw ?? 0) > 0,
  }))

  return {
    score: scores.length ? scores.reduce((a, b) => a + b) / scores.length : 0.5,
    data: {
      'Revenue Growth (YoY)': revGrowth != null ? `${(revGrowth * 100).toFixed(1)}%` : '—',
      'Earnings Growth (YoY)': epsGrowth != null ? `${(epsGrowth * 100).toFixed(1)}%` : '—',
      'Earnings Beat Rate': history.length
        ? `${Math.round((history.filter(q => (q.surprisePercent?.raw ?? 0) > 0).length / Math.min(history.length, 8)) * 100)}%`
        : '—',
    },
    beatMiss,
  }
}

function scoreProfitability(data) {
  const fd = data.financialData ?? {}
  const gm = fd.grossMargins?.raw
  const om = fd.operatingMargins?.raw
  const nm = fd.profitMargins?.raw
  const roe = fd.returnOnEquity?.raw
  const roa = fd.returnOnAssets?.raw

  const scores = []
  if (gm != null) { scores.push(gm > 0.6 ? 1.0 : gm > 0.4 ? 0.85 : gm > 0.25 ? 0.7 : gm > 0.1 ? 0.5 : gm > 0 ? 0.3 : 0.05) }
  if (om != null) { scores.push(om > 0.3 ? 1.0 : om > 0.2 ? 0.85 : om > 0.1 ? 0.7 : om > 0.05 ? 0.55 : om > 0 ? 0.35 : 0.1) }
  if (nm != null) { scores.push(nm > 0.2 ? 1.0 : nm > 0.1 ? 0.8 : nm > 0.05 ? 0.65 : nm > 0 ? 0.45 : 0.05) }
  if (roe != null) { scores.push(roe > 0.3 ? 1.0 : roe > 0.2 ? 0.85 : roe > 0.1 ? 0.7 : roe > 0.05 ? 0.5 : roe > 0 ? 0.3 : 0.05) }
  if (roa != null) { scores.push(roa > 0.15 ? 1.0 : roa > 0.1 ? 0.85 : roa > 0.05 ? 0.7 : roa > 0.02 ? 0.5 : roa > 0 ? 0.3 : 0.05) }

  return {
    score: scores.length ? scores.reduce((a, b) => a + b) / scores.length : 0.5,
    data: {
      'Gross Margin': gm != null ? `${(gm * 100).toFixed(1)}%` : '—',
      'Operating Margin': om != null ? `${(om * 100).toFixed(1)}%` : '—',
      'Net Margin': nm != null ? `${(nm * 100).toFixed(1)}%` : '—',
      'Return on Equity': roe != null ? `${(roe * 100).toFixed(1)}%` : '—',
      'Return on Assets': roa != null ? `${(roa * 100).toFixed(1)}%` : '—',
    },
  }
}

function scoreHealth(data) {
  const fd = data.financialData ?? {}
  const cr = fd.currentRatio?.raw
  const qr = fd.quickRatio?.raw
  const de = fd.debtToEquity?.raw != null ? fd.debtToEquity.raw / 100 : null
  const fcf = fd.freeCashflow?.raw

  const scores = []
  if (cr != null) { scores.push(cr > 3 ? 1.0 : cr > 2 ? 0.9 : cr > 1.5 ? 0.75 : cr > 1 ? 0.55 : 0.2) }
  if (de != null && de >= 0) { scores.push(de < 0.3 ? 1.0 : de < 0.5 ? 0.85 : de < 1.0 ? 0.65 : de < 2.0 ? 0.4 : 0.15) }
  if (fcf != null) { scores.push(fcf > 0 ? 0.9 : 0.1) }

  return {
    score: scores.length ? scores.reduce((a, b) => a + b) / scores.length : 0.5,
    data: {
      'Current Ratio': cr != null ? cr.toFixed(2) : '—',
      'Quick Ratio': qr != null ? qr.toFixed(2) : '—',
      'Debt / Equity': de != null ? de.toFixed(2) : '—',
      'Free Cash Flow': fmtBillions(fcf),
      'Total Cash': fmtBillions(fd.totalCash?.raw),
      'Total Debt': fmtBillions(fd.totalDebt?.raw),
    },
  }
}

function scoreMomentum(priceHistory) {
  if (priceHistory.length < 50) return { score: 0.5, data: { Signal: 'Insufficient history' } }
  const closes = priceHistory.map(d => d.close)
  const current = closes[closes.length - 1]
  const ma50 = calcMA(closes, 50)
  const ma200 = calcMA(closes, Math.min(200, closes.length))
  const rsi = calcRSI(closes)
  const high52 = Math.max(...closes.slice(-252))
  const low52 = Math.min(...closes.slice(-252))

  const scores = []
  if (ma50 != null) scores.push(current > ma50 ? 0.8 : 0.3)
  if (ma200 != null) scores.push(current > ma200 ? 0.8 : 0.3)
  if (rsi != null) {
    scores.push(rsi > 80 ? 0.2 : rsi > 70 ? 0.45 : rsi > 50 ? 0.8 : rsi > 40 ? 0.6 : rsi > 30 ? 0.35 : 0.2)
  }
  const pos52 = (current - low52) / (high52 - low52 || 1)
  scores.push(pos52 > 0.8 ? 0.85 : pos52 > 0.5 ? 0.7 : pos52 > 0.3 ? 0.5 : 0.25)
  if (closes.length >= 40) {
    const last20avg = closes.slice(-20).reduce((a, b) => a + b) / 20
    const prev20avg = closes.slice(-40, -20).reduce((a, b) => a + b) / 20
    const trend = (last20avg - prev20avg) / prev20avg
    scores.push(trend > 0.05 ? 0.9 : trend > 0 ? 0.7 : trend > -0.05 ? 0.45 : 0.2)
  }

  return {
    score: scores.reduce((a, b) => a + b) / scores.length,
    data: {
      'Current Price': `$${current.toFixed(2)}`,
      'MA-50': ma50 != null ? `$${ma50.toFixed(2)} (${current > ma50 ? '▲' : '▼'} ${Math.abs(((current / ma50) - 1) * 100).toFixed(1)}%)` : '—',
      'MA-200': ma200 != null ? `$${ma200.toFixed(2)} (${current > ma200 ? '▲' : '▼'} ${Math.abs(((current / ma200) - 1) * 100).toFixed(1)}%)` : '—',
      'RSI (14)': rsi != null ? `${rsi.toFixed(1)} ${rsi > 70 ? '— Overbought' : rsi < 30 ? '— Oversold' : '— Neutral'}` : '—',
      '52W High': `$${high52.toFixed(2)} (${((current / high52 - 1) * 100).toFixed(1)}%)`,
      '52W Low': `$${low52.toFixed(2)} (+${((current / low52 - 1) * 100).toFixed(1)}%)`,
    },
  }
}

function scoreInsider(data) {
  const transactions = data.insiderTransactions?.transactions ?? []
  const recent = transactions.filter(t => {
    if (!t.startDate?.raw) return false
    return (Date.now() / 1000 - t.startDate.raw) / 86400 <= 90
  })

  if (!recent.length) {
    return {
      score: 0.5,
      data: { 'Recent Transactions (90d)': 'No data', Signal: 'Neutral' },
    }
  }

  const buys = recent.filter(t => {
    const desc = (t.transactionDescription ?? '').toLowerCase()
    return desc.includes('buy') || desc.includes('purchase')
  }).length
  const sells = recent.filter(t => {
    const desc = (t.transactionDescription ?? '').toLowerCase()
    return desc.includes('sale') || desc.includes('sell')
  }).length

  const score = buys > 0 && sells === 0 ? 0.9 : buys > sells ? 0.75 : buys === sells ? 0.5 : sells > buys * 2 ? 0.2 : 0.35
  const insiderHeld = data.defaultKeyStatistics?.heldPercentInsiders?.raw
  const instHeld = data.defaultKeyStatistics?.heldPercentInstitutions?.raw

  return {
    score,
    data: {
      'Recent Buys (90d)': String(buys),
      'Recent Sells (90d)': String(sells),
      Signal: buys > sells ? 'Bullish' : buys < sells ? 'Bearish' : 'Neutral',
      'Insider Ownership': insiderHeld != null ? `${(insiderHeld * 100).toFixed(1)}%` : '—',
      'Institutional Ownership': instHeld != null ? `${(instHeld * 100).toFixed(1)}%` : '—',
    },
  }
}

function scoreAnalyst(data, currentPrice) {
  const trend = data.recommendationTrend?.trend?.[0] ?? {}
  const fd = data.financialData ?? {}
  const targetPrice = fd.targetMeanPrice?.raw
  const recommendation = fd.recommendationKey

  const total = (trend.strongBuy ?? 0) + (trend.buy ?? 0) + (trend.hold ?? 0) + (trend.sell ?? 0) + (trend.strongSell ?? 0)
  const buyCount = (trend.strongBuy ?? 0) + (trend.buy ?? 0)
  const buyPct = total > 0 ? buyCount / total : null
  const upside = targetPrice != null && currentPrice > 0 ? (targetPrice - currentPrice) / currentPrice : null

  const scores = []
  if (buyPct != null) {
    scores.push(buyPct > 0.75 ? 1.0 : buyPct > 0.6 ? 0.8 : buyPct > 0.45 ? 0.6 : buyPct > 0.3 ? 0.4 : 0.2)
  }
  if (upside != null) {
    scores.push(upside > 0.4 ? 1.0 : upside > 0.25 ? 0.85 : upside > 0.1 ? 0.7 : upside > 0 ? 0.55 : upside > -0.1 ? 0.35 : 0.1)
  }

  const recent = (data.upgradeDowngradeHistory?.history ?? []).slice(0, 10)
  const upgrades = recent.filter(h => h.action === 'up').length
  const downgrades = recent.filter(h => h.action === 'down').length
  if (recent.length > 0) scores.push(upgrades >= downgrades ? 0.7 : 0.3)

  return {
    score: scores.length ? scores.reduce((a, b) => a + b) / scores.length : 0.5,
    data: {
      Consensus: recommendation ? recommendation.replace('_', ' ').toUpperCase() : '—',
      'Buy Ratings': total ? `${buyCount}/${total} (${Math.round((buyPct ?? 0) * 100)}%)` : '—',
      'Mean Price Target': targetPrice != null ? `$${targetPrice.toFixed(2)}` : '—',
      'Upside to Target': upside != null ? `${upside >= 0 ? '+' : ''}${(upside * 100).toFixed(1)}%` : '—',
      'High Target': fd.targetHighPrice?.raw != null ? `$${fd.targetHighPrice.raw.toFixed(2)}` : '—',
      'Low Target': fd.targetLowPrice?.raw != null ? `$${fd.targetLowPrice.raw.toFixed(2)}` : '—',
      'Recent Upgrades': String(upgrades),
      'Recent Downgrades': String(downgrades),
    },
  }
}

function scoreShareholder(data) {
  const sd = data.summaryDetail ?? {}
  const ks = data.defaultKeyStatistics ?? {}
  const divYield = sd.dividendYield?.raw ?? sd.trailingAnnualDividendYield?.raw
  const payoutRatio = sd.payoutRatio?.raw
  const sharesOut = ks.sharesOutstanding?.raw

  const scores = []
  if (divYield != null && divYield > 0) {
    scores.push(divYield > 0.06 ? 0.9 : divYield > 0.04 ? 0.85 : divYield > 0.02 ? 0.75 : divYield > 0.01 ? 0.6 : 0.5)
    if (payoutRatio != null) {
      scores.push(payoutRatio < 0.4 ? 0.9 : payoutRatio < 0.7 ? 0.7 : payoutRatio < 1.0 ? 0.45 : 0.1)
    }
  } else {
    scores.push(0.45)
  }

  return {
    score: scores.reduce((a, b) => a + b) / scores.length,
    data: {
      'Dividend Yield': divYield != null && divYield > 0 ? `${(divYield * 100).toFixed(2)}%` : 'None',
      'Annual Dividend': sd.dividendRate?.raw != null ? `$${sd.dividendRate.raw.toFixed(2)}` : '—',
      'Payout Ratio': payoutRatio != null ? `${(payoutRatio * 100).toFixed(0)}%` : '—',
      'Shares Outstanding': sharesOut != null
        ? sharesOut >= 1e9 ? `${(sharesOut / 1e9).toFixed(2)}B` : `${(sharesOut / 1e6).toFixed(0)}M`
        : '—',
    },
  }
}

// ─── Claude API ───────────────────────────────────────────────────────────────

async function callClaude(prompt) {
  // API key is injected server-side by the Vite proxy — never sent from the browser
  const res = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message ?? 'API error')
  if (!data.content?.[0]?.text) throw new Error('Unexpected response format')
  return data.content[0].text
}

/**
 * Call Claude with vision (image + text prompt).
 * @param {string} prompt - Text instructions
 * @param {string} base64Data - Base64-encoded image data (without data URL prefix)
 * @param {string} mediaType - MIME type: 'image/png', 'image/jpeg', 'image/webp', 'image/gif'
 * @returns {string} Claude's text response
 */
export async function callClaudeVision(prompt, base64Data, mediaType = 'image/png') {
  const res = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Vision API error ${res.status}: ${errText}`)
  }
  const data = await res.json()
  if (data.error) throw new Error(data.error.message ?? 'API error')
  if (!data.content?.[0]?.text) throw new Error('Unexpected response format')
  return data.content[0].text
}

async function scoreNewsSentiment(symbol, name, news) {
  if (!news?.length) return { score: 0.5, data: { Signal: 'No recent news', Catalysts: '—', Risks: '—' }, catalysts: [], risks: [] }
  const headlines = news.slice(0, 8).map(n => n.title).join('\n')
  try {
    const raw = await callClaude(
      `Analyze these news headlines for ${name} (${symbol}). Respond ONLY with valid JSON, no other text:\n\nHeadlines:\n${headlines}\n\n{"sentiment":"positive"|"neutral"|"negative","score":0.0-1.0,"catalysts":["..."],"risks":["..."],"summary":"one sentence"}`
    )
    let parsed
    try {
      parsed = JSON.parse(raw.trim().replace(/```json|```/g, ''))
    } catch { return { score: 0.5, data: { Signal: 'AI response parse error', Catalysts: '—', Risks: '—' }, catalysts: [], risks: [] } }
    // Validate and sanitize response
    const validSentiments = ['positive', 'neutral', 'negative']
    const sentiment = validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'neutral'
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0.5
    const catalysts = Array.isArray(parsed.catalysts) ? parsed.catalysts.filter(c => typeof c === 'string').map(c => c.slice(0, 200)) : []
    const risks = Array.isArray(parsed.risks) ? parsed.risks.filter(r => typeof r === 'string').map(r => r.slice(0, 200)) : []
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '—'
    return {
      score,
      data: {
        Sentiment: sentiment === 'positive' ? 'Positive' : sentiment === 'negative' ? 'Negative' : 'Neutral',
        Catalysts: catalysts.join(', ') || '—',
        Risks: risks.join(', ') || '—',
        Summary: summary,
      },
      catalysts,
      risks,
    }
  } catch {
    return { score: 0.5, data: { Signal: 'AI analysis unavailable — add ANTHROPIC_API_KEY', Catalysts: '—', Risks: '—' }, catalysts: [], risks: [] }
  }
}

async function scoreMoat(name, symbol, fd) {
  const gm = fd.grossMargins?.raw
  try {
    const raw = await callClaude(
      `Evaluate the economic moat of ${name} (${symbol}). Gross margin: ${gm != null ? (gm * 100).toFixed(0) : 'unknown'}%. Respond ONLY with valid JSON, no other text:\n\n{"moatScore":0.0-1.0,"moatType":"wide"|"narrow"|"none","strengths":["..."],"threats":["..."]}`
    )
    const parsed = JSON.parse(raw.trim().replace(/```json|```/g, ''))
    const moatScore = typeof parsed.moatScore === 'number' ? Math.max(0, Math.min(1, parsed.moatScore)) : 0.5
    return {
      score: moatScore,
      data: {
        'Moat Width': parsed.moatType ? parsed.moatType.toUpperCase() : '—',
        Strengths: parsed.strengths?.join(', ') || '—',
        Threats: parsed.threats?.join(', ') || '—',
      },
    }
  } catch {
    const score = gm != null ? (gm > 0.5 ? 0.8 : gm > 0.3 ? 0.6 : gm > 0.1 ? 0.45 : 0.3) : 0.5
    return { score, data: { 'Estimated Moat': gm != null ? (gm > 0.5 ? 'Wide' : gm > 0.3 ? 'Narrow' : 'Limited') : 'Unknown', Note: 'Add API key for AI analysis' } }
  }
}

// ─── Horizon Weights ──────────────────────────────────────────────────────────

const WEIGHTS = {
  '1W': { momentum: 0.40, sentiment: 0.30, insider: 0.10, valuation: 0.05, growth: 0.05, health: 0.02, analyst: 0.05, profitability: 0.01, moat: 0.01, shareholder: 0.01 },
  '1M': { momentum: 0.25, sentiment: 0.20, insider: 0.15, valuation: 0.10, growth: 0.10, health: 0.05, analyst: 0.10, profitability: 0.03, moat: 0.01, shareholder: 0.01 },
  '6M': { momentum: 0.15, sentiment: 0.10, insider: 0.15, valuation: 0.15, growth: 0.15, health: 0.10, analyst: 0.10, profitability: 0.08, moat: 0.01, shareholder: 0.01 },
  '1Y': { momentum: 0.10, sentiment: 0.05, insider: 0.10, valuation: 0.20, growth: 0.20, health: 0.15, analyst: 0.10, profitability: 0.05, moat: 0.03, shareholder: 0.02 },
  '5Y': { momentum: 0.05, sentiment: 0.05, insider: 0.05, valuation: 0.25, growth: 0.20, health: 0.20, analyst: 0.05, profitability: 0.10, moat: 0.03, shareholder: 0.02 },
}

function weightedScore(scores, horizon) {
  const w = WEIGHTS[horizon]
  return (
    scores.momentum.score * w.momentum +
    scores.sentiment.score * w.sentiment +
    scores.insider.score * w.insider +
    scores.valuation.score * w.valuation +
    scores.growth.score * w.growth +
    scores.health.score * w.health +
    scores.analyst.score * w.analyst +
    scores.profitability.score * w.profitability +
    scores.moat.score * w.moat +
    scores.shareholder.score * w.shareholder
  ) * 10
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function analyzeStock(symbol) {
  const [fundamentals, priceHistory, newsItems] = await Promise.all([
    fetchFundamentals(symbol),
    fetchPriceHistory(symbol),
    fetchNews(symbol).catch(() => []),
  ])

  const price = fundamentals.price ?? {}
  const fd = fundamentals.financialData ?? {}
  const currentPrice = price.regularMarketPrice?.raw ?? priceHistory.at(-1)?.close ?? 0
  const name = price.longName ?? price.shortName ?? symbol
  const sector = price.sector ?? price.industry ?? '—'
  const exchange = price.exchangeName ?? '—'

  const valuation = scoreValuation(fundamentals)
  const growth = scoreGrowth(fundamentals)
  const profitability = scoreProfitability(fundamentals)
  const health = scoreHealth(fundamentals)
  const momentum = scoreMomentum(priceHistory)
  const insider = scoreInsider(fundamentals)
  const analyst = scoreAnalyst(fundamentals, currentPrice)
  const shareholder = scoreShareholder(fundamentals)

  const [sentiment, moat] = await Promise.all([
    scoreNewsSentiment(symbol, name, newsItems),
    scoreMoat(name, symbol, fd),
  ])

  const scores = { valuation, growth, profitability, health, momentum, insider, sentiment, analyst, moat, shareholder }

  const horizonScores = {}
  for (const h of ['1W', '1M', '6M', '1Y', '5Y']) {
    horizonScores[h] = weightedScore(scores, h)
  }

  let aiSummary = ''
  try {
    const catSummary = Object.entries(scores)
      .map(([k, v]) => `${k}: ${(v.score * 10).toFixed(1)}/10`)
      .join(', ')
    aiSummary = await callClaude(
      `You are a professional investment analyst. Write a concise 3-4 sentence investment summary for ${name} (${symbol}), sector: ${sector}.\n\nCategory scores: ${catSummary}\nCurrent price: $${currentPrice.toFixed(2)}\n1Y investment score: ${horizonScores['1Y'].toFixed(1)}/10\n\nExplain WHY the stock scored this way. Highlight key drivers, biggest strengths and concerns. Be specific, not generic. Don't repeat numbers literally — interpret and contextualize them.`
    )
  } catch {
    aiSummary = `${name} received an investment score of ${horizonScores['1Y'].toFixed(1)}/10 on a 1-year horizon. Add a Anthropic API key (ANTHROPIC_API_KEY) to enable AI-generated analyst commentary.`
  }

  const risks = []
  if (scores.valuation.score < 0.35) risks.push('Potentially overvalued relative to historical and peer metrics')
  if (scores.health.score < 0.4) risks.push('Weak balance sheet — elevated debt or low liquidity')
  if (scores.momentum.score < 0.35) risks.push('Negative price momentum — trading below key moving averages')
  if (scores.growth.score < 0.35) risks.push('Decelerating or negative revenue / earnings growth')
  if (scores.profitability.score < 0.35) risks.push('Below-average margins compared to sector benchmarks')
  if (sentiment.risks?.length) risks.push(...sentiment.risks.slice(0, 2))
  if (moat.data?.Threats && moat.data.Threats !== '—') risks.push(moat.data.Threats)

  return {
    id: `${symbol}-${Date.now()}`,
    symbol,
    name,
    sector,
    exchange,
    currentPrice,
    scores,
    horizonScores,
    aiSummary,
    risks: [...new Set(risks)].slice(0, 6),
    news: newsItems.slice(0, 5),
    analyzedAt: new Date().toISOString(),
  }
}
