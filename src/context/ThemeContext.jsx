import { createContext, useContext, useState } from 'react'

export const THEMES = [
  { id: 'vault',   label: 'VaultTV',       color: '#7c3aed' },
  { id: 'netflix', label: 'Netflix',        color: '#e50914' },
  { id: 'disney',  label: 'Disney+',        color: '#0063e5' },
  { id: 'hbo',     label: 'HBO Max',        color: '#b535f5' },
  { id: 'prime',   label: 'Prime Video',    color: '#00a8e1' },
]

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('vt-theme') || 'vault')

  function changeTheme(id) {
    setTheme(id)
    localStorage.setItem('vt-theme', id)
  }

  return (
    <ThemeContext.Provider value={{ theme, changeTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
