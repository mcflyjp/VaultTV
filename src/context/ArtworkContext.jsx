/**
 * ArtworkContext — stores custom poster and backdrop (banner) overrides
 * for any movie or TV show, keyed by `{type}-{id}-{slot}`.
 *
 * Slot is 'poster' (2:3 portrait) or 'backdrop' (16:9 wide banner).
 *
 * Data is persisted to localStorage.  Legacy keys (`{type}-{id}` with no slot)
 * are read for backward compatibility and treated as poster overrides.
 */

import { createContext, useContext, useState } from 'react'

const ArtworkContext = createContext(null)

const LS_KEY = 'vt-artwork'

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

export function ArtworkProvider({ children }) {
  const [overrides, setOverrides] = useState(load)

  function _key(id, type, slot) { return `${type}-${id}-${slot}` }

  /** Set a custom image URL for a specific slot ('poster' or 'backdrop') */
  function setArtwork(id, type, url, slot = 'poster') {
    const next = { ...overrides, [_key(id, type, slot)]: url }
    setOverrides(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  }

  /**
   * Get the custom image URL for a specific slot.
   * Falls back to legacy key format (no slot suffix) for poster backward compat.
   */
  function getArtwork(id, type, slot = 'poster') {
    return overrides[_key(id, type, slot)]
      || (slot === 'poster' ? overrides[`${type}-${id}`] : null)
      || null
  }

  /** Clear a specific slot, or pass slot=null to clear both */
  function clearArtwork(id, type, slot = 'poster') {
    const next = { ...overrides }
    if (slot === null) {
      delete next[_key(id, type, 'poster')]
      delete next[_key(id, type, 'backdrop')]
      delete next[`${type}-${id}`]  // legacy key
    } else {
      delete next[_key(id, type, slot)]
      if (slot === 'poster') delete next[`${type}-${id}`]  // legacy
    }
    setOverrides(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  }

  /** Convenience wrappers */
  function getPoster(id, type)   { return getArtwork(id, type, 'poster')   }
  function getBackdrop(id, type) { return getArtwork(id, type, 'backdrop') }

  return (
    <ArtworkContext.Provider value={{ overrides, setArtwork, getArtwork, clearArtwork, getPoster, getBackdrop }}>
      {children}
    </ArtworkContext.Provider>
  )
}

export function useArtwork() { return useContext(ArtworkContext) }
