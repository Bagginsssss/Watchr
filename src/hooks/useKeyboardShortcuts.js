import { useEffect } from 'react'

/**
 * Global keyboard shortcuts hook.
 * @param {Object} shortcuts - Map of key combos to handlers
 *   e.g. { 'cmd+k': () => openSearch(), 'Escape': () => close() }
 */
export function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    function handler(e) {
      // Don't trigger shortcuts when typing in inputs
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Only handle Escape in inputs
        if (e.key !== 'Escape') return
      }

      const isMeta = e.metaKey || e.ctrlKey

      for (const [combo, fn] of Object.entries(shortcuts)) {
        const parts = combo.toLowerCase().split('+')
        const needsMeta = parts.includes('cmd') || parts.includes('ctrl') || parts.includes('meta')
        const key = parts[parts.length - 1]

        if (needsMeta && !isMeta) continue
        if (!needsMeta && isMeta) continue
        if (e.key.toLowerCase() !== key) continue

        e.preventDefault()
        fn(e)
        return
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [shortcuts])
}
