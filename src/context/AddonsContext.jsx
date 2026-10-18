/**
 * AddonsContext
 *
 * The user's installed Stremio add-ons: the list of manifest URLs that every
 * stream and catalogue lookup is fanned out to. Stored in localStorage under
 * 'vt-addons' and mirrored to Supabase when signed in, so the same add-ons
 * follow the account onto another device.
 */

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AddonsContext = createContext(null)

// ── Supabase helpers ──────────────────────────────────────────────────────────
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

  // Query addons for streams given type (movie/series) and imdbId.
  // preferAddonName: if set, streams from that addon are sorted to the top (same-source auto-next).
  async function getStreams(type, imdbId, season, episode, { preferAddonName } = {}) {
    const stremioType = type === 'tv' ? 'series' : type
    const id = season != null ? `${imdbId}:${season}:${episode}` : imdbId

    // Query all eligible addons in parallel
    const eligible = addons.filter(a => a.resources?.includes('stream') && a.types?.includes(stremioType))
    const settled = await Promise.allSettled(
      eligible.map(async addon => {
        const base = addon.manifestUrl.replace('/manifest.json', '')
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        try {
          const res = await fetch(`${base}/stream/${stremioType}/${id}.json`, { signal: ctrl.signal })
          if (!res.ok) return []
          const data = await res.json()
          return (data.streams || []).map(s => ({ ...s, addonName: addon.name }))
        } finally { clearTimeout(timer) }
      })
    )

    const results = settled.flatMap(r => r.status === 'fulfilled' ? r.value : [])

    // Prefer streams from the same addon that was used for the previous episode
    if (preferAddonName) {
      results.sort((a, b) => {
        const aMatch = a.addonName === preferAddonName ? -1 : 0
        const bMatch = b.addonName === preferAddonName ? -1 : 0
        return aMatch - bMatch
      })
    }

    return results
  }

  /**
   * Query every eligible add-on, reporting each one as it answers.
   *
   * getStreams waits for all of them, so one slow add-on holds up every fast
   * one and the screen shows nothing until the slowest finishes. Add-ons differ
   * enormously here: a cached debrid lookup returns in well under a second
   * while a scraper can take the full eight second timeout.
   *
   * onUpdate receives the complete current picture each time anything changes,
   * so a caller can render the list, the per-source status, and which sources
   * are still working without tracking any of it itself.
   *
   * Returns a cancel function. Leaving a page mid-query is normal, and an
   * update landing afterwards would set state on something unmounted.
   */
  function getStreamsBySource(type, imdbId, season, episode, onUpdate) {
    const stremioType = type === 'tv' ? 'series' : type
    const id = season != null ? `${imdbId}:${season}:${episode}` : imdbId
    const eligible = addons.filter(a => a.resources?.includes('stream') && a.types?.includes(stremioType))

    let cancelled = false
    const controllers = []
    const sources = eligible.map(a => ({ name: a.name, status: 'loading', streams: [] }))

    const emit = () => { if (!cancelled) onUpdate(sources.map(s => ({ ...s }))) }
    emit()

    eligible.forEach((addon, i) => {
      const base = addon.manifestUrl.replace('/manifest.json', '')
      const ctrl = new AbortController()
      controllers.push(ctrl)
      const timer = setTimeout(() => ctrl.abort(), 8000)

      fetch(`${base}/stream/${stremioType}/${id}.json`, { signal: ctrl.signal })
        .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then(data => {
          sources[i].streams = (data.streams || []).map(s => ({ ...s, addonName: addon.name }))
          sources[i].status  = 'done'
        })
        .catch(e => {
          // A timeout is the common case and not worth distinguishing: either
          // way this source produced nothing and the user wants to know it is
          // finished rather than still working.
          sources[i].status = 'error'
          sources[i].error  = e.name === 'AbortError' ? 'timed out' : e.message
        })
        .finally(() => { clearTimeout(timer); emit() })
    })

    return () => {
      cancelled = true
      controllers.forEach(c => { try { c.abort() } catch { /* already settled */ } })
    }
  }

  // Query addons for subtitles in parallel
  async function getSubtitles(type, imdbId, season, episode) {
    const stremioType = type === 'tv' ? 'series' : type
    const id = season != null ? `${imdbId}:${season}:${episode}` : imdbId

    const eligible = addons.filter(a =>
      (a.resources || []).some(r => r === 'subtitles' || r?.name === 'subtitles')
    )
    const settled = await Promise.allSettled(
      eligible.map(async addon => {
        const base = addon.manifestUrl.replace('/manifest.json', '')
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        try {
          const res = await fetch(`${base}/subtitles/${stremioType}/${id}.json`, { signal: ctrl.signal })
          if (!res.ok) return []
          const data = await res.json()
          return (data.subtitles || []).map(s => ({
            id:        s.id   || s.url,
            url:       s.url,
            lang:      s.lang || s.id || 'Unknown',
            label:     s.lang || s.id || 'Unknown',
            addonName: addon.name,
          }))
        } finally { clearTimeout(timer) }
      })
    )

    return settled.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  }

  return (
    <AddonsContext.Provider value={{ addons, addAddon, removeAddon, importFromUrl, getStreams, getStreamsBySource, getSubtitles, saveAddons, syncing, syncError }}>
      {children}
    </AddonsContext.Provider>
  )
}

export function useAddons() {
  return useContext(AddonsContext)
}
