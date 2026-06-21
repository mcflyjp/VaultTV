import { createContext, useContext, useState } from 'react'

const MetadataContext = createContext(null)

const LS_KEY = 'vt-metadata-overrides'

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

// Key: `${type}-${id}`
export function MetadataProvider({ children }) {
  const [overrides, setOverrides] = useState(load)

  function _key(id, type) { return `${type}-${id}` }

  function setMetadata(id, type, fields) {
    const key = _key(id, type)
    const next = { ...overrides, [key]: { ...(overrides[key] || {}), ...fields } }
    // Remove nullish fields
    for (const k of Object.keys(next[key])) {
      if (next[key][k] === '' || next[key][k] == null) delete next[key][k]
    }
    if (Object.keys(next[key]).length === 0) delete next[key]
    setOverrides(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  }

  function getMetadata(id, type) {
    return overrides[_key(id, type)] || null
  }

  function clearMetadata(id, type) {
    const next = { ...overrides }
    delete next[_key(id, type)]
    setOverrides(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  }

  return (
    <MetadataContext.Provider value={{ setMetadata, getMetadata, clearMetadata }}>
      {children}
    </MetadataContext.Provider>
  )
}

export function useMetadata() {
  return useContext(MetadataContext)
}
