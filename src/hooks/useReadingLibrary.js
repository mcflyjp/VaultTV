import { useEffect, useState, useCallback } from 'react'
import {
  listReadingFolders, addReadingFolder, removeReadingFolder, scanReadingFolder,
  setReadingArtwork, rescanReadingArtwork, scrapeAllReadingArtwork,
  getComicVineKeyStatus, setComicVineKey,
} from '../lib/companion'

/**
 * Shared data/actions for the comics/ebooks library — used by both
 * ReadingLibraryCard (folder config, inside LibraryPanel) and ReadingLibrary
 * (the browsable page at /library/reading), mirroring useGamesLibrary's shape.
 */
export function useReadingLibrary() {
  const [folders, setFolders]       = useState([])
  const [items, setItems]           = useState([])
  const [scanningId, setScanningId] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [hasComicVineKey, setHasComicVineKey] = useState(false)
  const [comicVineQuotaExceededAt, setComicVineQuotaExceededAt] = useState(null)
  const [scrapingAll, setScrapingAll] = useState(false)

  const refresh = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [f, cv] = await Promise.all([
        listReadingFolders().catch(() => []),
        getComicVineKeyStatus().catch(() => ({ hasKey: false })),
      ])
      setFolders(f)
      setHasComicVineKey(cv.hasKey)
      setComicVineQuotaExceededAt(cv.quotaExceededAt || null)
      const all = await Promise.all(f.map(folder => scanReadingFolder(folder.id).catch(() => ({ items: [] }))))
      setItems(all.flatMap(r => r.items || []))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Covers scrape server-side in the background after a scan — re-fetch once,
  // a bit later, so freshly-scraped art shows up without a manual rescan.
  useEffect(() => {
    if (items.length === 0) return
    const t = setTimeout(() => { refresh() }, 8000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders.length])

  useEffect(() => { refresh() }, [refresh])

  async function addFolder(folderPath, category) {
    setError('')
    try {
      await addReadingFolder({ id: `read_${Date.now()}`, folderPath, category })
      await refresh()
    } catch (e) { setError(`Couldn't add folder: ${e.message}`) }
  }

  async function removeFolder(id) {
    setError('')
    try {
      await removeReadingFolder(id)
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

  async function saveComicVineKey(key) {
    setError('')
    try {
      await setComicVineKey(key)
      setHasComicVineKey(!!key)
    } catch (e) { setError(`Couldn't save ComicVine key: ${e.message}`) }
  }

  async function saveArtwork(item, url) {
    setError('')
    try {
      await setReadingArtwork({ kind: item.kind, name: item.name, url })
      await refresh()
    } catch (e) { setError(`Couldn't save cover art: ${e.message}`) }
  }

  async function rescanArtwork(item, query, year, issueNumber) {
    setError('')
    try {
      const { cover } = await rescanReadingArtwork({ kind: item.kind, name: item.name, query, year, issueNumber })
      await refresh()
      return cover
    } catch (e) {
      setError(`Cover art search failed: ${e.message}`)
      throw e
    }
  }

  async function scrapeAll() {
    setScrapingAll(true)
    try {
      const { count } = await scrapeAllReadingArtwork()
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

  // `category` comes from the server (folder-level: comics files are always
  // 'comics'; EPUB/PDF files inherit whatever category their folder was
  // tagged with when added, defaulting to 'novels').
  const comics        = items.filter(i => i.category === 'comics')
  const graphicNovels  = items.filter(i => i.category === 'graphic-novels')
  const novels         = items.filter(i => i.category === 'novels')
  const books          = items.filter(i => i.kind === 'book') // legacy alias, kept for anything still reading it

  // Comics further grouped by publisher (DC/Marvel/Dark Horse/etc, from
  // ComicVine when configured) — items with no known publisher land in
  // "Other", sorted last rather than alphabetically mixed in.
  const comicsByPublisher = comics.reduce((acc, c) => {
    const key = c.publisher || 'Other'
    ;(acc[key] ||= []).push(c)
    return acc
  }, {})

  return {
    folders, items, comics, graphicNovels, novels, books, comicsByPublisher,
    scanningId, loading, error,
    hasComicVineKey, saveComicVineKey, comicVineQuotaExceededAt, scrapingAll, scrapeAll,
    refresh, addFolder, removeFolder, rescanFolder,
    saveArtwork, rescanArtwork,
  }
}
