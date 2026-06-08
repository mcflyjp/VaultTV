import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { scanDirectory, parseFilename, matchTmdb, parseQuality } from '../lib/localScanner'
import {
  pingCompanion, addWatchedFolder, removeWatchedFolder, subscribeToChanges,
  scanFolder, streamUrl, fetchLibrary, saveLibrary, listWatchedFolders,
} from '../lib/companion'
import { supabase } from '../lib/supabase'

const IS_ELECTRON = !!window.electronAPI?.isElectron

// ── Supabase sync helpers ──────────────────────────────────────────────────
// Syncs local library metadata (sources + files) so other devices (phone,
// another PC) can see the same titles in My Library and stream via addons.
// companionPath is stripped before cloud upload — it's machine-specific.

async function pushLocalLibraryToCloud(userId, sources, files) {
  // Strip companionPath — it only means something on the machine that scanned
  const cloudFiles = files.map(({ companionPath: _cp, ...rest }) => rest)
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id:       userId,
      local_sources: sources,
      local_files:   cloudFiles,
      updated_at:    new Date().toISOString(),
    })
  if (error) throw error
}

async function fetchLocalLibraryFromCloud(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('local_sources, local_files')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return { sources: data?.local_sources ?? [], files: data?.local_files ?? [] }
}

