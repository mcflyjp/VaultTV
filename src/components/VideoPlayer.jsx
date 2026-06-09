import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePlayer } from '../context/PlayerContext'
import { useLanguage } from '../context/LanguageContext'
import Hls from 'hls.js'
import { transcodeUrl, probeAudioCodec as probeCodecs, needsTranscode } from '../lib/companion'
import { fetchCompanionSub } from '../lib/subtitles'
import {
  FiPlay, FiPause, FiVolume2, FiVolumeX, FiVolume1,
  FiMaximize, FiMinimize, FiX, FiSettings, FiChevronLeft,
} from 'react-icons/fi'
import {
  MdSubtitles, MdAudiotrack, MdSpeed, MdSyncAlt, MdHighQuality,
} from 'react-icons/md'

const HIDE_DELAY = 3000
const SKIP_SECS  = 10
const IS_FIRETV  = /VaultTV-FireTV/i.test(navigator.userAgent)

/** Shift all VTT timestamps by `offsetSec` seconds */
function shiftVtt(vtt, offsetSec) {
  return vtt.replace(
    /(\d{2}:)?\d{2}:\d{2}\.\d{3}/g,
    ts => {
      const parts = ts.split(':')
      let h = 0, m = 0, s = 0
      if (parts.length === 3) { [h, m, s] = parts.map(Number) }
      else { [m, s] = parts.map(Number) }
      const total = Math.max(0, h * 3600 + m * 60 + s + offsetSec)
      const nh = Math.floor(total / 3600)
      const nm = Math.floor((total % 3600) / 60)
      const ns = (total % 60).toFixed(3).padStart(6, '0')
      return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}:${ns}`
    }
  )
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`
}

export default function VideoPlayer() {
  const { session, closePlayer } = usePlayer()
  const { subLang, audioLang, autoFetchSubs, savePrefs, LANGUAGES } = useLanguage()

  const videoRef     = useRef(null)
  const containerRef = useRef(null)
  const hlsRef       = useRef(null)
  const hideTimer    = useRef(null)
  const audioCtxRef  = useRef(null)
  const gainRef      = useRef(null)
  const delayRef     = useRef(null)
  const progressRef    = useRef(null)
  const fileUrlRef     = useRef(null)
  // FireTV remote nav refs
  const closeBtnRef    = useRef(null)
  const skipBackBtnRef = useRef(null)
  const skipFwdBtnRef  = useRef(null)
  const playBtnRef     = useRef(null)
  const fixItBtnRef    = useRef(null)
  const timelineActiveRef  = useRef(false)
  const settingsOpenRef    = useRef(false)
  const showNoAudioRef     = useRef(false)

  const [playing,      setPlaying]      = useState(false)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [buffered,     setBuffered]     = useState(0)
  const [volume,       setVolume]       = useState(1)
  const [muted,        setMuted]        = useState(false)
  const [fullscreen,   setFullscreen]   = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [qualities,    setQualities]    = useState([])
  const [quality,      setQuality]      = useState(-1)
  const [audioTracks,  setAudioTracks]  = useState([])
  const [audioTrack,   setAudioTrack]   = useState(0)
  const [audioDelay,    setAudioDelay]    = useState(0)    // ms
  const [subTracks,       setSubTracks]       = useState([])   // [{id,label,url,lang}]
  const [activeSub,       setActiveSub]       = useState(-1)   // index into subTracks, -1=off
  const [subOffset,       setSubOffset]       = useState(0)    // seconds
  const [manualSubUrl,    setManualSubUrl]     = useState('')
  const [autoSubFetching, setAutoSubFetching] = useState(false) // fetching from companion
  const [playbackRate,  setPlaybackRate]  = useState(1)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [audioMenuOpen, setAudioMenuOpen] = useState(false)
  const [subMenuOpen, setSubMenuOpen] = useState(false)
  const [settingsTab,  setSettingsTab]  = useState('quality')
  const [error,        setError]        = useState('')
  const [audioWarning, setAudioWarning] = useState('')   // codec/no-audio warning
  const [transcoding,  setTranscoding]  = useState(false) // currently using companion transcode
  const [buffering,    setBuffering]    = useState(true)  // true while video is loading/stalled
  const [showNoAudio,  setShowNoAudio]  = useState(false) // "No audio?" hint for first 8s
  const noAudioTimer = useRef(null)
  const rawUrlRef = useRef('')                             // original URL before transcoding
  const [hoverTime,      setHoverTime]      = useState(null)  // for progress tooltip
  const [hoverX,         setHoverX]         = useState(0)
  const [timelineActive, setTimelineActiveState] = useState(false)
  const [backToast, setBackToast] = useState(false)
  const backToastTimer  = useRef(null)
  const backPressedOnce = useRef(false)

  // Keep ref in sync so FireTV key handler (closure) always sees fresh value
  function setTimelineActive(v) { timelineActiveRef.current = v; setTimelineActiveState(v) }

  // ── Source loading ──────────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    const video = videoRef.current
    if (!video) return

    setPlaying(false); setCurrentTime(0); setDuration(0)
    setBuffered(0); setError(''); setAudioWarning(''); setQualities([]); setQuality(-1)
    setAudioTracks([]); setAudioTrack(0); setAudioDelay(0)
    setManualSubUrl(''); setSubOffset(0); setPlaybackRate(1)
    setSettingsOpen(false); setTranscoding(false); setAutoSubFetching(false)
    setBuffering(true); setShowNoAudio(false)
    clearTimeout(noAudioTimer.current)
    rawUrlRef.current = session.url || ''

    // Auto-select subtitle track by preferred language, fall back to English then first
    const tracks = session.subtitleTracks || []
    setSubTracks(tracks)
    if (tracks.length > 0) {
      const preferred = tracks.findIndex(t =>
        t.lang?.toLowerCase().startsWith(subLang) ||
        t.label?.toLowerCase().includes(subLang)
      )
      const engIdx = tracks.findIndex(t =>
        /^en/i.test(t.lang || '') || /english/i.test(t.label || '')
      )
      const autoIdx = preferred >= 0 ? preferred : engIdx >= 0 ? engIdx : 0
      setActiveSub(autoIdx)
      setManualSubUrl(tracks[autoIdx]?.url || '')
    } else {
      setActiveSub(-1)
    }

    // Destroy previous HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    // Revoke previous object URL
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null }

    async function load() {
      let src = session.url

      // Local file handle (File System Access API blob URL)
      if (session.fileHandle) {
        try {
          const file = await session.fileHandle.getFile()
          src = URL.createObjectURL(file)
          fileUrlRef.current = src
        } catch (e) {
          setError('Could not read local file — re-grant folder access in Settings.')
          return
        }
      }

      if (!src) { setError('No stream URL provided.'); return }

      const isCompanion = src.includes(':7842/')
      const isRemote    = src.startsWith('http') && !isCompanion

      // Companion URLs need crossOrigin="anonymous" for the Web Audio API.
      // External URLs must NOT have it set — CORS headers on stream servers
      // are inconsistent and setting crossOrigin causes many streams to fail.
      if (isCompanion) {
        video.crossOrigin = 'anonymous'
      } else {
        video.removeAttribute('crossOrigin')
      }

      // ── Start playback immediately — don't wait for codec probe ──────────
      // Probing via companion takes 1-6s. If we await it before calling
      // video.play(), Chromium's autoplay policy expires the user-gesture
      // context and play() silently rejects (NotAllowedError). Instead, start
      // playing the raw URL now, then swap to a transcode URL in the background
      // if the probe finds an unsupported codec.
      function startPlayback(url) {
        // Only check the URL path — not query params, which may contain an encoded
        // source URL (e.g. companion /transcode?url=...m3u8). Checking the full
        // string would misidentify a transcode URL as HLS and break playback.
        const urlPath = url.split('?')[0]
        const isHls = urlPath.includes('.m3u8') || urlPath.includes('manifest')

        // On FireTV, Android WebView supports HLS natively via MediaPlayer/ExoPlayer
        // with full hardware decode. HLS.js is pure JS demuxing and kills the CPU on
        // a FireTV Stick. Skip HLS.js on FireTV and let the native video element handle it.
        if (isHls && Hls.isSupported() && !IS_FIRETV) {
          const hls = new Hls({
            maxBufferLength: 60,
            maxMaxBufferLength: 120,
            startLevel: -1,
            abrEwmaDefaultEstimate: 5_000_000,
          })
          hlsRef.current = hls
          hls.loadSource(url)
          hls.attachMedia(video)

          hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            setQualities([{ height: 0, label: 'Auto' }, ...data.levels.map(l => ({ height: l.height, label: `${l.height}p` }))])
            video.play().catch(() => {})
          })

          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
            const tracks = data.audioTracks.map(t => ({
              id:   t.id,
              name: t.name || t.lang || `Track ${t.id + 1}`,
              lang: t.lang || '',
            }))
            setAudioTracks(tracks)
            // Auto-select preferred audio language
            if (audioLang) {
              const preferredIdx = tracks.findIndex(t =>
                t.lang?.toLowerCase().startsWith(audioLang) ||
                t.name?.toLowerCase().includes(audioLang)
              )
              if (preferredIdx >= 0) {
                hls.audioTrack = preferredIdx
                setAudioTrack(preferredIdx)
              }
            }
          })

          hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
            if (!data.subtitleTracks?.length) return
            const hlsSubs = data.subtitleTracks.map((t, i) => ({
              id: `hls_${i}`, label: t.name || t.lang || `Subtitle ${i + 1}`,
              lang: t.lang || '', hlsIdx: i,
            }))
            setSubTracks(prev => {
              const existing = prev.filter(s => !s.hlsIdx && s.url)
              return [...hlsSubs, ...existing]
            })
          })

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) setError(`Stream error: ${data.details}`)
          })
        } else {
          // Native playback: used for non-HLS, FireTV (native HLS), and fallback
          video.src = url
          video.play().catch(() => {})
        }
      }

      startPlayback(src)
      if (session.startTime) video.currentTime = session.startTime

      // ── Background codec probe — swap to transcode if needed ─────────────
      // Runs after playback has already started. If the companion is offline
      // this resolves to null quickly and we do nothing. If codecs are bad,
      // we seamlessly restart at the current timestamp via the transcode URL.
      if (isRemote) {
        probeCodecs(src).then(codecs => {
          if (!codecs) return  // companion offline — native playback continues
          const { needed, transcodeVideo } = needsTranscode(codecs)
          if (!needed) return

          console.log(`[player] Swapping to transcode — audio:${codecs.audioCodec} video:${codecs.videoCodec}`)
          const seekTo  = Math.floor(video.currentTime || 0)
          // Use preferred audio language so ffmpeg selects the right track by default
          const streamLangs = session.streamLangs || []
          const al = audioLang && streamLangs.includes(audioLang) ? audioLang : ''
          const tUrl    = transcodeUrl(src, seekTo, transcodeVideo, al)

          // Tear down HLS if active, swap src to transcode stream
          if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
          video.crossOrigin = 'anonymous'
          video.src = tUrl
          video.play().catch(() => {})
          setTranscoding(true)
        }).catch(() => {})  // probe fetch error — ignore, native playback continues
      }
    }

    load()
  }, [session])

  // ── Auto-fetch subtitles from companion when none provided ───────────
  // Triggers when the session loads with empty subtitleTracks and the user
  // has autoFetchSubs enabled. Uses the companion's OpenSubtitles proxy.
  useEffect(() => {
    if (!session) return
    const tracks = session.subtitleTracks || []
    if (tracks.length > 0) return            // already have subs from addon
    if (!autoFetchSubs) return               // user disabled auto-fetch
    if (!session.imdbId && !session.title) return  // nothing to search with

    let revoked = false
    let blobUrl = null

    setAutoSubFetching(true)
    fetchCompanionSub({
      imdbId:    session.imdbId,
      title:     session.title,
      year:      session.year,
      lang:      subLang,
      mediaType: session.mediaType,
      season:    session.season,
      episode:   session.episode,
    }).then(url => {
      if (revoked || !url) { setAutoSubFetching(false); return }
      blobUrl = url
      const autoTrack = { id: 'auto_fetched', label: `Auto (${subLang.toUpperCase()})`, lang: subLang, url }
      setSubTracks([autoTrack])
      setActiveSub(0)
      setManualSubUrl(url)
      setAutoSubFetching(false)
    }).catch(() => setAutoSubFetching(false))

    return () => {
      revoked = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [session?.imdbId, session?.title, subLang, autoFetchSubs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual subtitle search (triggered by CC button) ──────────
  async function searchSubs(lang) {
    if (!session) return
    setAutoSubFetching(true)
    try {
      const url = await fetchCompanionSub({
        imdbId:    session.imdbId,
        title:     session.title,
        year:      session.year,
        lang:      lang || subLang,
        mediaType: session.mediaType,
        season:    session.season,
        episode:   session.episode,
      })
      if (!url) return
      const newTrack = { id: 'auto_fetched', label: `OpenSubs (${(lang || subLang).toUpperCase()})`, lang: lang || subLang, url }
      setSubTracks(prev => {
        const filtered = prev.filter(t => t.id !== 'auto_fetched')
        const next = [...filtered, newTrack]
        const idx = next.length - 1
        setActiveSub(idx)
        setManualSubUrl(url)
        return next
      })
    } finally {
      setAutoSubFetching(false)
    }
  }

  // ── Cleanup on close ──────────────────────────────────────────
  useEffect(() => {
    if (session) return
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    gainRef.current = null; delayRef.current = null
  }, [session])

  // ── Web Audio pipeline (lazy init on first play) ───────────────
  const analyserRef = useRef(null)
  const silenceTimer = useRef(null)

  function initAudio() {
    const video = videoRef.current
    if (!video || audioCtxRef.current) return
    try {
      const ctx      = new AudioContext()
      const source   = ctx.createMediaElementSource(video)
      const gain     = ctx.createGain()
      const delay    = ctx.createDelay(5.0)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      gain.gain.value       = muted ? 0 : volume
      delay.delayTime.value = 0
      source.connect(gain)
      gain.connect(delay)
      delay.connect(analyser)
      analyser.connect(ctx.destination)
      audioCtxRef.current = ctx
      gainRef.current     = gain
      delayRef.current    = delay
      analyserRef.current = analyser
      ctx.resume().catch(() => {})

      // After 4s of play, check if audio is actually producing signal.
      // Silent = all frequency bins near zero → likely unsupported codec.
      clearTimeout(silenceTimer.current)
      silenceTimer.current = setTimeout(() => {
        if (!analyserRef.current || muted || volume === 0) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        if (avg < 1) {
          setAudioWarning('No audio detected — stream may use AC3/DTS codec.')
        }
      }, 4000)
    } catch (e) {
      console.warn('[audio] Web Audio pipeline failed, using native volume:', e.message)
    }
  }

  // ── Video events ──────────────────────────────────────────────
  function onTimeUpdate(e) {
    const v = e.currentTarget
    setCurrentTime(v.currentTime)
    if (v.duration > 0) {
      const b = v.buffered
      if (b.length) setBuffered((b.end(b.length - 1) / v.duration) * 100)
    }
    session?.onProgress?.(v.currentTime, v.duration)
  }

  function onPlay()    {
    setPlaying(true)
    setBuffering(false)
    // Show "No Audio?" hint 8s after playback starts, auto-hide after 30s
    clearTimeout(noAudioTimer.current)
    if (!transcoding) {
      noAudioTimer.current = setTimeout(() => {
        setShowNoAudio(true)
        noAudioTimer.current = setTimeout(() => setShowNoAudio(false), 30000)
      }, 8000)
    }
  }
  function onPause()   { setPlaying(false) }
  function onEnded()   { setPlaying(false) }
  function onWaiting() { setBuffering(true) }
  function onCanPlay() { setBuffering(false) }

  function onLoadedMetadata(e) {
    const v = e.currentTarget
    setDuration(v.duration)
    setAudioWarning('')
  }

  function onError(e)  {
    const v = e.currentTarget
    const code = v.error?.code
    // MediaError codes: 1=aborted, 2=network, 3=decode, 4=not supported
    if (code === 4) {
      setError('Format not supported. The video codec (HEVC/H.265) or audio codec (AC3/DTS) may not be supported by this browser.')
    } else if (code === 3) {
      setError('Decode error — the file may be corrupted or use an unsupported codec.')
    } else if (code) {
      setError('Could not play this stream. The format may be unsupported.')
    }
  }

  /** Re-load the stream through the companion's ffmpeg transcoder (full fix: audio + video) */
  function fixAudio() {
    const video = videoRef.current
    if (!video) return
    const src = rawUrlRef.current || session?.url
    if (!src) return
    // When manually triggered, always transcode both audio AND video to guarantee playback
    const tUrl = transcodeUrl(src, Math.floor(video.currentTime || 0), true)
    setTranscoding(true)
    setAudioWarning('')
    setError('')
    video.crossOrigin = 'anonymous'
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    video.src = tUrl
    video.play().catch(() => {})
  }

  // ── Controls ─────────────────────────────────────────────────
  function togglePlay() {
    const v = videoRef.current; if (!v) return
    if (v.paused) { initAudio(); v.play() } else { v.pause() }
  }

  function seek(secs) {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + secs))
  }

  function seekTo(frac) {
    const v = videoRef.current; if (!v) return
    v.currentTime = frac * v.duration
  }

  function changeVolume(val) {
    const v = videoRef.current; if (!v) return
    const n = Math.max(0, Math.min(1, val))
    setVolume(n); setMuted(n === 0)
    if (gainRef.current) gainRef.current.gain.value = n
    else v.volume = n
  }

  function toggleMute() {
    const v = videoRef.current; if (!v) return
    const next = !muted; setMuted(next)
    if (gainRef.current) gainRef.current.gain.value = next ? 0 : volume
    else v.muted = next
  }

  function changeAudioDelay(ms) {
    setAudioDelay(ms)
    if (delayRef.current) delayRef.current.delayTime.value = ms / 1000
  }

  function changeSubtitle(idx) {
    setActiveSub(idx)
    const track = subTracks[idx]
    if (!track) {
      // Turn off
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1
      setManualSubUrl('')
      return
    }
    if (track.hlsIdx !== undefined) {
      // HLS embedded track — let hls.js handle it
      if (hlsRef.current) hlsRef.current.subtitleTrack = track.hlsIdx
    } else if (track.url) {
      // External VTT — load via <track> element (handled in render via manualSubUrl)
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1
      setManualSubUrl(track.url)
    }
  }

  // Apply subtitle offset by rewriting VTT blob when offset or active sub changes
  const activeSubUrl = useRef(null)
  useEffect(() => {
    const track = activeSub >= 0 ? subTracks[activeSub] : null
    if (!track?.url || track.hlsIdx !== undefined) return
    if (subOffset === 0) { setManualSubUrl(track.url); return }

    // Fetch VTT and shift all timestamps
    fetch(track.url)
      .then(r => r.text())
      .then(vtt => {
        const shifted = shiftVtt(vtt, subOffset)
        const blob = new Blob([shifted], { type: 'text/vtt' })
        if (activeSubUrl.current) URL.revokeObjectURL(activeSubUrl.current)
        activeSubUrl.current = URL.createObjectURL(blob)
        setManualSubUrl(activeSubUrl.current)
      })
      .catch(() => {})

    return () => {
      if (activeSubUrl.current) { URL.revokeObjectURL(activeSubUrl.current); activeSubUrl.current = null }
    }
  }, [activeSub, subOffset, subTracks]) // eslint-disable-line react-hooks/exhaustive-deps

  function changeRate(r) {
    const v = videoRef.current; if (!v) return
    v.playbackRate = r; setPlaybackRate(r)
  }

  function changeQuality(idx) {
    setQuality(idx)
    if (hlsRef.current) hlsRef.current.currentLevel = idx - 1 // 0=auto=-1
  }

  function changeAudioTrack(id) {
    setAudioTrack(id)
    if (hlsRef.current) hlsRef.current.audioTrack = id
  }

  function toggleFullscreen() {
    const el = containerRef.current; if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {})
    else document.exitFullscreen()
  }

  useEffect(() => {
    function onFsChange() { setFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // ── Controls auto-hide ────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false)
    }, HIDE_DELAY)
  }, [])

  useEffect(() => () => clearTimeout(hideTimer.current), [])

  // ── FireTV back button handler ────────────────────────────────
  // The Activity calls window.__vaulttvBack() before doing goBack().
  // First press shows "Press back again to exit" toast.
  // Second press within 3s closes the player.
  useEffect(() => {
    if (!session) return
    window.__vaulttvBack = () => {
      if (backPressedOnce.current) {
        // Second press — close player
        clearTimeout(backToastTimer.current)
        backPressedOnce.current = false
        setBackToast(false)
        closePlayer()
      } else {
        // First press — show toast
        backPressedOnce.current = true
        setBackToast(true)
        clearTimeout(backToastTimer.current)
        backToastTimer.current = setTimeout(() => {
          backPressedOnce.current = false
          setBackToast(false)
        }, 3000)
      }
      // Tell the Activity we handled it (don't goBack)
      window.vaulttvBridge?.backHandled()
    }
    return () => {
      window.__vaulttvBack = null
      clearTimeout(backToastTimer.current)
    }
  }, [session, closePlayer]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep showNoAudioRef in sync
  useEffect(() => { showNoAudioRef.current = showNoAudio }, [showNoAudio])
  useEffect(() => { settingsOpenRef.current = settingsOpen }, [settingsOpen])

  // ── FireTV directional remote handler ─────────────────────────
  // Registered on window CAPTURE so it fires before the APK spatial nav
  // (which is on document capture). stopImmediatePropagation prevents spatial
  // nav from also acting on the same keypress.
  useEffect(() => {
    if (!session || !IS_FIRETV) return
    function onFireTVKey(e) {
      const k = e.keyCode
      const isUp    = k === 38 || k === 226
      const isDown  = k === 40 || k === 227
      const isLeft  = k === 37 || k === 225
      const isRight = k === 39 || k === 228
      const isSelect = k === 13 || k === 23
      if (!isUp && !isDown && !isLeft && !isRight && !isSelect) return

      // Always show controls on remote activity
      resetHideTimer()

      // Let spatial nav handle navigation inside the settings panel
      if (settingsOpenRef.current) return

      e.preventDefault()
      e.stopImmediatePropagation()

      if (timelineActiveRef.current) {
        // Timeline/scrubber mode — L/R seeks, anything else exits
        if (isLeft)  { seek(-SKIP_SECS); return }
        if (isRight) { seek(+SKIP_SECS); return }
        // Up/Down/Select all exit timeline mode
        setTimelineActive(false)
        if (isUp) closeBtnRef.current?.focus()
        return
      }

      // Normal mode
      if (isUp) {
        // If "No Audio?" toast is showing, Up goes to Fix It button
        if (showNoAudioRef.current && fixItBtnRef.current) {
          fixItBtnRef.current.focus()
        } else {
          closeBtnRef.current?.focus()
        }
        return
      }
      if (isDown)   { setTimelineActive(true); return }
      if (isLeft)   { skipBackBtnRef.current?.focus(); return }
      if (isRight)  { skipFwdBtnRef.current?.focus(); return }
      if (isSelect) {
        // Play/pause if nothing meaningful is focused
        const el = document.activeElement
        if (!el || el === document.body || el === containerRef.current) {
          togglePlay()
        } else {
          el.click()
        }
      }
    }
    window.addEventListener('keydown', onFireTVKey, { capture: true })
    return () => window.removeEventListener('keydown', onFireTVKey, { capture: true })
  }, [session, resetHideTimer]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft':   e.preventDefault(); seek(-SKIP_SECS); break
        case 'ArrowRight':  e.preventDefault(); seek(+SKIP_SECS); break
        case 'ArrowUp':     e.preventDefault(); changeVolume(volume + 0.1); break
        case 'ArrowDown':   e.preventDefault(); changeVolume(volume - 0.1); break
        case 'm': case 'M': toggleMute(); break
        case 'f': case 'F': toggleFullscreen(); break
        case 'Escape':      if (!document.fullscreenElement) closePlayer(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, volume, muted]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Progress bar interaction ──────────────────────────────────
  function onProgressClick(e) {
    const rect = progressRef.current.getBoundingClientRect()
    seekTo((e.clientX - rect.left) / rect.width)
  }

  function onProgressHover(e) {
    const rect = progressRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverTime(frac * duration)
    setHoverX(e.clientX - rect.left)
  }

  if (!session) return null

  const title = session.title || 'Now Playing'
  const playedPct  = duration > 0 ? (currentTime / duration) * 100 : 0

  const VolumeIcon = muted || volume === 0 ? FiVolumeX : volume < 0.5 ? FiVolume1 : FiVolume2

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (playing) setShowControls(false) }}
      onClick={() => { if (!settingsOpen) togglePlay() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: showControls ? 'default' : 'none',
      }}
    >
      {/* ── Video element ── */}
      <video
        ref={videoRef}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
        onError={onError}
        onWaiting={onWaiting}
        onCanPlay={onCanPlay}
        onPlaying={onCanPlay}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        playsInline
      >
        {/* <track> MUST be inside <video> — browser ignores it as a sibling */}
        {manualSubUrl && (
          <track key={manualSubUrl} kind="subtitles" src={manualSubUrl} default label="Subtitles" />
        )}
      </video>

      {/* ── Transcoding indicator ── */}
      {transcoding && (
        <div style={{ position: 'absolute', top: '1rem', right: '4rem', zIndex: 10, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 6, padding: '0.3rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <span style={{ color: '#4ade80', fontSize: '0.72rem', fontWeight: 600 }}>AAC transcode</span>
        </div>
      )}

      {/* ── FireTV back-button toast ── */}
      {backToast && (
        <div style={{
          position: 'absolute', top: '1.25rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, padding: '0.55rem 1.1rem',
          color: '#fff', fontSize: '0.9rem', fontWeight: 600,
          zIndex: 10000, whiteSpace: 'nowrap', pointerEvents: 'none',
          animation: 'fadeInDown 0.2s ease',
        }}>
          Press back again to exit the player
        </div>
      )}

      {/* ── Buffering overlay — poster with slow pulse ── */}
      {buffering && !error && session?.poster && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)', pointerEvents: 'none', zIndex: 5,
        }}>
          <img
            src={session.poster}
            alt=""
            style={{
              height: '55%', maxHeight: 320, borderRadius: 8,
              boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
              animation: 'bufferPulse 1.8s ease-in-out infinite',
            }}
          />
        </div>
      )}
      {buffering && !error && !session?.poster && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 5,
        }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent)', animation: 'spin 0.9s linear infinite' }} />
        </div>
      )}

      {/* ── "No Audio?" quick-fix hint (first 8s of every stream) ── */}
      {showNoAudio && !transcoding && !audioWarning && (
        <div style={{
          position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center',
          gap: '0.65rem', zIndex: 20, whiteSpace: 'nowrap', animation: 'fadeInOut 6s ease forwards',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>🔇 No audio?</span>
          <button
            ref={fixItBtnRef}
            onClick={() => { setShowNoAudio(false); fixAudio() }}
            style={{ background: '#f97316', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '0.25rem 0.65rem', fontSize: '0.78rem', fontWeight: 700 }}
          >Fix It</button>
          <button
            onClick={() => setShowNoAudio(false)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.25rem' }}
          >✕</button>
        </div>
      )}

      {/* ── Audio warning + Fix Audio button ── */}
      {audioWarning && !transcoding && (
        <div style={{
          position: 'absolute', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(251,191,36,0.5)',
          borderRadius: 8, padding: '0.6rem 1rem', display: 'flex', alignItems: 'center',
          gap: '0.75rem', zIndex: 20, whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#fbbf24', fontSize: '0.82rem' }}>⚠ {audioWarning}</span>
          <button
            onClick={fixAudio}
            style={{ background: '#fbbf24', border: 'none', borderRadius: 6, color: '#000', cursor: 'pointer', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 700 }}
          >Fix Audio</button>
        </div>
      )}

      {/* ── Error overlay ── */}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', pointerEvents: 'none', zIndex: 10 }}>
          <p style={{ color: '#f87171', fontSize: '1rem', fontWeight: 600, textAlign: 'center', maxWidth: 400, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* ── Controls overlay ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          opacity: showControls || !playing ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: showControls || !playing ? 'auto' : 'none',
        }}
      >
        {/* ── Top bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)',
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{title}</p>
            {session.year && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)' }}>{session.year}</p>}
          </div>
          <button
            ref={closeBtnRef}
            onClick={closePlayer}
            title="Close (Esc)"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', color: '#fff', cursor: 'pointer', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <FiX size={18} />
          </button>
        </div>

        {/* ── Centre tap hint (skip) ── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5rem', pointerEvents: 'none' }}>
          <SkipHint dir="left"  />
          <div style={{ width: 64 }} />
          <SkipHint dir="right" />
        </div>

        {/* ── Bottom bar ── */}
        <div style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 100%)',
          padding: '1rem 1.5rem 1.25rem',
        }}>

          {/* Progress bar — glows when timeline mode active on FireTV */}
          {timelineActive && (
            <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.4rem', letterSpacing: '0.08em' }}>
              ← REWIND &nbsp;|&nbsp; FAST FORWARD →
            </div>
          )}
          <div
            ref={progressRef}
            onClick={onProgressClick}
            onMouseMove={onProgressHover}
            onMouseLeave={() => setHoverTime(null)}
            style={{ height: timelineActive ? 6 : 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, cursor: 'pointer', position: 'relative', marginBottom: '0.85rem', transition: 'height 0.15s, box-shadow 0.15s', boxShadow: timelineActive ? '0 0 0 3px rgba(124,58,237,0.5)' : 'none' }}
          >
            {/* Buffered */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: 'rgba(255,255,255,0.25)', width: `${buffered}%` }} />
            {/* Played */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: 'var(--accent)', width: `${playedPct}%` }} />
            {/* Thumb */}
            <div style={{ position: 'absolute', top: '50%', left: `${playedPct}%`, transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px rgba(0,0,0,0.6)' }} />
            {/* Hover tooltip */}
            {hoverTime !== null && (
              <div style={{ position: 'absolute', bottom: '100%', left: hoverX, transform: 'translateX(-50%)', marginBottom: 8, background: 'rgba(0,0,0,0.9)', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: '0.75rem', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {fmt(hoverTime)}
              </div>
            )}
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>

            {/* Skip back */}
            <CtrlBtn ref={skipBackBtnRef} onClick={() => seek(-SKIP_SECS)} title="-10s">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                <text x="12" y="14" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none">10</text>
              </svg>
            </CtrlBtn>

            {/* Play / Pause */}
            <CtrlBtn ref={playBtnRef} onClick={togglePlay} title={playing ? 'Pause (Space)' : 'Play (Space)'} large>
              {playing ? <FiPause size={26} /> : <FiPlay size={26} />}
            </CtrlBtn>

            {/* Skip forward */}
            <CtrlBtn ref={skipFwdBtnRef} onClick={() => seek(+SKIP_SECS)} title="+10s">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.51"/>
                <text x="12" y="14" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none">10</text>
              </svg>
            </CtrlBtn>

            {/* Time */}
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: 4 }}>
              {fmt(currentTime)} / {fmt(duration)}
            </span>

            <div style={{ flex: 1 }} />

            {/* Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CtrlBtn onClick={toggleMute} title="Mute (M)">
                <VolumeIcon size={18} />
              </CtrlBtn>
              <input
                type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
                onChange={e => changeVolume(Number(e.target.value))}
                style={{ width: 80, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>

            {/* Playback speed */}
            <select
              value={playbackRate}
              onChange={e => changeRate(Number(e.target.value))}
              title="Playback speed"
              style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', padding: '0.2rem 0.4rem', cursor: 'pointer', fontSize: '0.78rem' }}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => (
                <option key={r} value={r}>{r === 1 ? 'Normal' : `${r}×`}</option>
              ))}
            </select>

            {/* Audio track picker — only shown when stream has >1 track */}
            {audioTracks.length > 1 && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => { setAudioMenuOpen(o => !o); setSettingsOpen(false) }}
                  title="Switch audio track"
                  style={{
                    background: audioMenuOpen ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)',
                    border: `1px solid ${audioMenuOpen ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: 6, color: '#fff', cursor: 'pointer',
                    padding: '0.2rem 0.5rem', fontSize: '0.72rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    transition: 'all 0.15s',
                  }}
                >
                  🎵 {audioTracks.find(t => t.id === audioTrack)?.name || 'Audio'}
                </button>
                {audioMenuOpen && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                      background: 'rgba(10,10,15,0.97)', backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                      minWidth: 180, overflow: 'hidden', zIndex: 100,
                    }}
                  >
                    <p style={{ margin: 0, padding: '0.4rem 0.75rem', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      Audio Track
                    </p>
                    {audioTracks.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { changeAudioTrack(t.id); setAudioMenuOpen(false) }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.5rem 0.75rem', border: 'none', cursor: 'pointer', textAlign: 'left',
                          background: audioTrack === t.id ? 'rgba(124,58,237,0.25)' : 'transparent',
                          color: audioTrack === t.id ? '#fff' : 'rgba(255,255,255,0.65)',
                          fontSize: '0.82rem', borderBottom: '1px solid rgba(255,255,255,0.05)',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (audioTrack !== t.id) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                        onMouseLeave={e => { if (audioTrack !== t.id) e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{ color: audioTrack === t.id ? 'var(--accent)' : 'transparent', fontSize: '0.7rem' }}>✓</span>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CC subtitle button — always visible; opens subs tab */}
            <button
              onClick={() => { setSettingsOpen(true); setSettingsTab('subtitles'); setAudioMenuOpen(false); setSubMenuOpen(false) }}
              title="Subtitles"
              style={{
                background: activeSub >= 0 ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)',
                border: `1px solid ${activeSub >= 0 ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: 6, color: '#fff', cursor: 'pointer',
                padding: '0.2rem 0.5rem', fontSize: '0.72rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                transition: 'all 0.15s',
              }}
            >
              CC{activeSub >= 0 ? ` · ${subTracks[activeSub]?.lang?.toUpperCase() || 'ON'}` : ''}
              {autoSubFetching && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite', display: 'inline-block' }} />}
            </button>

            {/* Settings */}
            <CtrlBtn onClick={() => { setSettingsOpen(o => !o); setAudioMenuOpen(false) }} title="Settings" active={settingsOpen}>
              <FiSettings size={18} />
            </CtrlBtn>

            {/* Fullscreen */}
            <CtrlBtn onClick={toggleFullscreen} title="Fullscreen (F)">
              {fullscreen ? <FiMinimize size={18} /> : <FiMaximize size={18} />}
            </CtrlBtn>

          </div>
        </div>
      </div>

      {/* ── Settings panel ── */}
      {settingsOpen && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 90, right: '1.5rem',
            width: 320, background: 'rgba(10,10,20,0.97)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 16px 64px rgba(0,0,0,0.8)',
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {[
              { id: 'quality',   icon: <MdHighQuality size={16} />, label: 'Quality' },
              { id: 'audio',     icon: <MdAudiotrack  size={16} />, label: 'Audio'   },
              { id: 'subtitles', icon: <MdSubtitles   size={16} />, label: 'Subs'    },
              { id: 'sync',      icon: <MdSyncAlt     size={16} />, label: 'Sync'    },
              { id: 'speed',     icon: <MdSpeed       size={16} />, label: 'Speed'   },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setSettingsTab(t.id)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 2, padding: '0.6rem 0.25rem', background: 'transparent',
                  border: 'none', borderBottom: settingsTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: settingsTab === t.id ? '#fff' : 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div style={{ padding: '1rem' }}>

            {/* Quality tab */}
            {settingsTab === 'quality' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {qualities.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', margin: 0 }}>Quality selection available for HLS streams only.</p>}
                {qualities.map((q, i) => (
                  <SettingRow key={i} active={quality === i} onClick={() => changeQuality(i)}>
                    <MdHighQuality size={14} /> {q.label}
                  </SettingRow>
                ))}
              </div>
            )}

            {/* Audio tab */}
            {settingsTab === 'audio' && (
              <div>
                {/* Preferred language — always visible */}
                <Label>Preferred Audio Language</Label>
                <select
                  value={audioLang}
                  onChange={e => savePrefs({ audioLang: e.target.value })}
                  style={{
                    width: '100%', marginBottom: '1rem',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6, color: '#fff', padding: '0.45rem 0.6rem',
                    fontSize: '0.82rem', cursor: 'pointer',
                  }}
                >
                  <option value="">No preference</option>
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>

                {audioTracks.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <Label>Audio Track (this stream)</Label>
                    {audioTracks.map(t => (
                      <SettingRow key={t.id} active={audioTrack === t.id} onClick={() => changeAudioTrack(t.id)}>
                        <MdAudiotrack size={14} /> {t.name}
                      </SettingRow>
                    ))}
                  </div>
                )}
                {audioTracks.length === 0 && !transcoding && (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                    This stream has one audio track. Your preferred language will auto-select on streams with multiple tracks.
                  </p>
                )}

                {/* Transcode language switcher — only when companion is transcoding a multi-lang stream */}
                {transcoding && session?.streamLangs?.filter(l => !['MULTI','DUAL'].includes(l)).length > 1 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <Label>Audio Language (re-transcode)</Label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {session.streamLangs.filter(l => !['MULTI','DUAL'].includes(l)).map(lang => (
                        <button
                          key={lang}
                          onClick={() => {
                            if (!session.rawStreamUrl) return
                            const url = transcodeUrl(session.rawStreamUrl, 0, !!session.transcodeVideo, lang.toLowerCase())
                            // Swap the video src without destroying the full session
                            const video = videoRef.current
                            if (video) { video.src = url; video.play().catch(() => {}) }
                            setTranscoding(true)
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.45rem 0.65rem', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 6, background: 'rgba(255,255,255,0.06)',
                            color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                            textAlign: 'left', transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                        >
                          <MdAudiotrack size={14} style={{ color: 'var(--accent)' }} />
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fix Audio — always visible, click if stream has no sound */}
                <div style={{ marginBottom: '1rem', padding: '0.65rem 0.75rem', background: transcoding ? 'rgba(74,222,128,0.08)' : 'rgba(249,115,22,0.08)', border: `1px solid ${transcoding ? 'rgba(74,222,128,0.3)' : 'rgba(249,115,22,0.3)'}`, borderRadius: 8 }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: transcoding ? '#4ade80' : '#fb923c' }}>
                    {transcoding ? '✓ AAC Transcode Active' : '🔇 No Sound? Fix It'}
                  </p>
                  <p style={{ margin: '0 0 0.6rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                    {transcoding
                      ? 'Audio is being re-encoded to AAC via companion.'
                      : 'Streams with AC3/DTS/EAC3 audio play silently in browsers. Click to re-encode audio through your companion server.'}
                  </p>
                  <button
                    onClick={fixAudio}
                    disabled={transcoding}
                    style={{ width: '100%', background: transcoding ? 'rgba(74,222,128,0.2)' : '#f97316', border: 'none', borderRadius: 6, color: '#fff', padding: '0.45rem', fontWeight: 700, fontSize: '0.8rem', cursor: transcoding ? 'default' : 'pointer' }}
                  >
                    {transcoding ? '✓ Transcoding via Companion' : '🔧 Fix Audio via Companion'}
                  </button>
                </div>

                <Label>Audio Delay: {audioDelay > 0 ? `+${audioDelay}ms` : `${audioDelay}ms`}</Label>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>
                  Positive = audio comes later. Use when audio is ahead of video (lips move, sound follows).
                </p>
                <input
                  type="range" min={-500} max={5000} step={50}
                  value={audioDelay}
                  onChange={e => changeAudioDelay(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  <span>-500ms</span><span>0</span><span>+5000ms</span>
                </div>
              </div>
            )}

            {/* Subtitles tab */}
            {settingsTab === 'subtitles' && (
              <div>
                {/* Preferred language — always visible */}
                <Label>Preferred Subtitle Language</Label>
                <select
                  value={subLang}
                  onChange={e => {
                    savePrefs({ subLang: e.target.value })
                    // Re-select matching track for this session
                    if (subTracks.length > 0) {
                      const idx = subTracks.findIndex(t =>
                        t.lang?.toLowerCase().startsWith(e.target.value) ||
                        t.label?.toLowerCase().includes(e.target.value)
                      )
                      if (idx >= 0) changeSubtitle(idx)
                    }
                  }}
                  style={{
                    width: '100%', marginBottom: '1rem',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6, color: '#fff', padding: '0.45rem 0.6rem',
                    fontSize: '0.82rem', cursor: 'pointer',
                  }}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>

                {/* Track list */}
                <Label>Subtitle Track</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem', maxHeight: 180, overflowY: 'auto', overflowX: 'hidden' }}>
                  <SettingRow active={activeSub === -1} onClick={() => changeSubtitle(-1)}>
                    <MdSubtitles size={14} /> Off
                  </SettingRow>
                  {subTracks.map((t, i) => (
                    <SettingRow key={t.id || i} active={activeSub === i} onClick={() => changeSubtitle(i)}>
                      <MdSubtitles size={14} />
                      <span style={{ flex: 1 }}>{t.label || t.lang || `Track ${i + 1}`}</span>
                      {t.hlsIdx !== undefined && <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>embedded</span>}
                      {t.url && !t.hlsIdx && <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>vtt</span>}
                    </SettingRow>
                  ))}
                  {subTracks.length === 0 && !autoSubFetching && (
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', margin: '0.25rem 0' }}>
                      No subtitle tracks found for this stream.
                    </p>
                  )}
                  {autoSubFetching && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.65rem', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>Searching OpenSubtitles…</span>
                    </div>
                  )}
                </div>

                {/* Search OpenSubtitles button */}
                <button
                  onClick={() => searchSubs(subLang)}
                  disabled={autoSubFetching}
                  style={{
                    width: '100%', marginBottom: '1rem', padding: '0.5rem',
                    background: autoSubFetching ? 'rgba(255,255,255,0.05)' : 'rgba(124,58,237,0.2)',
                    border: `1px solid ${autoSubFetching ? 'rgba(255,255,255,0.1)' : 'rgba(124,58,237,0.5)'}`,
                    borderRadius: 6, color: autoSubFetching ? 'rgba(255,255,255,0.3)' : '#fff',
                    cursor: autoSubFetching ? 'default' : 'pointer',
                    fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  }}
                >
                  <MdSubtitles size={15} />
                  {autoSubFetching ? 'Searching…' : `Search OpenSubtitles (${subLang.toUpperCase()})`}
                </button>

                {/* Manual VTT URL fallback */}
                <Label>Manual URL (.vtt fallback)</Label>
                <input
                  value={manualSubUrl.startsWith('blob:') ? '' : manualSubUrl}
                  onChange={e => { setManualSubUrl(e.target.value); setActiveSub(-1) }}
                  placeholder="https://example.com/subs.vtt"
                  style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', padding: '0.45rem 0.6rem', fontSize: '0.82rem', marginBottom: '1rem' }}
                />

                {/* Offset slider — only relevant when a VTT track is active */}
                <Label>Subtitle Offset: {subOffset > 0 ? `+${subOffset}s` : `${subOffset}s`}</Label>
                <input
                  type="range" min={-10} max={10} step={0.25}
                  value={subOffset}
                  onChange={e => setSubOffset(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  <span>-10s</span><span>0</span><span>+10s</span>
                </div>
              </div>
            )}

            {/* Sync tab */}
            {settingsTab === 'sync' && (
              <div>
                <Label>A/V Sync — Audio Delay</Label>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                  If lips move <em>before</em> you hear sound, increase the delay. If sound comes <em>before</em> lips move, decrease it.
                </p>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', textAlign: 'center', marginBottom: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                  {audioDelay > 0 ? `+${audioDelay}` : audioDelay} ms
                </div>
                <input
                  type="range" min={-500} max={5000} step={50}
                  value={audioDelay}
                  onChange={e => changeAudioDelay(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer', marginBottom: '0.5rem' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  {[-200,-100,0,100,200,500].map(v => (
                    <button key={v} onClick={() => changeAudioDelay(v)}
                      style={{ background: audioDelay === v ? 'var(--accent)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}>
                      {v > 0 ? `+${v}` : v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Speed tab */}
            {settingsTab === 'speed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => (
                  <SettingRow key={r} active={playbackRate === r} onClick={() => changeRate(r)}>
                    <MdSpeed size={14} /> {r === 1 ? 'Normal' : `${r}×`}
                  </SettingRow>
                ))}
              </div>
            )}

          </div>
        </div>
      )}

      <style>{`
        @keyframes bufferPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          10%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────

const CtrlBtn = React.forwardRef(function CtrlBtn({ onClick, title, children, large, active }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        border: 'none', color: '#fff', cursor: 'pointer',
        width: large ? 52 : 36, height: large ? 52 : 36,
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s', flexShrink: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
      onMouseLeave={e => e.currentTarget.style.background = active ? 'rgba(255,255,255,0.15)' : 'transparent'}
    >
      {children}
    </button>
  )
})

function SettingRow({ onClick, active, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.5rem 0.65rem', background: active ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)',
        border: active ? '1px solid var(--accent)' : '1px solid transparent',
        borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: active ? 600 : 400,
        textAlign: 'left',
      }}
    >
      {children}
    </button>
  )
}

function Label({ children }) {
  return (
    <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.4)' }}>
      {children}
    </p>
  )
}

function SkipHint({ dir }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', opacity: 0.3, userSelect: 'none', pointerEvents: 'none' }}>
      {dir === 'left'
        ? <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
        : <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.51"/></svg>
      }
      <span style={{ fontSize: '0.7rem', color: '#fff' }}>{SKIP_SECS}s</span>
    </div>
  )
}
