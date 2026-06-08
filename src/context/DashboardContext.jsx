import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const DEFAULT_SECTIONS = [
  { id: 'trending',   title: 'Trending This Week', type: 'tmdb', key: 'trending',   visible: true  },
  { id: 'pop_movies', title: 'Popular Movies',      type: 'tmdb', key: 'pop_movies', visible: true  },
  { id: 'pop_tv',     title: 'Popular TV Shows',    type: 'tmdb', key: 'pop_tv',     visible: true  },
  { id: 'top_movies', title: 'Top Rated Movies',    type: 'tmdb', key: 'top_movies', visible: true  },
  { id: 'top_tv',     title: 'Top Rated TV Shows',  type: 'tmdb', key: 'top_tv',     visible: false },
]

const LS_KEY = 'vt-dashboard'
const DashboardContext = createContext(null)

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (saved?.length) return saved
  } catch {}
  return DEFAULT_SECTIONS
}

export function DashboardProvider({ children }) {
  const [sections, setSections] = useState(loadLocal)
  const [editing, setEditing]   = useState(false)
  const [syncing, setSyncing]   = useState(false)

  // ── Load from Supabase on sign-in (cloud wins over localStorage) ────
  useEffect(() => {
    async function loadFromCloud() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('user_settings')
        .select('dashboard_sections')
        .eq('user_id', session.user.id)
        .single()
      if (data?.dashboard_sections?.length) {
        // Merge: keep all cloud sections, then append any default sections
        // the user never removed (identified by id). This prevents a fresh sign-in
        // from wiping default TMDB shelves when only custom sections were saved.
        const cloud = data.dashboard_sections
        const cloudIds = new Set(cloud.map(s => s.id))
        const missing = DEFAULT_SECTIONS.filter(s => !cloudIds.has(s.id))
        const merged = [...cloud, ...missing]
        setSections(merged)
        localStorage.setItem(LS_KEY, JSON.stringify(merged))
      }
    }
    loadFromCloud()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') loadFromCloud()
    })
    return () => subscription.unsubscribe()
  }, [])

  const saveToCloud = useCallback(async (updated) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('user_settings').upsert({
        user_id:            session.user.id,
        dashboard_sections: updated,
        updated_at:         new Date().toISOString(),
      })
    } catch {}
  }, [])

  function save(updated) {
    setSections(updated)
    localStorage.setItem(LS_KEY, JSON.stringify(updated))
    saveToCloud(updated)
  }

  function toggleVisible(id)    { save(sections.map(s => s.id === id ? { ...s, visible: !s.visible } : s)) }
  function removeSection(id)    { save(sections.filter(s => s.id !== id)) }
  function reset()              { save(DEFAULT_SECTIONS) }

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

  return (
    <DashboardContext.Provider value={{ sections, editing, setEditing, syncing, toggleVisible, reorder, addAddonSection, removeSection, reset }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() { return useContext(DashboardContext) }
