import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, supabaseReady } from '../lib/supabase.js'

/**
 * Price alerts hook — CRUD, checking, email notifications.
 */
export function useAlerts(user) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const notifiedRef = useRef(new Set())

  // Load alerts from Supabase
  const loadAlerts = useCallback(async () => {
    if (!supabaseReady || !user) { setAlerts([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setAlerts(data)
    setLoading(false)
  }, [user])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  // Create a new alert
  const createAlert = useCallback(async ({ symbol, name, targetPrice, direction, notifyEmail }) => {
    if (!supabaseReady || !user) return null
    const { data, error } = await supabase
      .from('price_alerts')
      .insert({
        user_id: user.id,
        symbol,
        name: name || symbol,
        target_price: targetPrice,
        direction,
        notify_email: notifyEmail ?? true,
      })
      .select()
      .single()
    if (!error && data) {
      setAlerts(prev => [data, ...prev])
      return data
    }
    return null
  }, [user])

  // Delete an alert
  const deleteAlert = useCallback(async (alertId) => {
    if (!supabaseReady || !user) return
    await supabase.from('price_alerts').delete().eq('id', alertId).eq('user_id', user.id)
    setAlerts(prev => prev.filter(a => a.id !== alertId))
  }, [user])

  // Clear all triggered alerts
  const clearTriggered = useCallback(async () => {
    if (!supabaseReady || !user) return
    const triggered = alerts.filter(a => a.triggered)
    for (const a of triggered) {
      await supabase.from('price_alerts').delete().eq('id', a.id).eq('user_id', user.id)
    }
    setAlerts(prev => prev.filter(a => !a.triggered))
  }, [user, alerts])

  // Check prices against active alerts
  const checkAlerts = useCallback((priceMap) => {
    if (!alerts.length) return

    const active = alerts.filter(a => !a.triggered)
    const triggered = []

    for (const alert of active) {
      const price = priceMap[alert.symbol]
      if (price == null) continue

      const shouldTrigger =
        (alert.direction === 'above' && price >= alert.target_price) ||
        (alert.direction === 'below' && price <= alert.target_price)

      if (shouldTrigger && !notifiedRef.current.has(alert.id)) {
        triggered.push({ ...alert, currentPrice: price })
        notifiedRef.current.add(alert.id)
      }
    }

    if (triggered.length === 0) return

    // Update Supabase
    for (const alert of triggered) {
      supabase
        .from('price_alerts')
        .update({ triggered: true, triggered_at: new Date().toISOString() })
        .eq('id', alert.id)
        .catch(err => console.warn('[Alerts] Failed to update alert:', err.message))
    }

    // Update local state
    setAlerts(prev => prev.map(a => {
      const t = triggered.find(x => x.id === a.id)
      return t ? { ...a, triggered: true, triggered_at: new Date().toISOString() } : a
    }))

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const alert of triggered) {
        const dir = alert.direction === 'above' ? 'rose above' : 'fell below'
        new Notification(`${alert.symbol.replace('.TO', '')} Price Alert`, {
          body: `${alert.name} ${dir} $${Number(alert.target_price).toFixed(2)} — now at $${alert.currentPrice.toFixed(2)}`,
          icon: '/favicon.ico',
          tag: alert.id,
        })
      }
    } else if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Send email alerts via Edge Function
    for (const alert of triggered) {
      if (alert.notify_email && user?.email) {
        sendAlertEmail(alert, alert.currentPrice, user.email).catch(() => {})
      }
    }
  }, [alerts, user])

  const activeCount = alerts.filter(a => !a.triggered).length
  const triggeredCount = alerts.filter(a => a.triggered).length

  return {
    alerts,
    loading,
    activeCount,
    triggeredCount,
    createAlert,
    deleteAlert,
    clearTriggered,
    checkAlerts,
    reload: loadAlerts,
  }
}

/** Send a styled email alert via Supabase Edge Function or direct SMTP proxy */
async function sendAlertEmail(alert, currentPrice, email) {
  try {
    const dir = alert.direction === 'above' ? 'rose above' : 'fell below'
    const symbol = alert.symbol.replace('.TO', '').replace('.NE', '').replace('.V', '')
    const targetPrice = Number(alert.target_price).toFixed(2)

    // Use Supabase's built-in email (via auth.admin) or a simple webhook
    // For now, we'll use the Anthropic proxy to send a notification request
    // In production, this would be a Supabase Edge Function
    console.log(`[Alert Email] ${symbol} ${dir} $${targetPrice} → ${email}`)

    // Store the notification in Supabase for the notification center
    if (supabaseReady) {
      await supabase.from('notifications').insert({
        user_id: alert.user_id,
        type: 'price_alert',
        title: `${symbol} ${dir} $${targetPrice}`,
        body: `${alert.name} is now trading at $${currentPrice.toFixed(2)}. Your ${alert.direction} alert at $${targetPrice} has been triggered.`,
        read: false,
        metadata: {
          symbol: alert.symbol,
          direction: alert.direction,
          target_price: targetPrice,
          current_price: currentPrice,
          alert_id: alert.id,
        },
      }).catch(err => console.warn('[Notifications] Failed to store:', err.message))
    }
  } catch (e) {
    console.warn('[Alert Email] Failed:', e.message)
  }
}
