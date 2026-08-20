import { createContext, useContext, useState, useRef, useEffect } from 'react'

const PlayerContext = createContext(null)

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

// FireTV only — which native player playVideo() routes through by default.
// 'exoplayer' still auto-falls-back to VLC per-title on a codec failure (see
// MainActivity's RESULT_RETRY_VLC handling); this is just which one gets
// tried first. Some users prefer starting on VLC directly for titles ExoPlayer
// struggles with generally (audio delay control, certain HEVC/Atmos sources).
const DEFAULT_PLAYER_KEY = 'vt-default-player'

export function PlayerProvider({ children }) {
  const [session, setSession] = useState(null)
  // session = { url, title, year, type, poster, startTime, fileHandle, onProgress }
  const [defaultPlayer, setDefaultPlayerState] = useState(
    () => localStorage.getItem(DEFAULT_PLAYER_KEY) || 'exoplayer'
  )
  function setDefaultPlayer(player) {
    localStorage.setItem(DEFAULT_PLAYER_KEY, player)
    setDefaultPlayerState(player)
  }

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
    // On FireTV: route through whichever native player is set as default.
    // ExoPlayer uses hardware MediaCodec — supports HEVC, AC3, DTS, HLS
    // natively — and is still tried first unless the user has explicitly
    // chosen VLC as their default in Settings; a codec failure on ExoPlayer
    // still silently retries with VLC regardless (see MainActivity's
    // RESULT_RETRY_VLC handling) — this only changes which one goes first.
    if (IS_FIRETV) {
      const url = opts.url || ''
      if (url && typeof window.vaulttvBridge !== 'undefined') {
        try {
          lastOptsRef.current = opts
          if (defaultPlayer === 'vlc') {
            window.vaulttvBridge.playVideoVlc(url, opts.title || '', opts.startTime || 0)
            return
          }
          if (defaultPlayer === 'mxplayer' && typeof window.vaulttvBridge.playVideoMx === 'function') {
            // MX Player supports multiple subtitle tracks (its own array-based
            // API), unlike ExoPlayer's single subtitleUrl param below.
            const tracks = (opts.subtitleTracks || []).filter(t => t.url && !t.url.startsWith('blob:'))
            const subUrls  = JSON.stringify(tracks.map(t => t.url))
            const subNames = JSON.stringify(tracks.map(t => t.label || t.lang || 'Subtitle'))
            window.vaulttvBridge.playVideoMx(url, opts.title || '', opts.startTime || 0, subUrls, subNames)
            return
          }
          // Pick the best subtitle URL to pass to native ExoPlayer (first English, direct HTTP only)
          // Blob URLs (from companion/createObjectURL) are browser-local and crash ExoPlayer
          const tracks = (opts.subtitleTracks || []).filter(t => t.url && !t.url.startsWith('blob:'))
          const subTrack = tracks.find(t => /^en/i.test(t.lang || '') || /english/i.test(t.label || '')) || tracks[0] || null
          const subUrl = subTrack?.url || ''
          window.vaulttvBridge.playVideo(url, opts.title || '', opts.startTime || 0, subUrl)
          return
        } catch (e) {
          console.warn('[player] native player bridge failed, falling back to web player:', e)
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
    <PlayerContext.Provider value={{ session, play, playVlc, closePlayer, defaultPlayer, setDefaultPlayer }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  return useContext(PlayerContext)
}

export { IS_FIRETV }
