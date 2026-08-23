import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePlayer } from '../context/PlayerContext'
import { useLanguage } from '../context/LanguageContext'
import { useCast } from '../context/CastContext'
import Hls from 'hls.js'
import { transcodeUrl, probeAudioCodec as probeCodecs, needsTranscode, pickAudioTrack, pingCompanion, COMPANION_PORT, getLanBaseUrl, toLanUrl } from '../lib/companion'
import { IS_ELECTRON } from '../lib/platform'
import { fetchCompanionSub } from '../lib/subtitles'
import {
  FiPlay, FiPause, FiVolume2, FiVolumeX, FiVolume1,
  FiMaximize, FiMinimize, FiX, FiSettings, FiChevronLeft,
} from 'react-icons/fi'
import {
  MdSubtitles, MdAudiotrack, MdSpeed, MdSyncAlt, MdHighQuality, MdCast, MdCastConnected,
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
  const cast = useCast()
  const [castingThis, setCastingThis] = useState(false) // true once *this* session's media loaded onto the active cast session

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
  const closeBtnRef      = useRef(null)
  const skipBackBtnRef   = useRef(null)
  const skipFwdBtnRef    = useRef(null)
  const playBtnRef       = useRef(null)
  const fixItBtnRef      = useRef(null)
  const volumeBtnRef     = useRef(null)
  const ccBtnRef         = useRef(null)
  const settingsBtnRef   = useRef(null)
  const fullscreenBtnRef = useRef(null)
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
  const [transcodeKind, setTranscodeKind] = useState('')  // 'video+audio' | 'audio'
  // The badge is informational, not a live status readout — it used to sit
  // pinned on screen for the entire episode. Flash it when the swap happens,
  // then get out of the way.
  const [showTranscodeBadge, setShowTranscodeBadge] = useState(false)
  const [buffering,    setBuffering]    = useState(true)  // true while video is loading/stalled
  const [showNoAudio,  setShowNoAudio]  = useState(false) // "No audio?" hint for first 8s
  const noAudioTimer = useRef(null)
  const rawUrlRef = useRef('')                             // original URL before transcoding
  const audioTracksRef = useRef([])                        // real audio streams, from /probe
  const pendingCastRef = useRef(false)                     // next session should resume on the TV
  // Seconds of the title that the CURRENT src already skips past. A transcode
  // URL bakes the resume point in via ffmpeg -ss, so its own timeline starts
  // at 0 there; everything else is 0. Used to avoid double-seeking and to keep
  // saved progress in title-time rather than stream-time. A ref, not state,
  // because onLoadedMetadata can fire before a setState would be visible.
  const srcStartOffsetRef = useRef(0)
  // Whether a Web Audio graph can legally be built over the current source —
  // see the crossOrigin decision in the load effect.
  const canUseWebAudioRef = useRef(true)
  const [hoverTime,      setHoverTime]      = useState(null)  // for progress tooltip
  const [hoverX,         setHoverX]         = useState(0)
  const [timelineActive, setTimelineActiveState] = useState(false)
  const [backToast, setBackToast] = useState(false)
  const [upNextCountdown, setUpNextCountdown] = useState(null) // null | number (seconds left)
  const upNextTimer = useRef(null)
  // Sticky "user said no" flag. dismissUpNext() only used to null the
  // countdown, but onTimeUpdate re-evaluates ~4x/sec and its trigger
  // condition (`upNextCountdown === null`) was true again the instant it
  // was dismissed — so Cancel just made the banner reappear immediately.
  const upNextDismissed = useRef(false)
  const backToastTimer  = useRef(null)
  const backPressedOnce = useRef(false)
  // FireTV scrubbing state
  const [seekPreview,    setSeekPreview]    = useState(null) // null = not scrubbing, number = preview secs
  const seekPreviewRef   = useRef(null)
  const seekIntervalRef  = useRef(null)
  const seekHoldStartRef = useRef(0)

  // Keep ref in sync so FireTV key handler (closure) always sees fresh value
  function setTimelineActive(v) { timelineActiveRef.current = v; setTimelineActiveState(v) }

  // FireTV scrub helpers
  function startScrub(dir) {
    if (seekIntervalRef.current) return // already running
    const video = videoRef.current; if (!video) return
    seekPreviewRef.current = video.currentTime
    seekHoldStartRef.current = Date.now()
    seekIntervalRef.current = setInterval(() => {
      const video = videoRef.current; if (!video) return
      const held = (Date.now() - seekHoldStartRef.current) / 1000
      // Accelerate: 3s/tick → 15s/tick → 30s/tick
      const rate = held < 1 ? 3 : held < 3 ? 15 : 30
      seekPreviewRef.current = Math.max(0, Math.min(
        video.duration || 0,
        (seekPreviewRef.current ?? video.currentTime) + (dir === 'right' ? rate : -rate)
      ))
      setSeekPreview(seekPreviewRef.current)
    }, 100)
  }

  function commitScrub() {
    if (!seekIntervalRef.current) return
    clearInterval(seekIntervalRef.current)
    seekIntervalRef.current = null
    const video = videoRef.current
    if (video && seekPreviewRef.current !== null) {
      video.currentTime = seekPreviewRef.current
    }
    seekPreviewRef.current = null
    setSeekPreview(null)
  }

  // ── Source loading ──────────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    const video = videoRef.current
    if (!video) return

    setPlaying(false); setCurrentTime(0); setDuration(0)
    setBuffered(0); setError(''); setAudioWarning(''); setQualities([]); setQuality(-1)
    setAudioTracks([]); setAudioTrack(0); setAudioDelay(0)
    setManualSubUrl(''); setSubOffset(0); setPlaybackRate(1)
    setSettingsOpen(false); setTranscoding(false); setTranscodeKind(''); setAutoSubFetching(false)
    setBuffering(true); setShowNoAudio(false); setShowControls(true)
    clearTimeout(noAudioTimer.current)
    clearInterval(upNextTimer.current)
    setUpNextCountdown(null)
    upNextDismissed.current = false  // new episode — offer Up Next again
    // Auto-hide controls after a moment on each new episode load
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), HIDE_DELAY)
    rawUrlRef.current = session.url || ''
    audioTracksRef.current = []
    srcStartOffsetRef.current = 0   // fresh source — nothing skipped yet

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

      // Identify streams coming from our own server. This used to only match
      // ':7842/' — the legacy standalone companion/server.js port — so files
      // served by the VaultTV Media Server (port 8080, what everyone actually
      // runs now) were misclassified as external addon streams: no
      // crossOrigin for the Web Audio API, and routed down the isRemote
      // probe/transcode path meant for third-party sources. Match either
      // server, and prefer an exact base-URL match over a bare port sniff so
      // a remote stream that happens to use the same port isn't caught.
      const companionBase = (window.__companionBase || '').replace(/\/$/, '')
      const isCompanion = (companionBase && src.startsWith(companionBase))
        || src.includes(':7842/')
        || src.includes(`:${COMPANION_PORT}/`)

      // crossOrigin="anonymous" buys the Web Audio API an untainted source, but
      // it also forces a CORS check on the media load itself — and that is not
      // free everywhere.
      //
      // In the Android app the page is https://vaulttv.pages.dev while the
      // companion is http:// on the LAN. WebView permits that mixed-content
      // media load ONLY while it carries no CORS requirement; set crossOrigin
      // and the request is blocked before it ever leaves the app (server logs
      // showed zero WebView-originated /stream hits — only ffprobe's). So the
      // element must stay CORS-free whenever the load is mixed-content.
      let sameOrigin = false
      try { sameOrigin = new URL(src, location.href).origin === location.origin } catch { /* blob:, etc. */ }
      const mixedContent = location.protocol === 'https:' && src.startsWith('http:')
      const useCors = isCompanion && !mixedContent && !sameOrigin

      if (useCors) video.crossOrigin = 'anonymous'
      else video.removeAttribute('crossOrigin')

      // Without CORS on a cross-origin element, createMediaElementSource()
      // yields a tainted node that outputs pure silence — so the Web Audio
      // graph has to be skipped, not merely unused. Volume/mute fall back to
      // the element's own controls (see changeVolume's gainRef null branch).
      canUseWebAudioRef.current = sameOrigin || useCors

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
      //
      // Probes ANY http(s) source, not just non-companion ones. Files served
      // by our own server are the case that needs this most: an HEVC/10-bit
      // rip plays fine in Electron (native decode) but no browser will touch
      // it, so a phone got a silent/blank player and no transcode was ever
      // attempted. The old `isRemote` gate here predated the Media Server and
      // meant "not one of ours" — which silently excluded every local file.
      // Electron still skips the actual swap via the IS_ELECTRON checks below.
      if (src.startsWith('http')) {
        probeCodecs(src).then(codecs => {
          if (!codecs) return  // companion offline — native playback continues
          let { needed, transcodeVideo } = needsTranscode(codecs)
          // Electron supports HEVC natively via Windows Media Foundation —
          // only transcode audio (AC3/DTS), never re-encode video on desktop.
          if (IS_ELECTRON) transcodeVideo = false
          if (!needed) return
          // If Electron + only issue was video (HEVC), nothing to transcode
          if (IS_ELECTRON && !needsTranscode({ ...codecs, videoCodec: null }).needed) return

          console.log(`[player] Swapping to transcode — audio:${codecs.audioCodec} video:${codecs.videoCodec} transcodeVideo:${transcodeVideo}`)
          const seekTo  = Math.floor(video.currentTime || 0)
          // Select the track by index off the real stream list rather than by
          // language tag. The addon's `streamLangs` describes the release, not
          // the file, so it happily claimed "en" for rips whose audio carries
          // no language metadata at all — and a language selector that matches
          // nothing aborts ffmpeg outright instead of falling back.
          audioTracksRef.current = codecs.audioTracks || []
          const ai = pickAudioTrack(audioTracksRef.current, audioLang)
          const tUrl = transcodeUrl(src, seekTo, transcodeVideo, ai)

          // Tear down HLS if active, swap src to transcode stream.
          // Same CORS rule as the initial load — forcing crossOrigin on a
          // mixed-content URL blocks the request outright in Android WebView.
          if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
          if (useCors) video.crossOrigin = 'anonymous'
          else video.removeAttribute('crossOrigin')
          video.src = tUrl
          srcStartOffsetRef.current = seekTo   // tUrl starts here; see onLoadedMetadata
          video.play().catch(() => {})
          setTranscodeKind(transcodeVideo ? 'video+audio' : 'audio')
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
    // Bail out when the source is cross-origin without CORS: routing it through
    // createMediaElementSource() would silence it outright.
    if (!canUseWebAudioRef.current) return
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

  function onPlay()    {
    setPlaying(true)
    setBuffering(false)
    setError('')
    // Show "No Audio?" hint 8s after playback starts, auto-hide after 30s
    // Skip if already transcoding (codec was already auto-fixed)
    clearTimeout(noAudioTimer.current)
    if (!transcoding) {
      noAudioTimer.current = setTimeout(() => {
        setShowNoAudio(true)
        noAudioTimer.current = setTimeout(() => setShowNoAudio(false), 30000)
      }, 8000)
    }
  }
  function onPause()   { setPlaying(false) }

  function onEnded() {
    setPlaying(false)
    clearInterval(upNextTimer.current)
    setUpNextCountdown(null)
    if (session?.onEpisodeEnded) {
      session.onEpisodeEnded()
    } else if (session?.onPlaybackEnded) {
      session.onPlaybackEnded()
    }
  }

  // Show "Up Next" countdown 30s before the end for TV episodes
  function onTimeUpdate(e) {
    const v = e.currentTarget
    if (v.duration && isFinite(v.duration)) {
      setCurrentTime(v.currentTime)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
      if (progressRef.current) progressRef.current.value = v.currentTime
      // Report in title-time, not stream-time: a transcoded stream's clock
      // restarts at 0 from the seek point, so without the offset resuming at
      // 20 min would save "2 min" and wipe the real position.
      const off = srcStartOffsetRef.current
      session?.onProgress?.(v.currentTime + off, off ? v.duration + off : v.duration)

      // Up Next countdown — only for TV episodes with a next-ep handler.
      //
      // Skipped entirely while transcoding: that stream is a fragmented MP4
      // piped straight out of ffmpeg (-movflags frag_keyframe+empty_moov,
      // -f mp4 pipe:1) with no duration in its header, so the browser reports
      // a placeholder that tracks how much has buffered rather than the real
      // runtime. `duration - currentTime` was therefore tiny from the first
      // seconds of playback and fired Up Next immediately. Auto-advance still
      // works on those streams — onEnded() calls onEpisodeEnded() directly.
      if (session?.onEpisodeEnded && session?.episode && !transcoding && !upNextDismissed.current) {
        const timeLeft = v.duration - v.currentTime
        if (timeLeft <= 30 && timeLeft > 0 && upNextCountdown === null) {
          // Start countdown
          setUpNextCountdown(Math.ceil(timeLeft))
          upNextTimer.current = setInterval(() => {
            setUpNextCountdown(prev => {
              if (prev === null) { clearInterval(upNextTimer.current); return null }
              if (prev <= 1)    { clearInterval(upNextTimer.current); return null }
              return prev - 1
            })
          }, 1000)
        }
      }
    }
  }

  // Up Next while casting.
  //
  // The countdown above rides on the local <video>'s timeupdate, which stops
  // firing the moment playback moves to the TV — so the prompt simply vanished
  // mid-episode. The receiver's clock is already being pushed to us
  // (CastController's progress listener -> window.__castProgress), so the same
  // 30-second rule is applied to that instead.
  //
  // Auto-advance is deliberately left to the user here: there's no reliable
  // "finished" signal from the receiver yet (nothing listens for
  // IDLE_REASON_FINISHED), and inferring the end from the clock would risk
  // skipping an episode early on a TV that stalls near the end.
  useEffect(() => {
    if (!castingThis || !session?.onEpisodeEnded || !session?.episode) return
    if (upNextDismissed.current || transcoding) return
    const { remoteTime, remoteDuration } = cast
    if (!remoteDuration || !isFinite(remoteDuration)) return
    const timeLeft = remoteDuration - remoteTime
    if (timeLeft <= 30 && timeLeft > 0) {
      if (upNextCountdown === null) setUpNextCountdown(Math.ceil(timeLeft))
      else if (Math.ceil(timeLeft) !== upNextCountdown) setUpNextCountdown(Math.ceil(timeLeft))
    }
  }, [castingThis, cast.remoteTime, cast.remoteDuration, transcoding, session, upNextCountdown])

  // Advancing an episode while casting: the new session loads locally first,
  // then gets pushed to the TV once its URL exists. Without this the next
  // episode would quietly start playing on the phone while the TV sat idle.
  useEffect(() => {
    if (!pendingCastRef.current || !session?.url) return
    pendingCastRef.current = false
    handleCast(true)
  }, [session?.url])

  function playNextNow() {
    clearInterval(upNextTimer.current)
    setUpNextCountdown(null)
    if (castingThis) pendingCastRef.current = true
    session?.onEpisodeEnded?.()
  }

  function dismissUpNext() {
    clearInterval(upNextTimer.current)
    setUpNextCountdown(null)
    upNextDismissed.current = true  // stays dismissed until the next episode loads
  }

  function onWaiting() { setBuffering(true) }
  function onCanPlay() { setBuffering(false) }

  function onLoadedMetadata(e) {
    const v = e.currentTarget
    if (v.duration && isFinite(v.duration)) setDuration(v.duration)
    // Apply resume position now that the video is seekable — but ONLY for a
    // direct, seekable source. A transcode URL already begins at the resume
    // point, so its currentTime starts at 0 and this test looked "unresumed";
    // seeking again pushed it another startTime seconds in. The transcode is a
    // live ffmpeg pipe with no seekable range, so the browser aborted and
    // re-requested — spawning a second ffmpeg and looping forever instead of
    // ever playing. Symptom: two concurrent hevc decoders in the server log
    // plus "Stream ends prematurely".
    if (!srcStartOffsetRef.current && session?.startTime && v.currentTime < session.startTime) {
      v.currentTime = session.startTime
    }
    setAudioWarning('')
  }

  function onDurationChange(e) {
    const v = e.currentTarget
    if (v.duration && isFinite(v.duration)) {
      setDuration(prev => v.duration > prev ? v.duration : prev)
    }
  }

  function onError(e)  {
    const v = e.currentTarget
    const code = v.error?.code
    // Ship the failure to the server log. Inside the Android WebView there are
    // no devtools, so this is the only way to see what actually went wrong
    // rather than inferring it from which requests did/didn't arrive.
    try {
      fetch(`${window.__companionBase}/clientlog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          at: 'video.onError',
          code,
          message: v.error?.message || '',
          src: (v.currentSrc || v.src || '').slice(0, 160),
          crossOrigin: v.crossOrigin,
          transcoding,
          pageProtocol: location.protocol,
          companionBase: String(window.__companionBase),
          build: 'xorigin-fix-1',
        }),
      }).catch(() => {})
    } catch { /* never let diagnostics break playback */ }
    // MediaError codes: 1=aborted, 2=network, 3=decode, 4=not supported
    if (code === 4 || code === 3) {
      // On FireTV the companion is never available — ExoPlayer should handle codecs.
      // If VideoPlayer is running on FireTV at all (bridge fallback), just show the error.
      if (!transcoding && !IS_FIRETV) {
        console.log('[player] Codec error — auto-transcoding via companion')
        fixAudio()
        return
      }
      setError(IS_FIRETV
        ? 'This stream could not be played. Try a different stream.'
        : 'Transcode failed — the stream may be DRM-protected or the companion lost connection mid-stream.'
      )
    } else if (code === 2) {
      setError('Network error — could not load the stream.')
    } else if (code) {
      setError('Could not play this stream.')
    }
  }

  /** Re-load the stream through the companion's ffmpeg transcoder (full fix: audio + video) */
  async function fixAudio() {
    const video = videoRef.current
    if (!video) return
    const src = rawUrlRef.current || session?.url
    if (!src) return

    // Check companion is reachable before attempting transcode
    const online = await pingCompanion()
    if (!online) {
      setError('Companion server is offline. Open the VaultTV companion app on your PC — it re-encodes unsupported codecs (HEVC, AC3, DTS) on the fly.')
      return
    }

    // On Electron, HEVC is supported natively — only transcode audio
    const doTranscodeVideo = !IS_ELECTRON
    const seekTo = Math.floor(video.currentTime || 0)
    const ai = pickAudioTrack(audioTracksRef.current, audioLang)
    const tUrl = transcodeUrl(src, seekTo, doTranscodeVideo, ai)
    srcStartOffsetRef.current = seekTo   // tUrl starts here; see onLoadedMetadata
    setTranscodeKind(doTranscodeVideo ? 'video+audio' : 'audio')
    setTranscoding(true)
    setAudioWarning('')
    setError('')
    setShowNoAudio(false)
    // Only request CORS when the load isn't mixed-content — otherwise Android
    // WebView blocks it before it leaves the app (see the load effect).
    if (location.protocol === 'https:' && tUrl.startsWith('http:')) {
      video.removeAttribute('crossOrigin')
      canUseWebAudioRef.current = false
    } else {
      video.crossOrigin = 'anonymous'
    }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    video.src = tUrl
    video.play().catch(() => {})
  }

  // ── Cast ─────────────────────────────────────────────────────
  // Two independent routes to a TV, because one alone doesn't cover both:
  //
  //  1. Google Cast Web Sender SDK (CastContext) — desktop Chrome/Edge.
  //  2. Remote Playback API (`video.remote`) — the standards-based route that
  //     Chrome for Android actually exposes. The Cast SDK is documented
  //     ambiguously for mobile and in practice `window.chrome.cast` is often
  //     absent there, which is why no button appeared on a phone at all.
  //
  // Route 2 casts whatever the <video> is currently playing, which is exactly
  // what we want: by the time it matters we've already swapped to the
  // transcoded H.264/AAC stream, so the TV gets something it can decode.
  const [remoteAvailable, setRemoteAvailable] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v?.remote?.watchAvailability) return
    let cancelled = false
    let watchId = null
    v.remote.watchAvailability(isAvailable => {
      if (!cancelled) setRemoteAvailable(isAvailable)
    }).then(id => {
      watchId = id
      // Element unmounted/session changed before the promise settled
      if (cancelled && watchId != null) v.remote.cancelWatchAvailability(watchId).catch(() => {})
    }).catch(() => {}) // unsupported or disallowed — Cast SDK path still applies
    return () => {
      cancelled = true
      setRemoteAvailable(false)
      if (watchId != null) v.remote.cancelWatchAvailability(watchId).catch(() => {})
    }
  }, [session?.url])

  // Reset "casting this" state on session change or full disconnect — a stale
  // true here would show the casting overlay for a video that was never sent.
  const castRequested = useRef(false)
  useEffect(() => { setCastingThis(false); castRequested.current = false }, [session?.url])
  useEffect(() => {
    if (cast.connected) { if (castRequested.current) setCastingThis(true) }
    else { setCastingThis(false); castRequested.current = false }
  }, [cast.connected])

  useEffect(() => {
    if (!transcoding) { setShowTranscodeBadge(false); return }
    setShowTranscodeBadge(true)
    const t = setTimeout(() => setShowTranscodeBadge(false), 5000)
    return () => clearTimeout(t)
  }, [transcoding])

  function guessContentType(url) {
    const clean = (url || '').split('?')[0].toLowerCase()
    if (clean.endsWith('.m3u8')) return 'application/x-mpegURL'
    if (clean.endsWith('.mkv'))  return 'video/x-matroska'
    if (clean.endsWith('.webm')) return 'video/webm'
    return 'video/mp4'
  }

  async function handleCast(force = false) {
    // `force` skips the stop-toggle: used when advancing to the next episode,
    // where the session is already casting and we want to replace the media
    // rather than disconnect.
    if (castingThis && !force) { cast.stopCasting(); setCastingThis(false); return }
    const v = videoRef.current

    // No Cast SDK on this platform (typically mobile) — hand off to the
    // Remote Playback API. The browser owns the device picker and keeps the
    // <video> as the controller, so there's no overlay state to track here.
    if (!cast.available && remoteAvailable && v?.remote?.prompt) {
      try { await v.remote.prompt() } catch { /* user dismissed the picker */ }
      return
    }

    // Normally cast the original source and let the TV pull it directly,
    // skipping our transcode pipe. But when we're already transcoding, the
    // original is precisely what the browser couldn't decode (e.g. 10-bit
    // HEVC), and most Cast devices can't either — so send the transcoded
    // H.264/AAC stream we're actually playing instead.
    let castUrl = transcoding
      ? (v?.currentSrc || session?.url)
      : (session?.rawStreamUrl || session?.url)
    if (!castUrl || castUrl.startsWith('blob:')) return

    // Hand the TV the LAN address when there is one. The phone is pinned to the
    // HTTPS tunnel because its WebView refuses http:// media from an https://
    // page, but a Cast receiver is a native device with no such rule — and
    // routing a ~6 Mbps stream out to Cloudflare and back, to a TV sitting on
    // the same switch as the server, is what made casting rebuffer. Only
    // rewrite URLs that point at our own companion; addon streams stay as-is.
    try {
      const companionBase = (window.__companionBase || '').replace(/\/$/, '')
      if (companionBase && castUrl.startsWith(companionBase)) {
        const lan = await getLanBaseUrl()
        if (lan) castUrl = toLanUrl(castUrl, lan)
      }
    } catch { /* fall back to whatever URL we already had */ }

    try {
      await cast.loadMedia({
        url: castUrl, title, poster: session?.poster,
        contentType: guessContentType(castUrl),
      })
      if (v && !v.paused) v.pause()
      // On the native (APK) bridge loadMedia is fire-and-forget: the device
      // picker is still open at this point, so committing to the overlay here
      // would show it over a cast that hasn't happened — and leave it stuck if
      // the user cancels. Let the real connection state drive it instead.
      if (window.vaulttvBridge?.isCastAvailable) castRequested.current = true
      else setCastingThis(true)
    } catch {
      // User cancelled the device picker, or the load failed — stay local.
    }
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
        // Timeline/scrubber mode — L/R held scrubs, anything else exits
        if (isLeft)  { startScrub('left');  return }
        if (isRight) { startScrub('right'); return }
        // Up/Down/Select all exit timeline mode
        commitScrub()
        setTimelineActive(false)
        if (isUp) closeBtnRef.current?.focus()
        return
      }

      // Control bar order — Left/Right navigate through this list
      const ctrlBar = [
        skipBackBtnRef,
        playBtnRef,
        skipFwdBtnRef,
        volumeBtnRef,
        ccBtnRef,
        settingsBtnRef,
        fullscreenBtnRef,
      ]

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
      if (isDown) { setTimelineActive(true); return }
      if (isLeft || isRight) {
        const cur = document.activeElement
        const refs = ctrlBar.map(r => r.current).filter(Boolean)
        const idx = refs.indexOf(cur)
        if (idx === -1) {
          // Nothing from the bar is focused — jump to skipBack or fullscreen
          const target = isLeft ? refs[0] : refs[refs.length - 1]
          target?.focus()
        } else {
          const next = isLeft ? refs[idx - 1] : refs[idx + 1]
          next?.focus()
        }
        return
      }
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
    function onFireTVKeyUp(e) {
      const k = e.keyCode
      const isLeft  = k === 37 || k === 225
      const isRight = k === 39 || k === 228
      if ((isLeft || isRight) && timelineActiveRef.current) {
        e.preventDefault()
        e.stopImmediatePropagation()
        commitScrub()
      }
    }

    window.addEventListener('keydown', onFireTVKey,   { capture: true })
    window.addEventListener('keyup',   onFireTVKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onFireTVKey,   { capture: true })
      window.removeEventListener('keyup',   onFireTVKeyUp, { capture: true })
      commitScrub()
    }
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
  const displayTime = seekPreview !== null ? seekPreview : currentTime
  const playedPct   = duration > 0 ? (displayTime / duration) * 100 : 0

  const VolumeIcon = muted || volume === 0 ? FiVolumeX : volume < 0.5 ? FiVolume1 : FiVolume2

  return (
    <div
      ref={containerRef}
      data-videoplayer
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
        onDurationChange={onDurationChange}
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

      {/* ── Casting overlay — local video is paused while this session's
          media is loaded on the Chromecast; show remote state instead ── */}
      {castingThis && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'linear-gradient(180deg, #0a0a0f 0%, #150826 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem',
          }}
        >
          <MdCastConnected size={64} style={{ color: 'var(--accent)' }} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Casting to {cast.deviceName || 'TV'}</p>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)' }}>{title}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => (cast.remotePlaying ? cast.pause() : cast.play())}
              title={cast.remotePlaying ? 'Pause' : 'Play'}
              style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {cast.remotePlaying ? <FiPause size={22} /> : <FiPlay size={22} style={{ marginLeft: 2 }} />}
            </button>
            <button
              onClick={() => { cast.stopCasting(); setCastingThis(false) }}
              title="Stop casting"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: 600 }}
            >
              Stop Casting
            </button>
          </div>
          {cast.remoteDuration > 0 && (
            <div style={{ width: 'min(400px, 80vw)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{fmt(cast.remoteTime)}</span>
              <div
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  cast.seek(((e.clientX - rect.left) / rect.width) * cast.remoteDuration)
                }}
                style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
              >
                <div style={{ position: 'absolute', inset: 0, width: `${(cast.remoteTime / cast.remoteDuration) * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{fmt(cast.remoteDuration)}</span>
            </div>
          )}
          <button
            onClick={closePlayer}
            title="Close"
            style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <FiX size={18} />
          </button>
        </div>
      )}

      {/* ── Transcoding indicator — flashes briefly, see showTranscodeBadge ── */}
      {showTranscodeBadge && (
        <div style={{ position: 'absolute', top: '1rem', right: '4rem', zIndex: 10, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 6, padding: '0.3rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <span style={{ color: '#4ade80', fontSize: '0.72rem', fontWeight: 600 }}>
            {transcodeKind === 'video+audio' ? 'Transcoding video + audio' : 'Transcoding audio'}
          </span>
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

      {/* ── Up Next countdown overlay ──────────────────────────── */}
      {upNextCountdown !== null && (
        <div style={{
          position: 'absolute', bottom: '5rem', right: '2rem',
          background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10, padding: '0.75rem 1.1rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
          zIndex: 9999, animation: 'fadeInDown 0.25s ease',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Up Next</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>Next Episode</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
              {/* Casting doesn't auto-advance, so promising a countdown to
                  playback would be a lie — say what's actually left. */}
              {castingThis ? `${upNextCountdown}s left` : `Starts in ${upNextCountdown}s`}
            </p>
          </div>
          {/* While casting nothing advances on its own — the receiver reports no
              "finished" event — so the prompt has to be actionable, not just
              a countdown the user can cancel. */}
          {castingThis && (
            <button
              onClick={playNextNow}
              style={{
                padding: '0.4rem 0.9rem', borderRadius: 6, border: 'none',
                background: '#fff', color: '#000', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
              }}
            >
              Play now
            </button>
          )}
          <button
            onClick={dismissUpNext}
            style={{
              padding: '0.4rem 0.9rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
              background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── FireTV scrub overlay — shown while holding L/R in timeline mode ── */}
      {seekPreview !== null && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.88)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 14, padding: '1.1rem 2.2rem',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
          pointerEvents: 'none', zIndex: 10000,
        }}>
          <span style={{ fontSize: '2.8rem', fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {fmt(seekPreview)}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums' }}>
            / {fmt(duration)}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', marginTop: 2 }}>
            {seekPreview > currentTime
              ? `+${fmt(seekPreview - currentTime)}`
              : `-${fmt(currentTime - seekPreview)}`}
          </span>
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
      {showNoAudio && !transcoding && !audioWarning && !IS_FIRETV && (
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
      {audioWarning && !transcoding && !IS_FIRETV && (
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
              <CtrlBtn ref={volumeBtnRef} onClick={toggleMute} title="Mute (M)">
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
              ref={ccBtnRef}
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

            {/* Cast — hidden entirely when no receivers on the network, or
                when the current source is a browser-local blob: URL (a
                Chromecast can't fetch that itself, it needs a real network URL) */}
            {(cast.available || remoteAvailable) && !(session?.rawStreamUrl || session?.url || '').startsWith('blob:') && (
              <CtrlBtn onClick={handleCast} title={castingThis ? `Casting to ${cast.deviceName || 'device'} — click to stop` : 'Cast to TV'} active={castingThis}>
                {castingThis ? <MdCastConnected size={18} /> : <MdCast size={18} />}
              </CtrlBtn>
            )}

            {/* Settings */}
            <CtrlBtn ref={settingsBtnRef} onClick={() => { setSettingsOpen(o => !o); setAudioMenuOpen(false) }} title="Settings" active={settingsOpen}>
              <FiSettings size={18} />
            </CtrlBtn>

            {/* Fullscreen */}
            <CtrlBtn ref={fullscreenBtnRef} onClick={toggleFullscreen} title="Fullscreen (F)">
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
                            // Map the advertised language onto a real stream
                            // index; without probed tracks fall back to the
                            // first, which still plays.
                            const ai = pickAudioTrack(audioTracksRef.current, lang.toLowerCase())
                            const url = transcodeUrl(session.rawStreamUrl, 0, !!session.transcodeVideo, ai)
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
