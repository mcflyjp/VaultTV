import { createContext, useContext, useState } from 'react'

const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const [session, setSession] = useState(null)
  // session = { url, title, year, type, poster, startTime, fileHandle, onProgress }

  function play(opts) {
    setSession(opts)
  }

  function closePlayer() {
    setSession(null)
  }

  return (
    <PlayerContext.Provider value={{ session, play, closePlayer }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  return useContext(PlayerContext)
}
