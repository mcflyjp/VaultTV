import { createContext, useContext, useState } from 'react'

const RatingsContext = createContext(null)

const load = () => { try { return JSON.parse(localStorage.getItem('vt-ratings') || '{}') } catch { return {} } }

export function RatingsProvider({ children }) {
  const [ratings, setRatings] = useState(load)

  function setRating(id, type, score) {
    const next = { ...ratings, [`${type}-${id}`]: score }
    setRatings(next)
    localStorage.setItem('vt-ratings', JSON.stringify(next))
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
