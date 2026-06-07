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

  // Query an addon for streams given type (movie/series) and imdbId
  async function getStreams(type, imdbId, season, episode) {
    const results = []
    for (const addon of addons) {
      if (!addon.resources?.includes('stream')) continue
      if (!addon.types?.includes(type)) continue
      try {
        const id = season != null ? `${imdbId}:${season}:${episode}` : imdbId
        const base = addon.manifestUrl.replace('/manifest.json', '')
        const res = await fetch(`${base}/stream/${type}/${id}.json`)
        if (!res.ok) continue
        const data = await res.json()
        if (data.streams?.length) results.push(...data.streams.map(s => ({ ...s, addonName: addon.name })))
      } catch { /* addon offline, skip */ }
    }
    return results
  }

  return (
    <AddonsContext.Provider value={{ addons, addAddon, removeAddon, importFromUrl, getStreams, saveAddons }}>
      {children}
    </AddonsContext.Provider>
  )
}

export function useAddons() {
  return useContext(AddonsContext)
}
