import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { scanDirectory, parseFilename, matchTmdb } from '../lib/localScanner'

/**
 * sources (localStorage: vt-local-sources)
 *   [{ id, name, type: 'movie'|'tv', dirName, fileCount, scannedAt }]
 *
 * files (localStorage: vt-local-library)
 *   [{ id, filename, sourceId, tmdbId, title, media_type, poster_path,
 *      year, overview, vote_average, parsedSeason, parsedEpisode, matched }]
 */

const LS_SOURCES = 'vt-local-sources'
const LS_FILES   = 'vt-local-library'
const TMDB_KEY   = import.meta.env.VITE_TMDB_KEY || ''

const LocalLibraryContext = createContext(null)

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

export function LocalLibraryProvider({ children }) {
  const [sources,  setSources]  = useState(() => loadJson(LS_SOURCES, []))
  const [files,    setFiles]    = useState(() => loadJson(LS_FILES,   []))
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
  const [error,    setError]    = useState('')

  // In-memory: sourceId → FileSystemDirectoryHandle
  const dirHandles = useRef({})
  // In-memory: filename → FileSystemFileHandle (across all sources)
  const fileHandles = useRef({})

  function saveSources(next) { setSources(next); localStorage.setItem(LS_SOURCES, JSON.stringify(next)) }
  function saveFiles(next)   { setFiles(next);   localStorage.setItem(LS_FILES,   JSON.stringify(next)) }

  // ── Add a new folder source ───────────────────────────────────
  const addSource = useCallback(async (mediaType) => {
    setError('')
    let dirHandle
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'read' })
    } catch (e) {
      if (e.name !== 'AbortError') setError('Could not open folder: ' + e.message)
      return
    }

    const id = `src_${Date.now()}`
    dirHandles.current[id] = dirHandle

    const newSource = { id, name: dirHandle.name, type: mediaType, dirName: dirHandle.name, fileCount: 0, scannedAt: null }
    const nextSources = [...sources, newSource]
    saveSources(nextSources)

    // Immediately scan this new source
    await scanSource(newSource, nextSources)
  }, [sources, files]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Remove a source and its files ───────────────────────────
  function removeSource(id) {
    delete dirHandles.current[id]
    const nextFiles = files.filter(f => f.sourceId !== id)
    saveFiles(nextFiles)
    // Remove file handles for this source's files
    files.filter(f => f.sourceId === id).forEach(f => { delete fileHandles.current[f.filename] })
    saveSources(sources.filter(s => s.id !== id))
  }

  // ── Scan a single source (internal) ─────────────────────────
  async function scanSource(source, currentSources) {
    setScanning(true)
    setError('')

    let dirHandle = dirHandles.current[source.id]

    // If no handle in memory, ask user to re-grant
    if (!dirHandle) {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'read' })
        dirHandles.current[source.id] = dirHandle
        // Update dirName in case folder was moved
        const nextSources = (currentSources || sources).map(s =>
          s.id === source.id ? { ...s, dirName: dirHandle.name } : s
        )
        saveSources(nextSources)
      } catch {
        setError(`Re-grant access for "${source.dirName}" to rescan.`)
        setScanning(false)
        return
      }
    }

    try {
      const found = await scanDirectory(dirHandle)

      // Register file handles
      found.forEach(f => { fileHandles.current[f.name] = f.handle })

      setProgress({ done: 0, total: found.length, label: source.name })

      // Load existing files for OTHER sources (keep them)
      const otherFiles = files.filter(f => f.sourceId !== source.id)
      // Existing cached files for THIS source
      const existingByName = Object.fromEntries(
        files.filter(f => f.sourceId === source.id).map(f => [f.filename, f])
      )

      const results = []
      for (let i = 0; i < found.length; i++) {
        const { name } = found[i]

        // Reuse cached match if filename hasn't changed
        if (existingByName[name]) {
          results.push(existingByName[name])
          setProgress(p => ({ ...p, done: i + 1 }))
          continue
        }

        const parsed = parseFilename(name)
        // Override media type from source setting, unless auto
        const forcedType = source.type // 'movie' | 'tv'
        const match = await matchTmdb({ ...parsed, isTV: forcedType === 'tv' }, TMDB_KEY, forcedType)

        results.push({
          id:            `${source.id}::${name}`,
          filename:      name,
          sourceId:      source.id,
          sourceType:    source.type,
          tmdbId:        match?.tmdbId  || null,
          title:         match?.title   || parsed.title,
          media_type:    match?.media_type || forcedType,
          poster_path:   match?.poster_path || null,
          year:          match?.year    || parsed.year || '',
          overview:      match?.overview || '',
          vote_average:  match?.vote_average || 0,
          parsedSeason:  parsed.season  || null,
          parsedEpisode: parsed.episode || null,
          matched:       !!match,
        })

        setProgress(p => ({ ...p, done: i + 1 }))
        if (i % 5 === 4) await new Promise(r => setTimeout(r, 300))
      }

      const allFiles = [...otherFiles, ...results]
      saveFiles(allFiles)

      // Update source metadata
      const nextSources = (currentSources || sources).map(s =>
        s.id === source.id ? { ...s, fileCount: results.length, scannedAt: Date.now() } : s
      )
      saveSources(nextSources)

    } catch (e) {
      setError('Scan failed: ' + e.message)
    } finally {
      setScanning(false)
      setProgress({ done: 0, total: 0, label: '' })
    }
  }

  // ── Re-scan a specific source by id ─────────────────────────
  const rescanSource = useCallback(async (id) => {
    const source = sources.find(s => s.id === id)
    if (!source) return
    await scanSource(source, sources)
  }, [sources, files]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-grant access for all sources that lost their handle ──
  const reGrantAll = useCallback(async () => {
    for (const source of sources) {
      if (dirHandles.current[source.id]) continue
      try {
        const dh = await window.showDirectoryPicker({ mode: 'read' })
        dirHandles.current[source.id] = dh
        const found = await scanDirectory(dh)
        found.forEach(f => { fileHandles.current[f.name] = f.handle })
      } catch { break } // user cancelled
    }
  }, [sources])

  // ── Get playable URL for a local file ───────────────────────
  async function getFileUrl(filename) {
    const handle = fileHandles.current[filename]
    if (!handle) {
      throw new Error('File handle unavailable — click "Re-grant Access" in Settings → Local Library.')
    }
    const file = await handle.getFile()
    return URL.createObjectURL(file)
  }

  function getLocalFile(tmdbId, mediaType) {
    return files.find(f => f.tmdbId === tmdbId && f.media_type === mediaType) || null
  }

  function hasLocal(tmdbId, mediaType) {
    return files.some(f => f.tmdbId === tmdbId && f.media_type === mediaType)
  }

  function clearAll() {
    dirHandles.current = {}
    fileHandles.current = {}
    saveSources([])
    saveFiles([])
  }

  const hasHandles = Object.keys(dirHandles.current).length > 0

  return (
    <LocalLibraryContext.Provider value={{
      sources, files, scanning, progress, error, hasHandles,
      addSource, removeSource, rescanSource, reGrantAll,
      getFileUrl, getLocalFile, hasLocal, clearAll,
    }}>
      {children}
    </LocalLibraryContext.Provider>
  )
}

export function useLocalLibrary() {
  return useContext(LocalLibraryContext)
}
