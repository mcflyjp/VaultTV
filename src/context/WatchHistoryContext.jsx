import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { fetchProgress, pushProgress, deleteProgress } from '../lib/companion'

const WatchHistoryContext = createContext(null)

function load() {
  try { return JSON.parse(localStorage.getItem('vt-history') || '[]') }
  catch { return [] }
}

function loadWatchedEps() {
  try { return JSON.parse(localStorage.getItem('vt-watched-eps') || '{}') }
  catch { return {} }
}

/** Merge two history arrays — most-recent timestamp wins per (id, type) pair */
function merge(local, remote) {
  const map = new Map()
  for (const item of local)  map.set(`${item.type}:${item.id}`, item)
  for (const item of remote) {
    const key = `${item.type}:${item.id}`
    const existing = map.get(key)
    if (!existing || (item.timestamp || 0) > (existing.timestamp || 0)) map.set(key, item)
  }
  return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 30)
}

export function WatchHistoryProvider({ children }) {
  const [history, setHistory] = useState(load)
  const [watchedEps, setWatchedEps] = useState(loadWatchedEps)
  const pushTimerRef = useRef(null)

  // On mount: pull server progress and merge with localStorage
  useEffect(() => {
    fetchProgress().then(remote => {
      if (!remote?.length) return
      setHistory(current => {
        const merged = merge(current, remote)
        localStorage.setItem('vt-history', JSON.stringify(merged))
        return merged
      })
    })
  }, [])

  function save(next) {
    setHistory(next)
    localStorage.setItem('vt-history', JSON.stringify(next))
    // Debounce server push — at most once every 10 seconds
    clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(() => pushProgress(next), 10_000)
  }

  /** Call when user starts playing something */
  function startWatching({ id, type, title, poster, durationSec = 0 }) {
    const existing = history.find(h => h.id === id && h.type === type)
    if (existing) return // already tracked, don't reset progress
    save([
      { id, type, title, poster, progressSec: 0, durationSec, progress: 0, timestamp: Date.now() },
      ...history,
    ])
  }

  /** Update playback progress (call on video timeupdate)
   *  title + poster are optional — used only when creating a new entry
   *  (React batches state so startWatching's update may not be visible yet) */
  function updateProgress(id, type, progressSec, durationSec, title, poster) {
    const progress = durationSec > 0 ? progressSec / durationSec : 0
    // Read from localStorage directly — avoids stale React closure overwriting
    // lastStream that saveLastStream already persisted correctly
    const current = JSON.parse(localStorage.getItem('vt-history') || '[]')
    const next = current.map(h =>
      h.id === id && h.type === type
        ? { ...h, progressSec, durationSec, progress, timestamp: Date.now() }
        : h
    )
    if (!next.find(h => h.id === id && h.type === type)) {
      next.unshift({ id, type, title: title || '', poster: poster || null, progressSec, durationSec, progress, timestamp: Date.now() })
    }
    save(next.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30))
  }

  /** Save the stream URL used so resume can replay it directly.
   *  Reads from localStorage directly to avoid stale-state race with startWatching. */
  function saveLastStream(id, type, streamData) {
    try {
      const current = JSON.parse(localStorage.getItem('vt-history') || '[]')
      const idx = current.findIndex(h => h.id === id && h.type === type)
      if (idx >= 0) {
        current[idx] = { ...current[idx], lastStream: streamData }
      } else {
        current.unshift({ id, type, lastStream: streamData, progress: 0, progressSec: 0, durationSec: 0, timestamp: Date.now() })
      }
      localStorage.setItem('vt-history', JSON.stringify(current))
      setHistory(current)
    } catch {}
  }

  /** Remove a single item from history */
  function removeFromHistory(id, type) {
    save(history.filter(h => !(h.id === id && h.type === type)))
    deleteProgress(id, type)
  }

  /** Mark a specific TV episode as watched (called at 90%+ progress) */
  function markEpisodeWatched(showId, season, episode) {
    const key = `${showId}`
    const epKey = `S${season}E${episode}`
    setWatchedEps(prev => {
      const next = { ...prev, [key]: { ...(prev[key] || {}), [epKey]: true } }
      localStorage.setItem('vt-watched-eps', JSON.stringify(next))
      return next
    })
  }

  /** Returns true if a specific episode has been watched */
  function isEpisodeWatched(showId, season, episode) {
    return !!watchedEps[`${showId}`]?.[`S${season}E${episode}`]
  }

  /** Items still in progress:
   *  - Must have at least 1 minute of watch time (no accidental taps)
   *  - TV shows: always shown until user removes them
   *  - Movies: shown until 95% watched */
  const inProgress = history.filter(h =>
    (h.progressSec || 0) >= 60 && (h.type === 'tv' || h.progress < 0.95)
  )

  return (
    <WatchHistoryContext.Provider value={{ history, inProgress, startWatching, updateProgress, saveLastStream, removeFromHistory, markEpisodeWatched, isEpisodeWatched }}>
      {children}
    </WatchHistoryContext.Provider>
  )
}

export function useWatchHistory() {
  return useContext(WatchHistoryContext)
}
