import { createContext, useContext, useState } from 'react'

// TMDB certification order (US) — used for age-gating
const RATING_ORDER = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR']

const ParentalContext = createContext(null)

export function ParentalProvider({ children }) {
  const [enabled, setEnabled]   = useState(() => JSON.parse(localStorage.getItem('vt-pc-enabled') || 'false'))
  const [maxRating, setMaxRating] = useState(() => localStorage.getItem('vt-pc-rating') || 'PG-13')
  const [pin, setPin]           = useState(() => localStorage.getItem('vt-pc-pin') || '')
  const [unlocked, setUnlocked] = useState(false)

  function save({ enabled: e, maxRating: r, pin: p }) {
    setEnabled(e)
    setMaxRating(r)
    setPin(p)
    localStorage.setItem('vt-pc-enabled', JSON.stringify(e))
    localStorage.setItem('vt-pc-rating', r)
    localStorage.setItem('vt-pc-pin', p)
    setUnlocked(false)
  }

  function unlock(attempt) {
    if (attempt === pin) { setUnlocked(true); return true }
    return false
  }

  function isAllowed(certification) {
    if (!enabled || unlocked) return true
    if (!certification) return true // no rating = allow (TMDB sometimes omits)
    const maxIdx = RATING_ORDER.indexOf(maxRating)
    const itemIdx = RATING_ORDER.indexOf(certification)
    if (itemIdx === -1) return true // unknown rating = allow
    return itemIdx <= maxIdx
  }

  return (
    <ParentalContext.Provider value={{ enabled, maxRating, pin, unlocked, save, unlock, isAllowed, RATING_ORDER }}>
      {children}
    </ParentalContext.Provider>
  )
}

export function useParental() {
  return useContext(ParentalContext)
}
