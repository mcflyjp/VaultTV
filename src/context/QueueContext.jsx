import { createContext, useContext, useState } from 'react'

const QueueContext = createContext(null)

const load = () => { try { return JSON.parse(localStorage.getItem('vt-queue') || '[]') } catch { return [] } }

export function QueueProvider({ children }) {
  const [queue, setQueue] = useState(load)

  function save(next) { setQueue(next); localStorage.setItem('vt-queue', JSON.stringify(next)) }

  function addToQueue(item) {
    if (queue.find(q => q.id === item.id && q.type === item.type)) return
    save([...queue, item])
  }
  function removeFromQueue(id, type) { save(queue.filter(q => !(q.id === id && q.type === type))) }
  function moveUp(idx) {
    if (idx === 0) return
    const n = [...queue]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; save(n)
  }
  function clearQueue() { save([]) }
  function isQueued(id, type) { return queue.some(q => q.id === id && q.type === type) }

  return (
    <QueueContext.Provider value={{ queue, addToQueue, removeFromQueue, moveUp, clearQueue, isQueued }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useQueue() { return useContext(QueueContext) }
