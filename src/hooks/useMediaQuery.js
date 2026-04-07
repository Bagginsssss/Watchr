import { useState, useEffect } from 'react'

/**
 * React hook for responsive breakpoints.
 * @param {string} query - CSS media query string, e.g. '(max-width: 768px)'
 * @returns {boolean} Whether the media query matches
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    setMatches(mql.matches)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** Convenience: true when viewport ≤ 768px */
export function useMobile() {
  return useMediaQuery('(max-width: 768px)')
}

/** Convenience: true when viewport ≤ 480px */
export function useSmallMobile() {
  return useMediaQuery('(max-width: 480px)')
}
