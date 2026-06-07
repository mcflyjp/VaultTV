import { createContext, useContext, useState } from 'react'

const LibraryContext = createContext(null)

function load() {
  try { return JSON.parse(localStorage.getItem('vt-library') || '{"movies":[],"shows":[]}') }
  catch { return { movies: [], shows: [] } }
}

export function LibraryProvider({ children }) {
  const [library, setLibrary] = useState(load)

  function save(next) {
    setLibrary(next)
    localStorage.setItem('vt-library', JSON.stringify(next))
  }

  function isSaved(id, type) {
    const list = type === 'movie' ? library.movies : library.shows
    return list.some(i => i.id === id)
  }

  function toggle(item) {
    const key  = item.type === 'movie' ? 'movies' : 'shows'
    const list = library[key]
    const exists = list.some(i => i.id === item.id)
    save({
      ...library,
      [key]: exists
        ? list.filter(i => i.id !== item.id)
        : [{ ...item, savedAt: Date.now() }, ...list],
    })
  }

  function removeFromLibrary(id, type) {
    const key = type === 'movie' ? 'movies' : 'shows'
    save({ ...library, [key]: library[key].filter(i => i.id !== id) })
  }

  return (
    <LibraryContext.Provider value={{ library, isSaved, toggle, removeFromLibrary }}>
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  return useContext(LibraryContext)
}
