import { createContext, useContext, useState } from 'react'

export const THEMES = [
  { id: 'vault',      label: 'VaultTV',      color: '#7c3aed' },
  { id: 'vaultflix',  label: 'Vaultflix',    color: '#e50914' },
  { id: 'vaultplus',  label: 'Vault+',       color: '#0063e5' },
  { id: 'vaultmax',   label: 'Vault Max',    color: '#b535f5' },
  { id: 'vaultprime', label: 'Vault Prime',  color: '#00a8e1' },
]

const ThemeContext = createContext(null)

// Migrate old theme IDs → new names (copyright-safe rename)
const THEME_MIGRATE = { netflix: 'vaultflix', disney: 'vaultplus', hbo: 'vaultmax', prime: 'vaultprime' }

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('vt-theme') || 'vault'
    return THEME_MIGRATE[saved] || saved
  })

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
