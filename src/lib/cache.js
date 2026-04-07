/**
 * Generic TTL (Time-To-Live) cache.
 * Stores values in memory with automatic expiration.
 * Returns stale data on fetch errors (stale-while-revalidate pattern).
 */
class TTLCache {
  constructor(defaultTTL = 60_000) {
    this.store = new Map()
    this.defaultTTL = defaultTTL
  }

  /** Get cached value if still fresh. Returns { value, stale } or null. */
  get(key) {
    const entry = this.store.get(key)
    if (!entry) return null
    const age = Date.now() - entry.ts
    if (age < entry.ttl) return { value: entry.value, stale: false }
    // Expired but still available as stale fallback
    return { value: entry.value, stale: true }
  }

  /** Store a value with optional custom TTL (ms). */
  set(key, value, ttl) {
    this.store.set(key, { value, ts: Date.now(), ttl: ttl ?? this.defaultTTL })
  }

  /** Remove a specific key. */
  invalidate(key) {
    this.store.delete(key)
  }

  /** Check if a fresh (non-stale) entry exists. */
  has(key) {
    const entry = this.get(key)
    return entry && !entry.stale
  }

  /** Clear all entries. */
  clear() {
    this.store.clear()
  }

  /** Number of entries (including stale). */
  get size() {
    return this.store.size
  }
}

/**
 * Wrap an async fetch function with caching.
 * Returns cached value if fresh; fetches and caches on miss.
 * On fetch error, returns stale cached value if available.
 */
export function withCache(cache, keyFn, fetchFn) {
  return async (...args) => {
    const key = keyFn(...args)
    const cached = cache.get(key)

    // Return fresh cached value immediately
    if (cached && !cached.stale) return cached.value

    try {
      const result = await fetchFn(...args)
      cache.set(key, result)
      return result
    } catch (err) {
      // On error, return stale data if available
      if (cached) return cached.value
      throw err
    }
  }
}

// Singleton cache instances with different TTLs
export const quoteCache   = new TTLCache(60_000)    // 60s for live quotes
export const historyCache = new TTLCache(300_000)   // 5min for chart history
export const metricsCache = new TTLCache(600_000)   // 10min for fundamentals
export const newsCache    = new TTLCache(300_000)   // 5min for news
export const searchCache  = new TTLCache(120_000)   // 2min for search results

// CoinMarketCap caches
export const cmcListingsCache = new TTLCache(300_000)   // 5min for CMC listings
export const cmcMetadataCache = new TTLCache(1_800_000) // 30min for coin metadata
export const fearGreedCache   = new TTLCache(1_800_000) // 30min for fear & greed

export default TTLCache
