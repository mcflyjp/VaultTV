import { createContext, useContext, useState } from 'react'

const ArtworkContext = createContext(null)

const load = () => { try { return JSON.parse(localStorage.getItem('vt-artwork') || '{}') } catch { return {} } }

export function ArtworkProvider({ children }) {
  const [overrides, setOverrides] = useState(load)

  function setArtwork(id, type, url) {
    const next = { ...overrides, [`${type}-${id}`]: url }
    setOverrides(next)
    localStorage.setItem('vt-artwork', JSON.stringify(next))
  }
  function getArtwork(id, type) { return overrides[`${type}-${id}`] || null }
  function clearArtwork(id, type) {
    const next = { ...overrides }
    delete next[`${type}-${id}`]
    setOverrides(next)
    localStorage.setItem('vt-artwork', JSON.stringify(next))
  }

  return (
    <ArtworkContext.Provider value={{ overrides, setArtwork, getArtwork, clearArtwork }}>
      {children}
    </ArtworkContext.Provider>
  )
}

export function useArtwork() { return useContext(ArtworkContext) }
