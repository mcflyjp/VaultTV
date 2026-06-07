import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AddonsContext = createContext(null)

// --- Supabase helpers ---
async function fetchCloudAddons(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('addons')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data?.addons ?? null
}

async function pushCloudAddons(userId, addons) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, addons, updated_at: new Date().toISOString() })
  if (error) throw error
}

export function AddonsProvider({ children }) {
  const [addons, setAddons] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vt-addons') || '[]') }
    catch { return [] }
  })
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const userRef = useRef(null)

  // Track auth state changes so AddonsContext doesn't depend on AuthContext
  // (avoids circular provider ordering issues)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        userRef.current = session.user
        loadFromCloud(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const prev = userRef.current
      userRef.current = session?.user ?? null
      if (session?.user && !prev) {
        // Just logged in — pull cloud addons
        loadFromCloud(session.user.id)
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFromCloud(userId) {
    try {
      setSyncing(true)
      setSyncError(null)
      const cloud = await fetchCloudAddons(userId)
      if (cloud && cloud.length > 0) {
        // Cloud wins — replace local
        setAddons(cloud)
        localStorage.setItem('vt-addons', JSON.stringify(cloud))
      } else if (addons.length > 0) {
        // Local has data, cloud empty — push local up
        await pushCloudAddons(userId, addons)
      }
    } catch (e) {
      setSyncError('Cloud sync failed: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  async function saveAddons(list) {
    setAddons(list)
    localStorage.setItem('vt-addons', JSON.stringify(list))
    const user = userRef.current
    if (user) {
      try { await pushCloudAddons(user.id, list) }
      catch (e) { console.warn('Addon cloud push failed:', e.message) }
    }
  }

  function addAddon(manifest) {
    if (addons.find(a => a.id === manifest.id)) return
    saveAddons([...addons, manifest])
  }

  function removeAddon(id) {
    saveAddons(addons.filter(a => a.id !== id))
  }

  async function importFromUrl(manifestUrl) {
    const res = await fetch(manifestUrl)
    if (!res.ok) throw new Error('Failed to fetch manifest')
    const manifest = await res.json()
    addAddon({
      ...manifest,
      manifestUrl,
      catalogs: (manifest.catalogs || []).map(c => ({ type: c.type, id: c.id, name: c.name || c.id })),
    })
    return manifest
  }

  // Query addons for streams given type (movie/series) and imdbId
  async function getStreams(type, imdbId, season, episode) {
    // TMDB uses 'tv'; Stremio addons declare 'series' — map before querying
    const stremioType = type === 'tv' ? 'series' : type
    const results = []
    for (const addon of addons) {
      if (!addon.resources?.includes('stream')) continue
      if (!addon.types?.includes(stremioType)) continue
      try {
        const id = season != null ? `${imdbId}:${season}:${episode}` : imdbId
        const base = addon.manifestUrl.replace('/manifest.json', '')
        const res = await fetch(`${base}/stream/${stremioType}/${id}.json`)
        if (!res.ok) continue
        const data = await res.json()
        if (data.streams?.length) results.push(...data.streams.map(s => ({ ...s, addonName: addon.name })))
      } catch { /* addon offline, skip */ }
    }
    return results
  }

  // Query addons for subtitles — Stremio subtitle endpoint: /subtitles/{type}/{id}.json
  async function getSubtitles(type, imdbId, season, episode) {
    const stremioType = type === 'tv' ? 'series' : type
    const results = []
    for (const addon of addons) {
      const hasSubtitles = (addon.resources || []).some(r =>
        r === 'subtitles' || r?.name === 'subtitles'
      )
      if (!hasSubtitles) continue
      try {
        const id = season != null ? `${imdbId}:${season}:${episode}` : imdbId
        const base = addon.manifestUrl.replace('/manifest.json', '')
        const res = await fetch(`${base}/subtitles/${stremioType}/${id}.json`)
        if (!res.ok) continue
        const data = await res.json()
        if (data.subtitles?.length) {
          results.push(...data.subtitles.map(s => ({
            id:   s.id   || s.url,
            url:  s.url,
            lang: s.lang || s.id || 'Unknown',
            label: s.lang || s.id || 'Unknown',
            addonName: addon.name,
          })))
        }
      } catch { /* skip */ }
    }
    return results
  }

  return (
    <AddonsContext.Provider value={{ addons, addAddon, removeAddon, importFromUrl, getStreams, getSubtitles, saveAddons, syncing, syncError }}>
      {children}
    </AddonsContext.Provider>
  )
}

export function useAddons() {
  return useContext(AddonsContext)
}
