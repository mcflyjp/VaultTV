import { createContext, useContext, useState, useRef, useEffect } from 'react'

const PlayerContext = createContext(null)

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

export function PlayerProvider({ children }) {
  const [session, setSession] = useState(null)
  // session = { url, title, year, type, poster, startTime, fileHandle, onProgress }

  // Keep last opts so the native player done callback can report progress
  const lastOptsRef = useRef(null)

  // Wire up the native player done callback once
  useEffect(() => {
    window.__nativePlayerDone = (posMs, durMs) => {
      const opts = lastOptsRef.current
      if (opts?.onProgress) {
        opts.onProgress(posMs / 1000, durMs / 1000)
      }
      lastOptsRef.current = null
    }
    return () => { window.__nativePlayerDone = null }
  }, [])

  function play(opts) {
    // On FireTV: route through native ExoPlayer bridge.
    // ExoPlayer uses hardware MediaCodec — supports HEVC, AC3, DTS, HLS natively.
    // Check typeof to handle Java bridge proxies that may not be truthy in all WebView versions.
    if (IS_FIRETV && window.vaulttvBridge && typeof window.vaulttvBridge.playVideo !== 'undefined') {
      lastOptsRef.current = opts
      window.vaulttvBridge.playVideo(
        opts.url || '',
        opts.title || '',
        opts.startTime || 0
      )
      return
    }
    // Web / Electron: use the JS player
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
