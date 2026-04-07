import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Auto-refresh hook that pauses when the browser tab is hidden.
 * @param {Function} callback - Async function to call on each refresh
 * @param {number} intervalMs - Refresh interval in milliseconds (default: 60000)
 * @returns {{ lastUpdated: Date|null, isRefreshing: boolean, refresh: Function, timeAgo: string }}
 */
export function useAutoRefresh(callback, intervalMs = 60000) {
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const timerRef = useRef(null)
  const callbackRef = useRef(callback)

  // Keep callback ref current without restarting interval
  useEffect(() => { callbackRef.current = callback }, [callback])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await callbackRef.current()
      setLastUpdated(new Date())
    } catch {
      // Error handled by the callback itself
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    function startTimer() {
      clearInterval(timerRef.current)
      timerRef.current = setInterval(refresh, intervalMs)
    }

    function handleVisibility() {
      if (document.hidden) {
        clearInterval(timerRef.current)
      } else {
        // Refresh immediately when tab becomes visible, then restart timer
        refresh()
        startTimer()
      }
    }

    startTimer()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [intervalMs, refresh])

  // Human-readable time ago
  const [timeAgo, setTimeAgo] = useState('')
  useEffect(() => {
    if (!lastUpdated) { setTimeAgo(''); return }
    function update() {
      const secs = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
      if (secs < 5) setTimeAgo('just now')
      else if (secs < 60) setTimeAgo(`${secs}s ago`)
      else setTimeAgo(`${Math.floor(secs / 60)}m ago`)
    }
    update()
    const id = setInterval(update, 5000)
    return () => clearInterval(id)
  }, [lastUpdated])

  return { lastUpdated, isRefreshing, refresh, timeAgo }
}
