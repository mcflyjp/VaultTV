import { useEffect, useState, useCallback } from 'react'
import {
  listRomFolders, addRomFolder, removeRomFolder, scanRomFolder,
  getRetroarchPath, setRetroarchPath, detectRetroarch, launchGame,
  getIgdbKeyStatus, setIgdbKeys, setGameArtwork, rescanGameArtwork,
  scrapeAllArtwork,
} from '../lib/companion'

// window.vaulttvBridge only exists inside our own native Android WebView (it's a
// JS interface injected by MainActivity.java) — a reliable way to feature-detect
// "is this the native app" without UA sniffing.
export const HAS_ANDROID_BRIDGE = !!window.vaulttvBridge?.pickRomFolder

// window.electronAPI.getLocalRetroarch only exists in the desktop Electron app
// (exposed via preload.cjs) — used to feature-detect per-device local launch
// support the same way HAS_ANDROID_BRIDGE does for the native Android app.
export const HAS_ELECTRON_LOCAL_RETROARCH = !!window.electronAPI?.getLocalRetroarch

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
  const [hasIgdbKeys, setHasIgdbKeys] = useState(false)
  const [igdbQuotaExceededAt, setIgdbQuotaExceededAt] = useState(null)
  const [scrapingAll, setScrapingAll] = useState(false)

  // Android on-device state
  const [androidFolderUri, setAndroidFolderUri] = useState('')
  const [androidGames, setAndroidGames]         = useState([])
  const [androidScanning, setAndroidScanning]   = useState(false)

  // Electron desktop on-device state — this machine's own RetroArch,
  // independent of whatever the Media Server has configured for itself.
  const [localRetroarchPath, setLocalRAPath] = useState('')
  const [localRaExists, setLocalRaExists]     = useState(false)
  const [localDetecting, setLocalDetecting]   = useState(false)

  const refresh = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      // Each section is fetched independently so one failing call (e.g. Media
      // Server unreachable, or a stale build missing a route) doesn't wipe
      // out the whole card's state — folders/RetroArch/key each show
      // whatever they individually managed to load.
      const [f, ra, igdb] = await Promise.all([
        listRomFolders().catch(() => []),
        getRetroarchPath().catch(() => ({ path: '', exists: false })),
        getIgdbKeyStatus().catch(() => ({ hasKey: false })),
      ])
      setFolders(f)
      setRAPath(ra.path || '')
      setRaExists(ra.exists)
      setHasIgdbKeys(igdb.hasKey)
      setIgdbQuotaExceededAt(igdb.quotaExceededAt || null)
      const all = await Promise.all(f.map(folder => scanRomFolder(folder.id).catch(() => ({ games: [] }))))
      setGames(all.flatMap(r => r.games || []))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Box art is scraped server-side in the background after a scan (fire-and-
  // forget, doesn't block the scan response) — re-fetch once, a bit later, so
  // freshly-scraped art actually shows up without the user needing to manually
  // rescan. Only worth doing when there's actually a key configured to scrape with.
  useEffect(() => {
    if (!hasIgdbKeys || games.length === 0) return
    const t = setTimeout(() => { refresh() }, 8000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIgdbKeys, folders.length])

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

  const refreshLocalRetroarch = useCallback(async () => {
    if (!HAS_ELECTRON_LOCAL_RETROARCH) return
    const ra = await window.electronAPI.getLocalRetroarch()
    setLocalRAPath(ra.path || '')
    setLocalRaExists(ra.exists)
  }, [])

  useEffect(() => {
    refresh()
    refreshAndroid()
    refreshLocalRetroarch()
  }, [refresh, refreshAndroid, refreshLocalRetroarch])

  function pickAndroidFolder() {
    window.__vaultTvRomFolderPicked = uriStr => {
      if (uriStr) { setAndroidFolderUri(uriStr); refreshAndroid() }
    }
    window.vaulttvBridge.pickRomFolder()
  }

  async function saveLocalRetroarch(path) {
    setError('')
    try {
      await window.electronAPI.setLocalRetroarch(path)
      await refreshLocalRetroarch()
    } catch (e) { setError(`Couldn't save local RetroArch path: ${e.message}`) }
  }

  async function detectLocal() {
    setLocalDetecting(true)
    setError('')
    try {
      const { found } = await window.electronAPI.detectLocalRetroarch()
      if (found) { await window.electronAPI.setLocalRetroarch(found); await refreshLocalRetroarch() }
      return found
    } catch (e) {
      setError(`Local auto-detect failed: ${e.message}`)
      return null
    } finally { setLocalDetecting(false) }
  }

  // Every action below used to be fire-and-forget with no error handling —
  // a failed request (wrong companion host, unreachable Media Server, bad
  // path) just silently did nothing. Now failures land in `error` so the
  // existing error banner actually shows something.

  async function saveRetroarch(path) {
    setError('')
    try {
      await setRetroarchPath(path)
      await refresh()
    } catch (e) { setError(`Couldn't save RetroArch path: ${e.message}`) }
  }

  async function saveIgdbKeys(clientId, clientSecret) {
    setError('')
    try {
      await setIgdbKeys(clientId, clientSecret)
      setHasIgdbKeys(true)
    } catch (e) { setError(`Couldn't save IGDB credentials: ${e.message}`) }
  }

  async function detect() {
    setDetecting(true)
    setError('')
    try {
      const { found } = await detectRetroarch()
      if (found) { await setRetroarchPath(found); await refresh() }
      return found
    } catch (e) {
      setError(`Auto-detect failed: ${e.message}`)
      return null
    } finally { setDetecting(false) }
  }

  async function addFolder(folderPath) {
    setError('')
    try {
      await addRomFolder({ id: `rom_${Date.now()}`, folderPath })
      await refresh()
    } catch (e) { setError(`Couldn't add folder: ${e.message}`) }
  }

  async function removeFolder(id) {
    setError('')
    try {
      await removeRomFolder(id)
      await refresh()
    } catch (e) { setError(`Couldn't remove folder: ${e.message}`) }
  }

  async function rescanFolder(id) {
    setScanningId(id)
    setError('')
    try { await refresh() }
    catch (e) { setError(`Rescan failed: ${e.message}`) }
    finally { setScanningId(null) }
  }

  async function saveArtwork(game, url) {
    setError('')
    try {
      await setGameArtwork({ platform: game.platform, name: game.name, url })
      await refresh()
    } catch (e) { setError(`Couldn't save box art: ${e.message}`) }
  }

  async function rescanArtwork(game, query) {
    setError('')
    try {
      const { boxArt } = await rescanGameArtwork({ platform: game.platform, name: game.name, query })
      await refresh()
      return boxArt
    } catch (e) {
      setError(`Box art search failed: ${e.message}`)
      throw e // BoxArtModal shows its own inline error too, so let it catch this
    }
  }

  // "Scrape All" runs on the Media Server in the background with a per-lookup
  // delay (see IGDB_SCRAPE_DELAY_MS server-side) so a big library can take
  // a while — we just poll refresh() a few times after kicking it off rather
  // than blocking the button on the whole scrape finishing.
  async function scrapeAll() {
    setScrapingAll(true)
    try {
      const { count } = await scrapeAllArtwork()
      const delays = [4000, 10000, 20000, 35000]
      for (const ms of delays) {
        await new Promise(r => setTimeout(r, ms))
        await refresh()
      }
      return count
    } finally {
      setScrapingAll(false)
    }
  }

  async function play(game) {
    setError('')
    try {
      if (game._source === 'android') {
        window.vaulttvBridge.launchRom(game.uri)
        return
      }
      // Prefer this machine's own local RetroArch when the desktop app has
      // one configured — the Media Server otherwise always launches on
      // WHICHEVER PC RUNS IT, which is wrong the moment you're on a second
      // computer on the network with its own RetroArch install.
      if (HAS_ELECTRON_LOCAL_RETROARCH && localRaExists) {
        const result = await window.electronAPI.launchLocalRom(game.path, game.ext)
        if (result?.error) throw new Error(result.error)
        return
      }
      await launchGame({ romPath: game.path, ext: game.ext })
    } catch (e) {
      // Previously this failed silently — clicking a game "did nothing"
      // with zero feedback whether RetroArch actually launched, the request
      // never reached the server, or the core/path was misconfigured.
      setError(`Couldn't launch "${game.name}": ${e.message}`)
    }
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
    hasIgdbKeys, saveIgdbKeys, scrapingAll, scrapeAll, igdbQuotaExceededAt,
    androidFolderUri, androidGames, androidScanning,
    localRetroarchPath, localRaExists, localDetecting,
    refresh, saveRetroarch, detect, addFolder, removeFolder, rescanFolder, play,
    saveArtwork, rescanArtwork,
    pickAndroidFolder, refreshAndroid,
    saveLocalRetroarch, detectLocal,
  }
}
