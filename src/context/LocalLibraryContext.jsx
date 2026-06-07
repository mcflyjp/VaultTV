import { createContext, useContext, useState, useCallback } from 'react'
import { scanDirectory, parseFilename, matchTmdb } from '../lib/localScanner'

const LS_META = 'vt-local-library' // [{ id, filename, tmdbId, title, media_type, poster_path, year, overview, vote_average, parsedSeason, parsedEpisode }]
const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || ''

const LocalLibraryContext = createContext(null)

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(LS_META) || '[]') } catch { return [] }
}

export function LocalLibraryProvider({ children }) {
  const [files,    setFiles]    = useState(loadMeta)       // matched + cached items
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error,    setError]    = useState('')
  const [dirName,  setDirName]  = useState(() => localStorage.getItem('vt-local-dir') || '')

  // Map of filename → FileSystemFileHandle (in-memory only, not persisted)
  const [handles, setHandles] = useState({})

  function saveMeta(items) {
    setFiles(items)
    localStorage.setItem(LS_META, JSON.stringify(items))
  }

  const scanFolder = useCallback(async () => {
    setError('')
    let dirHandle
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'read' })
    } catch (e) {
      if (e.name !== 'AbortError') setError('Could not open folder: ' + e.message)
      return
    }

    setDirName(dirHandle.name)
    localStorage.setItem('vt-local-dir', dirHandle.name)
    setScanning(true)
    setProgress({ done: 0, total: 0 })

    try {
      // Walk all video files
      const found = await scanDirectory(dirHandle)
      setProgress({ done: 0, total: found.length })

      // Build handle map
      const newHandles = {}
      found.forEach(f => { newHandles[f.name] = f.handle })
      setHandles(prev => ({ ...prev, ...newHandles }))

      // Load existing cached metadata
      const existing = loadMeta()
      const existingByName = Object.fromEntries(existing.map(e => [e.filename, e]))

      const results = []
      for (let i = 0; i < found.length; i++) {
        const { name } = found[i]

        // Reuse cached match if already matched
        if (existingByName[name]) {
          results.push(existingByName[name])
          setProgress({ done: i + 1, total: found.length })
          continue
        }

        // Parse filename and query TMDB
        const parsed = parseFilename(name)
        const match  = await matchTmdb(parsed, TMDB_KEY)

        results.push({
          id:           name, // unique key
          filename:     name,
          tmdbId:       match?.tmdbId  || null,
          title:        match?.title   || parsed.title,
          media_type:   match?.media_type || (parsed.isTV ? 'tv' : 'movie'),
          poster_path:  match?.poster_path || null,
          year:         match?.year    || parsed.year || '',
          overview:     match?.overview || '',
          vote_average: match?.vote_average || 0,
          parsedSeason:  parsed.season  || null,
          parsedEpisode: parsed.episode || null,
          matched:      !!match,
        })

        setProgress({ done: i + 1, total: found.length })

        // Small delay to avoid hammering TMDB rate limit
        if (i % 5 === 4) await new Promise(r => setTimeout(r, 300))
      }

      saveMeta(results)
    } catch (e) {
      setError('Scan failed: ' + e.message)
    } finally {
      setScanning(false)
    }
  }, [])

  /** Re-request access to the same folder (call at session start if handles are empty) */
  const reGrantAccess = useCallback(async () => {
    if (!files.length) return
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      setDirName(dirHandle.name)
      localStorage.setItem('vt-local-dir', dirHandle.name)
      const found = await scanDirectory(dirHandle)
      const newHandles = {}
      found.forEach(f => { newHandles[f.name] = f.handle })
      setHandles(newHandles)
    } catch {}
  }, [files.length])

  /** Get a playable object URL for a local file */
  async function getFileUrl(filename) {
    const handle = handles[filename]
    if (!handle) throw new Error('File handle not available — rescan your folder in Settings.')
    const file = await handle.getFile()
    return URL.createObjectURL(file)
  }

  /** Check if a TMDB item has a local file */
  function getLocalFile(tmdbId, mediaType) {
    return files.find(f => f.tmdbId === tmdbId && f.media_type === mediaType) || null
  }

  /** Check if any local file exists for this tmdbId */
  function hasLocal(tmdbId, mediaType) {
    return files.some(f => f.tmdbId === tmdbId && f.media_type === mediaType)
  }

  function removeFile(filename) {
    saveMeta(files.filter(f => f.filename !== filename))
  }

  function clearLibrary() {
    saveMeta([])
    setHandles({})
    setDirName('')
    localStorage.removeItem('vt-local-dir')
  }

  const hasHandles = Object.keys(handles).length > 0

  return (
    <LocalLibraryContext.Provider value={{
      files, scanning, progress, error, dirName, hasHandles,
      scanFolder, reGrantAccess, getFileUrl, getLocalFile, hasLocal,
      removeFile, clearLibrary,
    }}>
      {children}
    </LocalLibraryContext.Provider>
  )
}

export function useLocalLibrary() {
  return useContext(LocalLibraryContext)
}
