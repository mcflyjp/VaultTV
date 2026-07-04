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
    window.__nativePlayerDone = (posMs, durMs, autoAdvance) => {
      const opts = lastOptsRef.current
      if (opts?.onProgress) {
        opts.onProgress(posMs / 1000, durMs / 1000)
      }
      // Only auto-advance when episode ended naturally (STATE_ENDED).
      // Manual Back press passes autoAdvance=false — just save progress and stop.
      if (autoAdvance && opts?.onEpisodeEnded) {
        opts.onEpisodeEnded()
      } else if (opts?.onPlaybackEnded) {
        opts.onPlaybackEnded()
      }
      lastOptsRef.current = null
    }
    return () => { window.__nativePlayerDone = null }
  }, [])

  function play(opts) {
    // On FireTV: route through native ExoPlayer bridge.
    // ExoPlayer uses hardware MediaCodec — supports HEVC, AC3, DTS, HLS natively.
    if (IS_FIRETV) {
      const url = opts.url || ''
      if (url && typeof window.vaulttvBridge !== 'undefined') {
        try {
          lastOptsRef.current = opts
          // Pick the best subtitle URL to pass to native ExoPlayer (first English, direct HTTP only)
          // Blob URLs (from companion/createObjectURL) are browser-local and crash ExoPlayer
          const tracks = (opts.subtitleTracks || []).filter(t => t.url && !t.url.startsWith('blob:'))
          const subTrack = tracks.find(t => /^en/i.test(t.lang || '') || /english/i.test(t.label || '')) || tracks[0] || null
          const subUrl = subTrack?.url || ''
          window.vaulttvBridge.playVideo(url, opts.title || '', opts.startTime || 0, subUrl)
          return
        } catch (e) {
          console.warn('[player] ExoPlayer bridge failed, falling back to web player:', e)
        }
      }
    }
    // Web / Electron: use the JS player
    setSession(opts)
  }

  function playVlc(opts) {
    if (IS_FIRETV && typeof window.vaulttvBridge !== 'undefined') {
      try {
        lastOptsRef.current = opts
        window.vaulttvBridge.playVideoVlc(opts.url || '', opts.title || '', opts.startTime || 0)
        return
      } catch (e) {
        console.warn('[player] VLC bridge failed, falling back to web player:', e)
      }
    }
    // Non-FireTV: fall through to JS player as normal
    setSession(opts)
  }

  function closePlayer() {
    setSession(null)
  }

  return (
    <PlayerContext.Provider value={{ session, play, playVlc, closePlayer }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  return useContext(PlayerContext)
}

export { IS_FIRETV }
