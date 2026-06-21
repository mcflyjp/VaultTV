import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const LS_KEY = 'vt-library'
const LibraryContext = createContext(null)

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{"movies":[],"shows":[]}') }
  catch { return { movies: [], shows: [] } }
}

// ── Trakt sync callback ref (set by TraktContext via setTraktSync) ───
// Using a ref avoids circular Provider dependencies.
let _traktAddToWatchlist    = null
let _traktRemoveFromWatchlist = null
export function setTraktWatchlistSync(add, remove) {
  _traktAddToWatchlist    = add
  _traktRemoveFromWatchlist = remove
}

export function LibraryProvider({ children }) {
  const [library, setLibrary] = useState(loadLocal)
  const saveTimer = useRef(null)

  // ── Load from Supabase on sign-in (cloud wins) ──────────────────────
  useEffect(() => {
    async function loadFromCloud() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('user_settings')
        .select('library')
        .eq('user_id', session.user.id)
        .single()
      if (data?.library) {
        const cloud = data.library
        // Merge: cloud items that aren't in local + keep local items
        const local = loadLocal()
        const merged = {
          movies: mergeItems(cloud.movies || [], local.movies || []),
          shows:  mergeItems(cloud.shows  || [], local.shows  || []),
        }
        setLibrary(merged)
        localStorage.setItem(LS_KEY, JSON.stringify(merged))
      }
    }
    loadFromCloud()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') loadFromCloud()
    })
    return () => subscription.unsubscribe()
  }, [])

  /** Merge cloud + local: cloud is source of truth, local fills any gaps */
  function mergeItems(cloud, local) {
    const byId = new Map(cloud.map(i => [i.id, i]))
    local.forEach(i => { if (!byId.has(i.id)) byId.set(i.id, i) })
    return [...byId.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  }

  const saveToCloud = useCallback(async (lib) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('user_settings').upsert({
        user_id:    session.user.id,
        library:    lib,
        updated_at: new Date().toISOString(),
      })
    } catch {}
  }, [])

  function save(next) {
    setLibrary(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
    // Debounce cloud saves — library can change rapidly
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveToCloud(next), 1500)
  }

  function isSaved(id, type) {
    const list = type === 'movie' ? library.movies : library.shows
    return list.some(i => i.id === id)
  }

  /** Toggle save — item can carry genre_ids from TMDB for filtering */
  function toggle(item) {
    const key  = item.type === 'movie' ? 'movies' : 'shows'
    const list = library[key]
    const exists = list.some(i => i.id === item.id)

    if (exists) {
      save({ ...library, [key]: list.filter(i => i.id !== item.id) })
      _traktRemoveFromWatchlist?.(item.type, item.id)
    } else {
      const entry = {
        id:         item.id,
        type:       item.type || (item.first_air_date ? 'tv' : 'movie'),
        title:      item.title || item.name || '',
        poster_path: item.poster_path || null,
        genre_ids:  item.genre_ids || [],
        savedAt:    Date.now(),
      }
      save({ ...library, [key]: [entry, ...list] })
      _traktAddToWatchlist?.(entry.type, entry.id)
    }
  }

  function removeFromLibrary(id, type) {
    const key = type === 'movie' ? 'movies' : 'shows'
    const item = library[key].find(i => i.id === id)
    save({ ...library, [key]: library[key].filter(i => i.id !== id) })
    if (item) _traktRemoveFromWatchlist?.(type, id)
  }

  return (
    <LibraryContext.Provider value={{ library, isSaved, toggle, removeFromLibrary }}>
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() { return useContext(LibraryContext) }
