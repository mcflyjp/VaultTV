import { useEffect, useState, useCallback } from 'react'
import {
  listRomFolders, addRomFolder, removeRomFolder, scanRomFolder,
  getRetroarchPath, setRetroarchPath, detectRetroarch, launchGame,
} from '../lib/companion'

// window.vaulttvBridge only exists inside our own native Android WebView (it's a
// JS interface injected by MainActivity.java) — a reliable way to feature-detect
// "is this the native app" without UA sniffing.
export const HAS_ANDROID_BRIDGE = !!window.vaulttvBridge?.pickRomFolder

/**
 * Shared data/actions for the RetroArch ROM library — used by both
 * GamesLibraryCard (folder/RetroArch config, inside LibraryPanel) and
 * GamesLibrary (the browsable page at /library/games), so both stay in sync
 * without duplicating the fetch logic.
 */
export function useGamesLibrary() {
  const [folders, setFolders]       = useState([])
  const [games, setGames]           = useState([]) // Media Server games
  const [retroarchPath, setRAPath]  = useState('')
  const [raExists, setRaExists]     = useState(false)
  const [scanningId, setScanningId] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [detecting, setDetecting]   = useState(false)

  // Android on-device state
  const [androidFolderUri, setAndroidFolderUri] = useState('')
  const [androidGames, setAndroidGames]         = useState([])
  const [androidScanning, setAndroidScanning]   = useState(false)

  const refresh = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [f, ra] = await Promise.all([listRomFolders(), getRetroarchPath()])
      setFolders(f)
      setRAPath(ra.path || '')
      setRaExists(ra.exists)
      const all = await Promise.all(f.map(folder => scanRomFolder(folder.id).catch(() => ({ games: [] }))))
      setGames(all.flatMap(r => r.games || []))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshAndroid = useCallback(() => {
    if (!HAS_ANDROID_BRIDGE) return
    const savedUri = window.vaulttvBridge.getSavedRomFolderUri()
    if (!savedUri) return
    setAndroidFolderUri(savedUri)
    setAndroidScanning(true)
    window.__vaultTvRomFilesListed = jsonStr => {
      setAndroidScanning(false)
      try { setAndroidGames(JSON.parse(jsonStr)) } catch { setAndroidGames([]) }
    }
    window.vaulttvBridge.listRomFiles(savedUri)
  }, [])

  useEffect(() => {
    refresh()
    refreshAndroid()
  }, [refresh, refreshAndroid])

  function pickAndroidFolder() {
    window.__vaultTvRomFolderPicked = uriStr => {
      if (uriStr) { setAndroidFolderUri(uriStr); refreshAndroid() }
    }
    window.vaulttvBridge.pickRomFolder()
  }

  async function saveRetroarch(path) {
    await setRetroarchPath(path)
    await refresh()
  }

  async function detect() {
    setDetecting(true)
    try {
      const { found } = await detectRetroarch()
      if (found) { await setRetroarchPath(found); await refresh() }
      return found
    } finally { setDetecting(false) }
  }

  async function addFolder(folderPath) {
    await addRomFolder({ id: `rom_${Date.now()}`, folderPath })
    await refresh()
  }

  async function removeFolder(id) {
    await removeRomFolder(id)
    await refresh()
  }

  async function rescanFolder(id) {
    setScanningId(id)
    try { await refresh() } finally { setScanningId(null) }
  }

  async function play(game) {
    if (game._source === 'android') {
      window.vaulttvBridge.launchRom(game.uri)
      return
    }
    await launchGame({ romPath: game.path, ext: game.ext })
  }

  const allGames = [
    ...games.map(g => ({ ...g, _source: 'server' })),
    ...androidGames.map(g => ({ ...g, _source: 'android' })),
  ]
  const gamesByPlatform = allGames.reduce((acc, g) => {
    (acc[g.platform] ||= []).push(g)
    return acc
  }, {})
  const platformCount = Object.keys(gamesByPlatform).length

  return {
    folders, games, allGames, gamesByPlatform, platformCount,
    retroarchPath, raExists, scanningId, loading, error, detecting,
    androidFolderUri, androidGames, androidScanning,
    refresh, saveRetroarch, detect, addFolder, removeFolder, rescanFolder, play,
    pickAndroidFolder, refreshAndroid,
  }
}
