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
