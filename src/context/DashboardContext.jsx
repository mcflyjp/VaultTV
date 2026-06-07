import { createContext, useContext, useState, useCallback } from 'react'

// Default built-in TMDB sections
export const DEFAULT_SECTIONS = [
  { id: 'trending',      title: 'Trending This Week', type: 'tmdb', key: 'trending',      visible: true },
  { id: 'pop_movies',    title: 'Popular Movies',      type: 'tmdb', key: 'pop_movies',    visible: true },
  { id: 'pop_tv',        title: 'Popular TV Shows',    type: 'tmdb', key: 'pop_tv',        visible: true },
  { id: 'top_movies',    title: 'Top Rated Movies',    type: 'tmdb', key: 'top_movies',    visible: true },
  { id: 'top_tv',        title: 'Top Rated TV Shows',  type: 'tmdb', key: 'top_tv',        visible: false },
]

const DashboardContext = createContext(null)

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem('vt-dashboard') || 'null')
    if (saved?.length) return saved
  } catch {}
  return DEFAULT_SECTIONS
}

export function DashboardProvider({ children }) {
  const [sections, setSections] = useState(load)
  const [editing, setEditing] = useState(false)

  function save(updated) {
    setSections(updated)
    localStorage.setItem('vt-dashboard', JSON.stringify(updated))
  }

  function toggleVisible(id) {
    save(sections.map(s => s.id === id ? { ...s, visible: !s.visible } : s))
  }

  function reorder(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const next = [...sections]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    save(next)
  }

  function addAddonSection(section) {
    if (sections.find(s => s.id === section.id)) return
    save([...sections, { ...section, visible: true }])
  }

  function removeSection(id) {
    save(sections.filter(s => s.id !== id))
  }

  function reset() {
    save(DEFAULT_SECTIONS)
  }

  return (
    <DashboardContext.Provider value={{ sections, editing, setEditing, toggleVisible, reorder, addAddonSection, removeSection, reset }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  return useContext(DashboardContext)
}
