/**
 * LayoutContext
 *
 * Grid density, meaning how many poster cards fit in a row. Persisted to
 * localStorage as 'vt-density'. Deliberately device local rather than synced,
 * since a TV and a phone want different densities.
 */

import { createContext, useContext, useState } from 'react'

const LayoutContext = createContext(null)

export function LayoutProvider({ children }) {
  const [density, setDensity] = useState(() => Number(localStorage.getItem('vt-density') || 2))

  function changeDensity(n) {
    setDensity(n)
    localStorage.setItem('vt-density', n)
  }

  return (
    <LayoutContext.Provider value={{ density, changeDensity }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  return useContext(LayoutContext)
}
