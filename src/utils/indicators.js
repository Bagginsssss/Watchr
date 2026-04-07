/**
 * Calculate Simple Moving Average (SMA) for a data series.
 * @param {number[]} data - Array of close prices
 * @param {number} period - Number of periods (e.g. 20, 50, 200)
 * @returns {(number|null)[]} Array same length as data, with null for insufficient data points
 */
export function calcSMA(data, period) {
  const result = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += data[j]
      result.push(sum / period)
    }
  }
  return result
}

/**
 * Calculate Exponential Moving Average (EMA).
 * @param {number[]} data - Array of close prices
 * @param {number} period - Number of periods
 * @returns {(number|null)[]}
 */
export function calcEMA(data, period) {
  const k = 2 / (period + 1)
  const result = []
  let ema = null

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += data[j]
      ema = sum / period
      result.push(ema)
    } else {
      ema = data[i] * k + ema * (1 - k)
      result.push(ema)
    }
  }
  return result
}

/**
 * Calculate RSI (Relative Strength Index).
 * @param {number[]} data - Array of close prices
 * @param {number} period - RSI period (typically 14)
 * @returns {(number|null)[]}
 */
export function calcRSI(data, period = 14) {
  if (data.length < period + 1) return data.map(() => null)

  const changes = []
  for (let i = 1; i < data.length; i++) changes.push(data[i] - data[i - 1])

  const result = [null] // First element has no change
  let avgGain = 0, avgLoss = 0

  // Initial average
  for (let i = 0; i < period; i++) {
    result.push(null)
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }
  avgGain /= period
  avgLoss /= period

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  result.push(100 - 100 / (1 + rs))

  // Subsequent values (smoothed)
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push(100 - 100 / (1 + rs))
  }

  return result
}

/**
 * Add MA overlay data to an OHLCV array.
 * @param {Object[]} ohlcv - Array of { date, open, high, low, close, volume }
 * @param {number[]} periods - MA periods to calculate (e.g. [20, 50, 200])
 * @returns {Object[]} Same array with added ma20, ma50, ma200 fields
 */
export function addMAOverlays(ohlcv, periods = [20, 50, 200]) {
  const closes = ohlcv.map(d => d.close)
  const mas = {}
  for (const p of periods) {
    mas[`ma${p}`] = calcSMA(closes, p)
  }
  return ohlcv.map((d, i) => {
    const overlays = {}
    for (const p of periods) {
      overlays[`ma${p}`] = mas[`ma${p}`][i]
    }
    return { ...d, ...overlays }
  })
}
