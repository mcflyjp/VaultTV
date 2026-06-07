import { createContext, useContext, useState } from 'react'

const AddonsContext = createContext(null)

export function AddonsProvider({ children }) {
  const [addons, setAddons] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vt-addons') || '[]') }
    catch { return [] }
  })

  function saveAddons(list) {
    setAddons(list)
    localStorage.setItem('vt-addons', JSON.stringify(list))
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
      // Check if addon declares subtitle resource (string or object form)
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
    <AddonsContext.Provider value={{ addons, addAddon, removeAddon, importFromUrl, getStreams, getSubtitles, saveAddons }}>
      {children}
    </AddonsContext.Provider>
  )
}

export function useAddons() {
  return useContext(AddonsContext)
}