/** Strip year suffixes and normalize a folder name for TMDB search */
function cleanFolderName(name) {
  return name
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*\[\d{4}\]\s*$/, '')
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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

  // Browser-only: in-memory FileSystem handles (not used in Electron)
  const dirHandles  = useRef({})
  const fileHandles = useRef({})

  const filesRef = useRef(files)

  const [companionOnline, setCompanionOnline] = useState(false)
  const companionUnsub    = useRef(null)
  const rescanSourceRef   = useRef(null)

  // Cloud user ref — tracked internally so we don't depend on AuthContext
  const cloudUserRef = useRef(null)

  function saveSources(next) {
    setSources(next)
    localStorage.setItem(LS_SOURCES, JSON.stringify(next))
  }
  function saveFiles(next) {
    setFiles(next)
    filesRef.current = next
    localStorage.setItem(LS_FILES, JSON.stringify(next))
  }

  // After both sources and files are saved, push to cloud if logged in.
  // Call this instead of saveSources+saveFiles separately when you want a sync.
  function saveAndSync(nextSources, nextFiles) {
    saveSources(nextSources)
    saveFiles(nextFiles)
    const user = cloudUserRef.current
    if (user) {
      pushLocalLibraryToCloud(user.id, nextSources, nextFiles).catch(e =>
        console.warn('[local-library] Cloud push failed:', e.message)
      )
    }
  }

  // ── Supabase auth listener — sync local library to/from cloud ──────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        cloudUserRef.current = session.user
        syncWithCloud(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const prev = cloudUserRef.current
      cloudUserRef.current = session?.user ?? null
      if (session?.user && !prev) syncWithCloud(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function syncWithCloud(userId) {
    try {
      const cloud = await fetchLocalLibraryFromCloud(userId)
      const localFiles   = JSON.parse(localStorage.getItem(LS_FILES)   || '[]')
      const localSources = JSON.parse(localStorage.getItem(LS_SOURCES) || '[]')

      if (cloud.files.length > 0) {
        // Cloud has data — merge: keep local files + add any cloud files not
        // already present (matched by id). Cloud items won't have companionPath
        // so they'll use addon streams on this device.
        const localIds = new Set(localFiles.map(f => f.id))
        const merged   = [...localFiles, ...cloud.files.filter(f => !localIds.has(f.id))]

        const localSourceIds = new Set(localSources.map(s => s.id))
        const mergedSources  = [...localSources, ...cloud.sources.filter(s => !localSourceIds.has(s.id))]

        if (merged.length > localFiles.length || mergedSources.length > localSources.length) {
          saveSources(mergedSources)
          saveFiles(merged)
          console.log(`[local-library] Merged ${cloud.files.length} cloud items into local library`)
        }
      } else if (localFiles.length > 0) {
        // Local has data, cloud empty — push local up
        await pushLocalLibraryToCloud(userId, localSources, localFiles)
        console.log('[local-library] Pushed local library to cloud')
      }
    } catch (e) {
      console.warn('[local-library] Cloud sync failed:', e.message)
    }
  }

  // ── Companion ping + SSE subscription ─────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function init() {
      const online = await pingCompanion()
      if (cancelled) return
      setCompanionOnline(online)
      if (!online) return

      // Load shared library from companion (LAN devices get same file list)
      try {
        const lib = await fetchLibrary()
        if (lib?.files?.length) {
          const local = JSON.parse(localStorage.getItem(LS_FILES) || '[]')
          if (lib.files.length >= local.length) {
            saveSources(lib.sources || [])
            saveFiles(lib.files)
          }
        }
      } catch (e) {
        console.warn('[companion] Could not load shared library:', e.message)
      }

      companionUnsub.current = subscribeToChanges(ev => {
        const sourcesNow = JSON.parse(localStorage.getItem('vt-local-sources') || '[]')
        const match =
          sourcesNow.find(s => s.id === ev.sourceId) ||
          sourcesNow.find(s => s.name?.toLowerCase() === ev.sourceName?.toLowerCase()) ||
          sourcesNow.find(s => s.dirName?.toLowerCase() === ev.sourceName?.toLowerCase())
        if (match) rescanSourceRef.current?.(match.id)
      })
    }
    init()
    // In Electron, retry companion ping every 3s on startup until it's ready
    let retryTimer
    if (IS_ELECTRON) {
      retryTimer = setInterval(async () => {
        if (cancelled) { clearInterval(retryTimer); return }
        const online = await pingCompanion()
        if (online) {
          setCompanionOnline(true)
          clearInterval(retryTimer)
        }
      }, 3000)
    }
    return () => {
      cancelled = true
      clearInterval(retryTimer)
      companionUnsub.current?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync companion watched folders when sources change
  useEffect(() => {
    if (!companionOnline) return
    listCompanionFolders()
  }, [sources, companionOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  async function listCompanionFolders() {
    try {
      const watched = await listWatchedFolders()
      const sourceIds = new Set(sources.map(s => s.id))
      for (const w of watched) {
        if (!sourceIds.has(w.id)) await removeWatchedFolder(w.id).catch(() => {})
      }
    } catch { /* companion may be offline */ }
  }

  // ── Scan via companion (Electron + companion-enriched browser scan) ────
  // Used exclusively in Electron where we have a real filesystem path.
  // Also called from the browser scan as an enrichment step.
  async function scanSourceViaCompanion(source, currentSources) {
    setScanning(true)
    setError('')
    try {
      let result
      try {
        result = await scanFolder(source.id)
      } catch (e) {
        // 404 means the companion lost its state (e.g. after reinstall).
        // Re-register the folder using the stored path and retry once.
        if (e.message.includes('404') && source.folderPath) {
          console.warn('[scanner] Companion lost folder state — re-registering:', source.id, source.folderPath)
          try {
            await addWatchedFolder({ id: source.id, folderPath: source.folderPath, type: source.type, name: source.dirName || source.name })
          } catch (regErr) {
            throw new Error(`Could not register folder "${source.folderPath}" with companion: ${regErr.message}`)
          }
          result = await scanFolder(source.id)
        } else if (e.message.includes('404') && !source.folderPath) {
          throw new Error('Folder path is missing — remove this folder and add it again')
        } else {
          throw e
        }
      }
      const companionFiles = result.files || []
      setProgress({ done: 0, total: companionFiles.length, label: source.dirName })

      const otherFiles = filesRef.current.filter(f => f.sourceId !== source.id)
      const existingByKey = Object.fromEntries(
        filesRef.current
          .filter(f => f.sourceId === source.id)
          .map(f => [`${f.showFolder || ''}::${f.filename}`, f])
      )

      const results = []
      const seenKeys = new Set()

      for (let i = 0; i < companionFiles.length; i++) {
        const { name, path: filePath, rootFolder } = companionFiles[i]
        const fileKey = `${rootFolder || ''}::${name}`
        if (seenKeys.has(fileKey)) { setProgress(p => ({ ...p, done: i + 1 })); continue }
        seenKeys.add(fileKey)

        // Reuse cached TMDB match if already matched; re-attempt if previously unmatched
        if (existingByKey[fileKey] && existingByKey[fileKey].matched !== false) {
          results.push({ ...existingByKey[fileKey], companionPath: filePath })
          setProgress(p => ({ ...p, done: i + 1 }))
          continue
        }

        const parsed = parseFilename(name)
        const forcedType = source.type
        const titleForTmdb = forcedType === 'tv' && rootFolder
          ? cleanFolderName(rootFolder)
          : parsed.title

        const match = await matchTmdb({ ...parsed, title: titleForTmdb, isTV: forcedType === 'tv' }, TMDB_KEY, forcedType)
        const quality = parseQuality(name)

        results.push({
          id:           `${source.id}::${fileKey}`,
          filename:     name,
          sourceId:     source.id,
          sourceType:   source.type,
          showFolder:   rootFolder || null,
          tmdbId:       match?.tmdbId  || null,
          title:        match?.title   || titleForTmdb || parsed.title,
          media_type:   match?.media_type || forcedType,
          poster_path:  match?.poster_path || null,
          year:         match?.year    || parsed.year || '',
          overview:     match?.overview || '',
          vote_average: match?.vote_average || 0,
          parsedSeason:  parsed.season  || null,
          parsedEpisode: parsed.episode || null,
          matched:      !!match,
          qualityScore: quality.score,
          qualityLabel: quality.label,
          companionPath: filePath,
        })

        setProgress(p => ({ ...p, done: i + 1 }))
        if (i % 5 === 4) await new Promise(r => setTimeout(r, 300))
      }

      const nextSources = (currentSources || sources).map(s =>
        s.id === source.id ? { ...s, fileCount: results.length, scannedAt: Date.now() } : s
      )
      const allFiles = [...otherFiles, ...results]

      // saveAndSync pushes to Supabase so other devices see these titles
      saveAndSync(nextSources, allFiles)

      if (companionOnline) {
        saveLibrary({ sources: nextSources, files: allFiles }).catch(() => {})
      }
    } catch (e) {
      setError('Scan failed: ' + e.message)
    } finally {
      setScanning(false)
      setProgress({ done: 0, total: 0, label: '' })
    }
  }

  // ── Add a new folder source ────────────────────────────────────────────
  const addSource = useCallback(async (mediaType) => {
    setError('')

    // ── Electron path: native file dialog + companion scanning ────────────
    if (IS_ELECTRON) {
      if (!companionOnline) {
        setError('Companion server is still starting. Please wait a moment and try again.')
        return
      }
      const folderInfo = await window.electronAPI.selectFolder()
      if (!folderInfo) return // user cancelled

      const id = `src_${Date.now()}`
      const newSource = {
        id, name: folderInfo.name, type: mediaType,
        dirName: folderInfo.name, folderPath: folderInfo.path,
        fileCount: 0, scannedAt: null,
      }
      const nextSources = [...sources, newSource]
      saveSources(nextSources)

      // Register folder with companion so it can scan + watch it
      try {
        await addWatchedFolder({ id, folderPath: folderInfo.path, type: mediaType, name: folderInfo.name })
      } catch (e) {
        setError('Could not register folder with companion server: ' + e.message)
        saveSources(sources) // roll back
        return
      }

      await scanSourceViaCompanion(newSource, nextSources)
      return
    }

    // ── Browser path: File System Access API ──────────────────────────────
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

    await scanSourceBrowser(newSource, nextSources)
  }, [sources, files, companionOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Browser scan (File System Access API) ─────────────────────────────
  async function scanSourceBrowser(source, currentSources) {
    setScanning(true)
    setError('')

    let dirHandle = dirHandles.current[source.id]
    if (!dirHandle) {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'read' })
        dirHandles.current[source.id] = dirHandle
        const next = (currentSources || sources).map(s =>
          s.id === source.id ? { ...s, dirName: dirHandle.name } : s
        )
        saveSources(next)
      } catch {
        setError(`Re-grant access for "${source.dirName}" to rescan.`)
        setScanning(false)
        return
      }
    }

    try {
      try {
        const perm = await dirHandle.queryPermission({ mode: 'read' })
        if (perm !== 'granted') {
          const req = await dirHandle.requestPermission({ mode: 'read' })
          if (req !== 'granted') {
            setError(`Permission denied for "${source.dirName}". Please try again.`)
            setScanning(false)
            return
          }
        }
      } catch (permErr) {
        console.warn('[scanner] queryPermission failed (may be fine):', permErr.message)
      }

      const found = await scanDirectory(dirHandle)
      found.forEach(f => { fileHandles.current[f.name] = f.handle })
      setProgress({ done: 0, total: found.length, label: source.name })

      const otherFiles = files.filter(f => f.sourceId !== source.id)
      const existingByKey = Object.fromEntries(
        files.filter(f => f.sourceId === source.id).map(f => [`${f.showFolder || ''}::${f.filename}`, f])
      )

      const results = []
      const seenIds = new Set()

      for (let i = 0; i < found.length; i++) {
        const { name, rootFolderName } = found[i]
        const fileKey = `${rootFolderName || ''}::${name}`
        const fileId  = `${source.id}::${fileKey}`
        if (seenIds.has(fileId)) { setProgress(p => ({ ...p, done: i + 1 })); continue }
        seenIds.add(fileId)

        if (existingByKey[fileKey]) {
          // Re-attempt TMDB match for previously unmatched files; skip re-scan for already-matched ones
          if (existingByKey[fileKey].matched !== false) {
            results.push(existingByKey[fileKey])
            setProgress(p => ({ ...p, done: i + 1 }))
            continue
          }
        }

        const parsed = parseFilename(name)
        const forcedType = source.type
        const titleForTmdb = forcedType === 'tv' && rootFolderName
          ? cleanFolderName(rootFolderName)
          : parsed.title

        const match = await matchTmdb({ ...parsed, title: titleForTmdb, isTV: forcedType === 'tv' }, TMDB_KEY, forcedType)
        const quality = parseQuality(name)

        results.push({
          id:           fileId,
          filename:     name,
          sourceId:     source.id,
          sourceType:   source.type,
          showFolder:   rootFolderName || null,
          tmdbId:       match?.tmdbId  || null,
          title:        match?.title   || titleForTmdb || parsed.title,
          media_type:   match?.media_type || forcedType,
          poster_path:  match?.poster_path || null,
          year:         match?.year    || parsed.year || '',
          overview:     match?.overview || '',
          vote_average: match?.vote_average || 0,
          parsedSeason:  parsed.season  || null,
          parsedEpisode: parsed.episode || null,
          matched:      !!match,
          qualityScore: quality.score,
          qualityLabel: quality.label,
        })

        setProgress(p => ({ ...p, done: i + 1 }))
        if (i % 5 === 4) await new Promise(r => setTimeout(r, 300))
      }

      // Enrich with companion paths (enables permission-free streaming)
      if (companionOnline) {
        try {
          const watched = await listWatchedFolders()
          const cf =
            watched.find(w => w.id === source.id) ||
            watched.find(w => w.name?.toLowerCase() === source.dirName?.toLowerCase())
          if (cf) {
            const scan = await scanFolder(cf.id)
            const pathMap = new Map(
              scan.files.map(f => [`${f.rootFolder || ''}::${f.name}`, f.path])
            )
            results.forEach(r => {
              const key = `${r.showFolder || ''}::${r.filename}`
              const p = pathMap.get(key) || pathMap.get(`::${r.filename}`)
              if (p) r.companionPath = p
            })
          }
        } catch (e) {
          console.warn('[scanner] Companion enrichment failed:', e.message)
        }
      }

      const nextSources = (currentSources || sources).map(s =>
        s.id === source.id ? { ...s, fileCount: results.length, scannedAt: Date.now() } : s
      )
      const allFiles = [...otherFiles, ...results]

      saveAndSync(nextSources, allFiles)

      if (companionOnline) {
        saveLibrary({ sources: nextSources, files: allFiles }).catch(() => {})
      }
    } catch (e) {
      setError('Scan failed: ' + e.message)
    } finally {
      setScanning(false)
      setProgress({ done: 0, total: 0, label: '' })
    }
  }

  // ── Remove source ──────────────────────────────────────────────────────
  function removeSource(id) {
    delete dirHandles.current[id]
    const nextFiles = files.filter(f => f.sourceId !== id)
    saveFiles(nextFiles)
    files.filter(f => f.sourceId === id).forEach(f => { delete fileHandles.current[f.filename] })
    saveSources(sources.filter(s => s.id !== id))
    if (companionOnline) removeWatchedFolder(id).catch(() => {})
  }

  // ── Rescan a source ───────────────────────────────────────────────────
  const rescanSource = useCallback(async (id) => {
    let source = sources.find(s => s.id === id)
    if (!source) return

    if (IS_ELECTRON) {
      // If folderPath is missing (source added before folderPath was saved),
      // ask the user to re-pick the folder so we can register it with the companion.
      if (!source.folderPath) {
        setError('')
        const folderInfo = await window.electronAPI?.selectFolder()
        if (!folderInfo) {
          setError(`"${source.name}" is missing its folder path — please pick the folder when prompted.`)
          return
        }
        // Persist the recovered path into sources
        const patchedSources = sources.map(s =>
          s.id === id ? { ...s, folderPath: folderInfo.path, dirName: folderInfo.name || s.dirName } : s
        )
        saveSources(patchedSources)
        source = patchedSources.find(s => s.id === id)
      }

      // Re-register with companion (companion loses state after restart/reinstall)
      if (source.folderPath && companionOnline) {
        try {
          await addWatchedFolder({ id: source.id, folderPath: source.folderPath, type: source.type, name: source.name })
        } catch (regErr) {
          // Log but don't abort — scanSourceViaCompanion has its own recovery
          console.warn('[scanner] Pre-registration failed:', regErr.message)
        }
      }
      await scanSourceViaCompanion(source, sources)
    } else {
      await scanSourceBrowser(source, sources)
    }
  }, [sources, files, companionOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  rescanSourceRef.current = rescanSource

  // ── Manual re-ping (called after user changes companion host in Settings) ─
  async function recheckCompanion() {
    const online = await pingCompanion()
    setCompanionOnline(online)
    return online
  }

  // ── Re-grant access (browser only) ────────────────────────────────────
  const reGrantAll = useCallback(async () => {
    if (IS_ELECTRON) {
      // In Electron, companion handles access — just rescan all sources
      for (const source of sources) await rescanSource(source.id)
      return
    }
    for (const source of sources) {
      if (dirHandles.current[source.id]) continue
      try {
        const dh = await window.showDirectoryPicker({ mode: 'read' })
        dirHandles.current[source.id] = dh
        const found = await scanDirectory(dh)
        found.forEach(f => { fileHandles.current[f.name] = f.handle })
      } catch { break }
    }
  }, [sources])

  // ── Get playable URL ───────────────────────────────────────────────────
  async function getFileUrl(filename) {
    const record = filesRef.current.find(f => f.filename === filename)
    if (record?.companionPath) return streamUrl(record.companionPath)

    // Fallback: File System Access API blob URL (browser only)
    const handle = fileHandles.current[filename]
    if (!handle) {
      throw new Error(
        IS_ELECTRON
          ? 'Cannot play file — companion server is offline. It should start automatically; check the system tray.'
          : 'Cannot play file — companion is offline or not scanned while it was running. Start companion/start.bat then rescan.'
      )
    }
    const file = await handle.getFile()
    return URL.createObjectURL(file)
  }

  function getLocalVersions(tmdbId, mediaType, season = null, episode = null) {
    let matches = files.filter(f => f.tmdbId === Number(tmdbId) && f.media_type === mediaType)
    if (season  !== null) matches = matches.filter(f => f.parsedSeason  === season)
    if (episode !== null) matches = matches.filter(f => f.parsedEpisode === episode)
    return matches.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
  }

  function getLocalFile(tmdbId, mediaType, season = null, episode = null) {
    return getLocalVersions(tmdbId, mediaType, season, episode)[0] || null
  }

  function hasLocal(tmdbId, mediaType) {
    return files.some(f => f.tmdbId === tmdbId && f.media_type === mediaType)
  }

  function getLocalEpisodeCount(tmdbId) {
    return files.filter(f => f.tmdbId === tmdbId && f.media_type === 'tv').length
  }

  function clearAll() {
    dirHandles.current  = {}
    fileHandles.current = {}
    saveSources([])
    saveFiles([])
  }

  const hasHandles = !IS_ELECTRON && Object.keys(dirHandles.current).length > 0

  return (
    <LocalLibraryContext.Provider value={{
      sources, files, scanning, progress, error, hasHandles, companionOnline,
      addSource, removeSource, rescanSource, reGrantAll, recheckCompanion,
      getFileUrl, getLocalFile, getLocalVersions, hasLocal, getLocalEpisodeCount, clearAll,
    }}>
      {children}
    </LocalLibraryContext.Provider>
  )
}

export function useLocalLibrary() {
  return useContext(LocalLibraryContext) ?? {}
}
