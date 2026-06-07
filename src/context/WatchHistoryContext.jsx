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
    const next = history.map(h =>
      h.id === id && h.type === type
        ? { ...h, progressSec, durationSec, progress, timestamp: Date.now() }
        : h
    )
    // If not found in the current snapshot, add a full entry
    if (!next.find(h => h.id === id && h.type === type)) {
      next.unshift({ id, type, title: title || '', poster: poster || null, progressSec, durationSec, progress, timestamp: Date.now() })
    }
    // Keep max 30 items, sorted by recency
    save(next.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30))
  }

  /** Remove a single item from history */
  function removeFromHistory(id, type) {
    save(history.filter(h => !(h.id === id && h.type === type)))
  }

  /** Items with < 95% progress (still "in progress") */
  const inProgress = history.filter(h => h.progress < 0.95)

  return (
    <WatchHistoryContext.Provider value={{ history, inProgress, startWatching, updateProgress, removeFromHistory }}>
      {children}
    </WatchHistoryContext.Provider>
  )
}

export function useWatchHistory() {
  return useContext(WatchHistoryContext)
}
