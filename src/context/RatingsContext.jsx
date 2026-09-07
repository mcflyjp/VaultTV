/**
 * RatingsContext
 *
 * The user's own star ratings, keyed by title, stored under 'vt-ratings'.
 * setTraktRatingSync lets TraktContext register a callback so a rating is
 * pushed to Trakt as well, without creating an import cycle between them.
 */

import { createContext, useContext, useState } from 'react'

const RatingsContext = createContext(null)

const load = () => { try { return JSON.parse(localStorage.getItem('vt-ratings') || '{}') } catch { return {} } }

// Trakt sync callback — set externally to avoid circular imports
let _traktSyncRating = null
export function setTraktRatingSync(fn) { _traktSyncRating = fn }

export function RatingsProvider({ children }) {
  const [ratings, setRatings] = useState(load)

  function setRating(id, type, score) {
    const next = { ...ratings, [`${type}-${id}`]: score }
    setRatings(next)
    localStorage.setItem('vt-ratings', JSON.stringify(next))
    // Sync to Trakt (score 1–10 maps directly)
    _traktSyncRating?.(type, id, score)
  }
  function getRating(id, type) { return ratings[`${type}-${id}`] || null }
  function clearRating(id, type) {
    const next = { ...ratings }
    delete next[`${type}-${id}`]
    setRatings(next)
    localStorage.setItem('vt-ratings', JSON.stringify(next))
  }

  return (
    <RatingsContext.Provider value={{ ratings, setRating, getRating, clearRating }}>
      {children}
    </RatingsContext.Provider>
  )
}

export function useRatings() { return useContext(RatingsContext) }
