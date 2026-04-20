import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseReady } from '../lib/supabase.js'

/**
 * Portfolio snapshots hook.
 * Auto-takes a daily snapshot when portfolio loads.
 * Fetches history for performance chart.
 */
export function usePortfolioHistory(user) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  // Load snapshot history
  const loadHistory = useCallback(async () => {
    if (!supabaseReady || !user) { setHistory([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true })
    if (!error && data) setHistory(data)
    setLoading(false)
  }, [user])

  useEffect(() => { loadHistory() }, [loadHistory])

  // Upsert today's snapshot — overwrites on every call so the chart's
  // latest bar always matches the live market-value card above it.
  const takeSnapshot = useCallback(async (totalValue, totalCost) => {
    if (!supabaseReady || !user || totalValue <= 0) return
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .upsert({
        user_id: user.id,
        snapshot_date: today,
        total_value: totalValue,
        total_cost: totalCost,
      }, { onConflict: 'user_id,snapshot_date' })
      .select()
      .single()

    if (!error && data) {
      setHistory(prev => {
        const filtered = prev.filter(h => h.snapshot_date !== today)
        return [...filtered, data].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      })
    }
  }, [user])

  // Filter history by range
  const getFilteredHistory = useCallback((range) => {
    if (!history.length) return []
    const now = new Date()
    const cutoff = new Date()

    switch (range) {
      case '1M': cutoff.setMonth(now.getMonth() - 1); break
      case '3M': cutoff.setMonth(now.getMonth() - 3); break
      case '6M': cutoff.setMonth(now.getMonth() - 6); break
      case '1Y': cutoff.setFullYear(now.getFullYear() - 1); break
      default: return history // 'All'
    }

    return history.filter(h => new Date(h.snapshot_date) >= cutoff)
  }, [history])

  return {
    history,
    loading,
    takeSnapshot,
    getFilteredHistory,
    reload: loadHistory,
  }
}
