import { createContext, useContext, useState } from 'react'

const PlaylistContext = createContext(null)

const load = () => { try { return JSON.parse(localStorage.getItem('vt-playlists') || '[]') } catch { return [] } }

export function PlaylistProvider({ children }) {
  const [playlists, setPlaylists] = useState(load)

  function save(next) { setPlaylists(next); localStorage.setItem('vt-playlists', JSON.stringify(next)) }

  function createPlaylist(name) {
    const pl = { id: Date.now().toString(), name, items: [], createdAt: Date.now() }
    save([...playlists, pl])
    return pl
  }
  function deletePlaylist(id) { save(playlists.filter(p => p.id !== id)) }
  function addToPlaylist(playlistId, item) {
    save(playlists.map(p =>
      p.id === playlistId && !p.items.find(i => i.id === item.id && i.type === item.type)
        ? { ...p, items: [...p.items, item] }
        : p
    ))
  }
  function removeFromPlaylist(playlistId, itemId, itemType) {
    save(playlists.map(p =>
      p.id === playlistId
        ? { ...p, items: p.items.filter(i => !(i.id === itemId && i.type === itemType)) }
        : p
    ))
  }
  function renamePlaylist(id, name) {
    save(playlists.map(p => p.id === id ? { ...p, name } : p))
  }

  return (
    <PlaylistContext.Provider value={{ playlists, createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, renamePlaylist }}>
      {children}
    </PlaylistContext.Provider>
  )
}

export function usePlaylist() { return useContext(PlaylistContext) }
