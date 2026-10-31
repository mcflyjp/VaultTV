/**
 * PlayerContext
 *
 * Decides which player opens a title and holds the current playback session.
 * On FireTV it hands off to a native activity through the bridge, meaning
 * ExoPlayer by default or VLC when chosen or when ExoPlayer fails. Everywhere
 * else, including the Android phone app, it sets a session that the in page
 * VideoPlayer component renders. window.__nativePlayerDone is the return path
 * from a native player, carrying position back for progress and auto advance.
 */

import { createContext, useContext, useState, useRef, useEffect } from 'react'
import { remuxAudioUrl } from '../lib/companion'
import { useLanguage } from './LanguageContext'

const PlayerContext = createContext(null)

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

// FireTV only — which native player playVideo() routes through by default.
// 'exoplayer' still auto-falls-back to VLC per-title on a codec failure (see
// MainActivity's RESULT_RETRY_VLC handling); this is just which one gets
// tried first. Some users prefer starting on VLC directly for titles ExoPlayer
// struggles with generally (audio delay control, certain HEVC/Atmos sources).
const DEFAULT_PLAYER_KEY = 'vt-default-player'

// Audio MX Player cannot decode.
//
// MX Player dropped its built-in AC3, E-AC3 and DTS decoders over patent
// licensing, so those tracks play silent unless the user installs a separate
// codec pack. Nothing on screen says so: the video plays perfectly and the
// sound is simply absent, which reads as a broken stream rather than a missing
// decoder. Releases carrying these formats are extremely common.
//
// The companion already transcodes audio for the web player, and doing it for
// MX costs little: the video is copied through untouched and only the audio is
// re-encoded to stereo AAC.
const MX_UNSUPPORTED_AUDIO = new Set(['ac3', 'eac3', 'dts', 'truehd', 'mlp'])

// Audio MX decodes natively, and so the only case worth sending it untouched.
// Everything else, including a stream that says nothing about its audio, goes
// through the remux.
const MX_SAFE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm'])

/**
 * Swap a stream for its transcoded form when the chosen player cannot decode
 * its audio. Returns the original URL whenever there is nothing to fix, no
 * companion to do it, or the codec is unknown, so a wrong guess costs nothing.
 */
function audioSafeUrl(url, opts, player) {
  if (player !== 'mxplayer') return url
  if (!window.__companionBase) return url

  // Assume MX cannot decode the audio unless the name says otherwise.
  //
  // This used to work the other way round, routing only when the release name
  // advertised AC3, E-AC-3, DTS or TrueHD. Plenty of streams say nothing about
  // their audio at all, and those went straight to MX and played silent, with
  // no track even listed, since MX hides formats it has no decoder for. A name
  // is a guess either way; this is the guess that fails safely.
  //
  // Remuxing is cheap enough to be the default: the video is copied through
  // untouched and only the audio is converted, which runs about ten times
  // faster than playback needs.
  const codec = (opts.audioCodec || '').toLowerCase()
  if (MX_SAFE_AUDIO.has(codec)) return url
  // Convert the audio and leave the video alone.
  //
  // An earlier version re-encoded the video too, because HEVC inside a
  // fragmented MP4 made MX Player fall back to software decoding. The
  // container was the problem, not the codec: MX hardware decodes HEVC
  // perfectly well from Matroska. Re-encoding it instead was ruinous at 4K,
  // where a 2160p 10-bit source cannot be converted in real time, so playback
  // starved and the player gave up after a few seconds.
  return remuxAudioUrl(opts.rawStreamUrl || url, 0)
}

export function PlayerProvider({ children }) {
  const { subsOffByDefault } = useLanguage()
  const [session, setSession] = useState(null)
  // session = { url, title, year, type, poster, startTime, fileHandle, onProgress }
  const [defaultPlayer, setDefaultPlayerState] = useState(
    () => localStorage.getItem(DEFAULT_PLAYER_KEY) || 'exoplayer'
  )
  function setDefaultPlayer(player) {
    localStorage.setItem(DEFAULT_PLAYER_KEY, player)
    setDefaultPlayerState(player)
  }

  /**
   * The subtitle tracks a player should be handed.
   *
   * Native players load whatever they are given, so the only way to have
   * subtitles off by default is not to give them any. VaultTV fetches
   * subtitles on its own and add-ons supply their own, which is why they
   * appeared uninvited even when nobody asked: three separate sources each
   * decided independently.
   *
   * Only affects what is passed at launch. Subtitles embedded in the file are
   * the player's business, and can still be turned on from its own menu.
   */
  function tracksFor(opts) {
    if (subsOffByDefault) return []
    return (opts.subtitleTracks || []).filter(t => t.url && !t.url.startsWith('blob:'))
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
          // Vimu is built for televisions rather than adapted to them, and
          // handles container and codec combinations the bundled players
          // refuse. Offered only when installed, since launching a missing app
          // looks identical to a broken stream from here.
          if (defaultPlayer === 'vimu' && typeof window.vaulttvBridge.playVideoVimu === 'function') {
            const tracks = tracksFor(opts)
            const sub    = tracks.find(t => /^en/i.test(t.lang || '') || /english/i.test(t.label || '')) || tracks[0] || null
            window.vaulttvBridge.playVideoVimu(url, opts.title || '', opts.startTime || 0, sub?.url || '')
            return
          }
          if (defaultPlayer === 'mxplayer' && typeof window.vaulttvBridge.playVideoMx === 'function') {
            // MX Player supports multiple subtitle tracks (its own array-based
            // API), unlike ExoPlayer's single subtitleUrl param below.
            const tracks = tracksFor(opts)
            const subUrls  = JSON.stringify(tracks.map(t => t.url))
            const subNames = JSON.stringify(tracks.map(t => t.label || t.lang || 'Subtitle'))
            window.vaulttvBridge.playVideoMx(audioSafeUrl(url, opts, 'mxplayer'), opts.title || '', opts.startTime || 0, subUrls, subNames)
            return
          }
          // Pick the best subtitle URL to pass to native ExoPlayer (first English, direct HTTP only)
          // Blob URLs (from companion/createObjectURL) are browser-local and crash ExoPlayer
          const tracks = tracksFor(opts)
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
