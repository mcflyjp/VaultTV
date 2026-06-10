import { createContext, useContext, useState } from 'react'

const WatchHistoryContext = createContext(null)

function load() {
  try { return JSON.parse(localStorage.getItem('vt-history') || '[]') }
  catch { return [] }
}

export function WatchHistoryProvider({ children }) {
  const [history, setHistory] = useState(load)

  function save(next) {
    setHistory(next)
    localStorage.setItem('vt-history', JSON.stringify(next))
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
  }

  /** Items with < 95% progress (still "in progress") */
  const inProgress = history.filter(h => h.progress < 0.95)

  return (
    <WatchHistoryContext.Provider value={{ history, inProgress, startWatching, updateProgress, saveLastStream, removeFromHistory }}>
      {children}
    </WatchHistoryContext.Provider>
  )
}

export function useWatchHistory() {
  return useContext(WatchHistoryContext)
}
