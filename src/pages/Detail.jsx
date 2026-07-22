import { useState, useEffect, useRef, Component } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getDetail, getSeason, getSimilar, getVideos, IMG, getCertification, YT_EMBED, pickTrailer, pickTheme } from '../lib/tmdb'
import { useAddons } from '../context/AddonsContext'
import { useLibrary } from '../context/LibraryContext'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { usePlayer } from '../context/PlayerContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { useArtwork } from '../context/ArtworkContext'
import { useMetadata } from '../context/MetadataContext'
import ArtworkPicker from '../components/ArtworkPicker'
import { useLanguage } from '../context/LanguageContext'
import { useTrakt } from '../context/TraktContext'
import MediaShelf from '../components/MediaShelf'
import { FiPlay, FiStar, FiClock, FiCalendar, FiChevronDown, FiVolume2, FiVolumeX, FiMusic, FiX, FiBookmark, FiHardDrive, FiLayers, FiImage, FiCheck } from 'react-icons/fi'
import { sortAndFilterStreams, streamCompat, compatBadge, parseStreamLanguages, parseStreamMeta, parseStreamCodecs, LANG_LABELS } from '../lib/streamCompat'
import { platformLabel, IS_ANDROID } from '../lib/platform'
import { transcodeUrl } from '../lib/companion'

export default function Detail() {
  const { type, id } = useParams()
  const { getStreams, getSubtitles } = useAddons()
  const { isSaved, toggle: toggleSave } = useLibrary()
  const { startWatching, updateProgress, saveLastStream, history: watchHistory, markEpisodeWatched, isEpisodeWatched } = useWatchHistory()
  const { syncWatched: traktSyncWatched } = useTrakt()
  // Track whether we've already synced the current item as watched this session
  const watchSyncedRef = { current: false }

  /** Return saved resume position (seconds) if between 3% and 92%, else 0 */
  function getSavedProgress(itemId, itemType) {
    const entry = watchHistory.find(h => h.id === Number(itemId) && h.type === itemType)
    if (!entry || !entry.progressSec) return 0
    if (entry.durationSec > 0) {
      // Duration known — use percentage window to skip trivial starts/ends
      const pct = entry.progress ?? (entry.progressSec / entry.durationSec)
      if (pct < 0.03 || pct > 0.92) return 0
    } else {
      // Duration unknown (e.g. HLS stream via native ExoPlayer) — skip only if < 30s
      if (entry.progressSec < 30) return 0
    }
    return entry.progressSec
  }

  /** Shared progress handler — fires Trakt watch sync at 90% completion */
  function makeProgressHandler(itemId, itemType, season, episode) {
    return (t, d) => {
      updateProgress(Number(itemId), itemType, t, d, title, IMG(detail?.poster_path, 'w780'))
      if (!watchSyncedRef.current && d > 0 && t / d >= 0.9) {
        watchSyncedRef.current = true
        traktSyncWatched(itemType, Number(itemId))
        if (itemType === 'tv' && season != null && episode != null) {
          markEpisodeWatched(Number(itemId), season, episode)
        }
      }
    }
  }
  const { play, closePlayer } = usePlayer()
  const { getLocalFile, getLocalVersions, getFileUrl } = useLocalLibrary()
  const { getPoster, getBackdrop } = useArtwork()
  const { getMetadata } = useMetadata()
  const { audioLang } = useLanguage()
  const episodesRef = useRef(null)
  const [artPicker, setArtPicker]     = useState(null) // null | 'poster' | 'backdrop'
  const [posterHovered, setPosterHovered] = useState(false)
  const [streams, setStreams]         = useState(null)
  const [loadingStreams, setLoadingStreams] = useState(false)
  const [autoSubs, setAutoSubs]       = useState([])
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [streamEp, setStreamEp]       = useState(null) // { season, episode } currently expanded
  const [musicPlaying, setMusicPlaying] = useState(true)
  const [musicDismissed, setMusicDismissed] = useState(false)
  const [loadingNextEp, setLoadingNextEp] = useState(false)

  const { data: detail, isLoading } = useQuery({
    queryKey: ['detail', type, id],
    queryFn: () => getDetail(type, id),
  })

  const { data: videos } = useQuery({
    queryKey: ['videos', type, id],
    queryFn: () => getVideos(type, id),
    enabled: !!id,
  })

  const { data: season } = useQuery({
    queryKey: ['season', id, selectedSeason],
    queryFn: () => getSeason(id, selectedSeason),
    enabled: type === 'tv',
  })

  const { data: similar } = useQuery({
    queryKey: ['similar', type, id],
    queryFn: () => getSimilar(type, id),
  })

  // imdbId must be declared before any useEffect that references it
  // Metadata override lets users correct the IMDB ID when addons mismatch
  const _metaOverride = getMetadata(id, type)
  const imdbId = _metaOverride?.imdb_id || detail?.external_ids?.imdb_id || `tmdb:${id}`

  // Reset music state on navigation; pre-fetch subtitles for local playback
  useEffect(() => {
    setMusicPlaying(true)
    setMusicDismissed(false)
    setStreams(null)
    setAutoSubs([])
    // Pre-fetch subtitles so local-file play button can auto-load them
    if (imdbId) {
      getSubtitles(type, imdbId, null, null).then(setAutoSubs).catch(() => {})
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── FireTV D-pad navigation for Detail page ────────────────────────────
  // Must be declared before any early returns (Rules of Hooks).
  // Intercepts on window capture — fires before the APK's document capture
  // spatial nav, giving us full control of Up/Down on this page.
  useEffect(() => {
    if (!IS_FIRETV) return
    const SEL = 'button:not([disabled]), [tabindex="0"], [data-card], [data-ep-btn], a[href]'
    const DPAD = new Set([37, 38, 39, 40, 225, 226, 227, 228, 13, 23])

    function focusableEls() {
      const sidebar  = document.querySelector('.sidebar-root')
      const trigger  = document.querySelector('[data-sidebar-trigger]')
      return Array.from(document.querySelectorAll(SEL)).filter(el => {
        if (el === trigger) return false               // never focus the collapsed sidebar strip
        if (sidebar && sidebar.contains(el)) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
    }

    // FireTV WebView defers focus() — document.activeElement lags by one frame.
    // Track the last element we intentionally focused so rapid key presses don't
    // see document.body as cur and jump to the wrong element.
    let lastFocused = null

    function doFocus(el) {
      document.querySelectorAll('.snav-focused').forEach(e => e.classList.remove('snav-focused'))
      el.focus({ preventScroll: false })
      el.classList.add('snav-focused')
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      lastFocused = el
    }

    function nearest(els, cur, dir) {
      const curR = cur.getBoundingClientRect()
      let candidates
      if (dir === 'down') {
        candidates = els
          .filter(el => el !== cur && el.getBoundingClientRect().top > curR.bottom - 5)
          .sort((a, b) => { const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect(); return ar.top !== br.top ? ar.top - br.top : ar.left - br.left })
      } else if (dir === 'up') {
        candidates = els
          .filter(el => el !== cur && el.getBoundingClientRect().bottom < curR.top + 5)
          .sort((a, b) => { const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect(); return br.bottom - ar.bottom })
      } else if (dir === 'right') {
        candidates = els
          .filter(el => el !== cur && el.getBoundingClientRect().left > curR.right - 5)
          .sort((a, b) => { const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect(); return ar.left !== br.left ? ar.left - br.left : ar.top - br.top })
      } else {
        candidates = els
          .filter(el => el !== cur && el.getBoundingClientRect().right < curR.left + 5)
          .sort((a, b) => { const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect(); return br.right - ar.right })
      }
      return candidates[0] || null
    }

    function onKey(e) {
      if (!DPAD.has(e.keyCode)) return
      if (document.querySelector('[data-videoplayer]')) return

      e.preventDefault()
      e.stopImmediatePropagation()

      const k = e.keyCode
      const isDown   = k === 40 || k === 227
      const isUp     = k === 38 || k === 226
      const isLeft   = k === 37 || k === 225
      const isRight  = k === 39 || k === 228
      const isSelect = k === 13 || k === 23

      const els = focusableEls()
      const sidebar = document.querySelector('.sidebar-root')
      const active = document.activeElement
      // Fall back to lastFocused when WebView hasn't committed focus yet (shows body briefly)
      const cur = (active === document.body || active === document.documentElement)
        && lastFocused
        && lastFocused.isConnected
        && lastFocused.getBoundingClientRect().width > 0
        ? lastFocused
        : active
      const curIsOut = !cur || cur === document.body || cur === document.documentElement || (sidebar && sidebar.contains(cur))

      // Select / Enter — click whatever is focused
      if (isSelect) {
        if (cur && cur !== document.body) cur.click()
        return
      }

      // If nothing in main content is focused, land on first element
      if (curIsOut || !els.length) {
        if (els.length) doFocus(els[0])
        return
      }

      // Stream row: Left/Right navigates between sibling stream cards
      if ((isLeft || isRight) && cur.closest('[data-stream-row]')) {
        const cards = Array.from(cur.closest('[data-stream-row]').querySelectorAll('[data-card]'))
        const idx = cards.indexOf(cur)
        const next = cards[idx + (isRight ? 1 : -1)]
        if (next) doFocus(next)
        return
      }

      // Episode row: Right moves into action buttons; Left moves back to row body
      if ((isLeft || isRight) && cur.closest('[data-ep-row]')) {
        const row = cur.closest('[data-ep-row]')
        const btns = Array.from(row.querySelectorAll('[data-ep-btn]'))
        const rowBody = row.querySelector('[data-card]')
        const isOnBtn = btns.includes(cur)
        if (isRight) {
          if (!isOnBtn && btns.length) { doFocus(btns[0]); return }
          const next = btns[btns.indexOf(cur) + 1]
          if (next) { doFocus(next); return }
        }
        if (isLeft) {
          if (!isOnBtn) return // already on row body, let general nav handle
          const prev = btns[btns.indexOf(cur) - 1]
          if (prev) { doFocus(prev); return }
          if (rowBody) { doFocus(rowBody); return }
        }
        return
      }

      // Season buttons: Left/Right cycles seasons, Down jumps to episodes
      if (cur.dataset.seasonBtn !== undefined) {
        if (isLeft || isRight) {
          const btns = Array.from(document.querySelectorAll('[data-season-btn]'))
          const next = btns[btns.indexOf(cur) + (isRight ? 1 : -1)]
          if (next) doFocus(next)
        } else if (isDown) {
          const ep = document.querySelector('[data-card]')
          if (ep) doFocus(ep)
        } else {
          const t = nearest(els, cur, 'up')
          if (t) doFocus(t)
        }
        return
      }

      const dir = isDown ? 'down' : isUp ? 'up' : isRight ? 'right' : 'left'
      const target = nearest(els, cur, dir)
      if (target) doFocus(target)
    }

    window.addEventListener('keydown', onKey, { capture: true })

    // Override APK's 1s focus-to-sidebar by focusing first main content el at 1.3s
    const initTimer = setTimeout(() => {
      const els = focusableEls()
      if (els.length) doFocus(els[0])
    }, 1300)

    // Clear lastFocused when the element is removed from DOM (e.g. season change re-render)
    const focusOut = () => {
      if (lastFocused && !lastFocused.isConnected) lastFocused = null
    }
    document.addEventListener('focusout', focusOut)

    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      document.removeEventListener('focusout', focusOut)
      clearTimeout(initTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <LoadingState />

  const title         = detail?.title || detail?.name
  const tmdbBackdrop  = IMG(detail?.backdrop_path, 'original')
  const tmdbPoster    = IMG(detail?.poster_path, 'w500')
  const backdrop      = getBackdrop(Number(id), type) || tmdbBackdrop
  const poster        = getPoster(Number(id), type)   || tmdbPoster
  const certification = getCertification(detail, type)

  const allVideos   = videos?.results || detail?.videos?.results || []
  const trailerKey  = pickTrailer(allVideos)
  const themeKey    = pickTheme(allVideos)

  // No background video — always use static backdrop to save bandwidth
  const bgVideoUrl = null

  // TV shows: only play audio if a dedicated theme/score was found — never fall back
  // to the trailer (that would play the preview, not a theme song).
  // Movies: no theme audio (trailer already plays as muted background video).
  const audioKey = type === 'tv' ? themeKey : null
  const themeAudioUrl = audioKey
    ? `${YT_EMBED}/${audioKey}?autoplay=1&loop=1&playlist=${audioKey}&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&rel=0`
    : null

  async function handleWatch(season, episode) {
    // Toggle: clicking same episode/movie closes the stream tray
    // Must check streamEp !== null first — null?.season === undefined === season(undefined) for movies
    if (streamEp !== null && streamEp?.season === season && streamEp?.episode === episode) {
      setStreamEp(null); setStreams(null); return
    }
    setStreamEp({ season, episode })
    setLoadingStreams(true)
    setStreams(null)
    try {
      const [streamResults, subResults] = await Promise.all([
        getStreams(type, imdbId, season, episode),
        getSubtitles(type, imdbId, season, episode).catch(() => []),
      ])
      setStreams(streamResults.map(s => ({ ...s, _subtitles: subResults })))
    } finally {
      setLoadingStreams(false)
    }
  }

  /**
   * Returns a callback for PlayerContext to fire when an episode finishes.
   * preferLocal=true means the current episode was playing from a local file —
   * try local first for the next episode before falling back to addon streams.
   */
  function makeNextEpisodeHandler(currentSeason, currentEpisode, preferAddonName, preferLocal = false) {
    return async function onEpisodeEnded() {
      setLoadingNextEp(true)
      try {
        const seasonData = await getSeason(id, currentSeason)
        const episodes   = seasonData?.episodes || []
        const currentIdx = episodes.findIndex(e => e.episode_number === currentEpisode)
        let nextSeason  = currentSeason
        let nextEp      = null

        if (currentIdx !== -1 && currentIdx + 1 < episodes.length) {
          nextEp = episodes[currentIdx + 1]
        } else if (detail?.number_of_seasons && currentSeason < detail.number_of_seasons) {
          nextSeason = currentSeason + 1
          const nextSeasonData = await getSeason(id, nextSeason)
          nextEp = nextSeasonData?.episodes?.[0] || null
        }

        if (!nextEp) {
          setLoadingNextEp(false)
          closePlayer()
          return
        }

        const epTitle = `${title} · S${String(nextSeason).padStart(2,'0')}E${String(nextEp.episode_number).padStart(2,'0')} · ${nextEp.name}`
        const poster  = IMG(detail?.poster_path, 'w780')

        // ── Try local file first if previous episode was local ──────────────
        if (preferLocal) {
          const localVersions = getLocalVersions(Number(id), 'tv', nextSeason, nextEp.episode_number)
          if (localVersions.length > 0) {
            try {
              const url = await getFileUrl(localVersions[0].filename)
              setLoadingNextEp(false)
              play({
                url,
                title:          epTitle,
                poster,
                subtitleTracks: autoSubs,
                imdbId,
                mediaType:      'tv',
                season:         nextSeason,
                episode:        nextEp.episode_number,
                onProgress:     makeProgressHandler(id, 'tv', nextSeason, nextEp.episode_number),
                onEpisodeEnded: makeNextEpisodeHandler(nextSeason, nextEp.episode_number, null, true),
                onPlaybackEnded: () => { closePlayer() },
              })
              startWatching({ id: Number(id), type: 'tv', title, poster })
              return
            } catch {
              // local file unavailable — fall through to streams
            }
          }
        }

        // ── Addon streams ───────────────────────────────────────────────────
        const [streamResults, subResults] = await Promise.all([
          getStreams(type, imdbId, nextSeason, nextEp.episode_number, { preferAddonName }),
          getSubtitles(type, imdbId, nextSeason, nextEp.episode_number).catch(() => []),
        ])

        const sorted = sortAndFilterStreams(streamResults.map(s => ({ ...s, _subtitles: subResults })), {
          sortBy: 'quality', filterLang: audioLang, compatOnly: false, preferredLang: audioLang,
        })
        if (!sorted.length) {
          setLoadingNextEp(false)
          closePlayer()
          return
        }

        const stream = sorted[0]
        const langs  = parseStreamLanguages(stream)
        const { videoCodec } = parseStreamCodecs(stream)
        const needsVideoTranscode = videoCodec && !['h264','avc','x264'].includes(videoCodec.toLowerCase())

        setLoadingNextEp(false)
        play({
          url:            stream.url,
          title:          epTitle,
          poster,
          subtitleTracks: stream._subtitles || [],
          imdbId,
          mediaType:      'tv',
          season:         nextSeason,
          episode:        nextEp.episode_number,
          streamLangs:    langs,
          rawStreamUrl:   stream.url,
          transcodeVideo: !!needsVideoTranscode,
          onProgress:     makeProgressHandler(id, 'tv', nextSeason, nextEp.episode_number),
          onEpisodeEnded: makeNextEpisodeHandler(nextSeason, nextEp.episode_number, stream.addonName, false),
          onPlaybackEnded: () => { closePlayer() },
        })
        startWatching({ id: Number(id), type: 'tv', title, poster })
        saveLastStream(Number(id), 'tv', {
          url: stream.url, streamLangs: langs, rawStreamUrl: stream.url,
          transcodeVideo: !!needsVideoTranscode, subtitleTracks: stream._subtitles || [],
          imdbId, season: nextSeason, episode: nextEp.episode_number,
        })
      } catch (e) {
        console.warn('[auto-next] Failed, closing player:', e.message)
        setLoadingNextEp(false)
        closePlayer()
      }
    }
  }

  /* ArtworkPicker needs the full detail object so item can have a title */
  const artItem = detail ? { id: Number(id), title, poster_path: detail.poster_path, backdrop_path: detail.backdrop_path } : null

  return (
    <>
    {/* Loading overlay — shown on FireTV while next episode streams are being fetched */}
    {loadingNextEp && IS_FIRETV && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1rem',
      }}>
        <div style={{ width: 48, height: 48, border: '4px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '1rem', fontWeight: 500 }}>Loading next episode…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )}
    {artPicker && artItem && (
      <ArtworkPicker
        item={artItem}
        type={type}
        slot={artPicker}
        onClose={() => setArtPicker(null)}
      />
    )}
    <div style={{ position: 'relative', minHeight: IS_FIRETV ? '50vh' : '100vh', overflow: 'hidden' }}>

      {/* ── Background — trailer video OR static backdrop image ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {bgVideoUrl ? (
          <iframe
            src={bgVideoUrl}
            title="background"
            allow="autoplay; encrypted-media"
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '177.78vh', minWidth: '100%',
              height: '56.25vw', minHeight: '100%',
              border: 'none', opacity: 0.45,
              filter: 'blur(2px) brightness(0.6)',
            }}
          />
        ) : backdrop ? (
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${backdrop})`,
              backgroundSize: 'cover', backgroundPosition: 'center top',
              opacity: 0.35, filter: 'blur(1px) brightness(0.5)',
            }}
          />
        ) : null}
        {/* Gradient darkens bottom so text is always readable */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, var(--bg-primary) 78%)',
        }} />
      </div>

      {/* ── Change Banner button — top-right of viewport (hidden on FireTV) ── */}
      {!IS_FIRETV && <button
        onClick={() => setArtPicker('backdrop')}
        title="Change backdrop / banner"
        style={{
          position: 'fixed', top: '4.5rem', right: '1rem', zIndex: 50,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          color: 'rgba(255,255,255,0.65)', cursor: 'pointer',
          padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem',
          fontSize: '0.75rem', fontWeight: 600, transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.8)'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.55)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
      >
        <FiImage size={13} /> Change Banner
      </button>}

      {/* ── Hidden theme audio iframe ── */}
      {themeAudioUrl && !musicDismissed && musicPlaying && (
        <iframe
          key={audioKey}
          src={themeAudioUrl}
          title="theme audio"
          allow="autoplay; encrypted-media"
          style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 'none', bottom: 0, left: 0, zIndex: -1 }}
        />
      )}

      {/* ── Music floating pill ── */}
      {themeAudioUrl && !musicDismissed && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 200,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          border: '1px solid var(--border)', borderRadius: 40,
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.5rem 0.9rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}>
          {/* Animated note icon */}
          <FiMusic size={14} style={{ color: 'var(--accent)', flexShrink: 0, animation: musicPlaying ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Theme
          </span>
          <button
            onClick={() => setMusicPlaying(p => !p)}
            title={musicPlaying ? 'Pause theme' : 'Play theme'}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.1rem', display: 'flex' }}
          >
            {musicPlaying ? <FiVolume2 size={15} /> : <FiVolumeX size={15} />}
          </button>
          <button
            onClick={() => setMusicDismissed(true)}
            title="Dismiss"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.1rem', display: 'flex' }}
          >
            <FiX size={14} />
          </button>
        </div>
      )}

      {/* ── Main content (above video) ── */}
      <div style={{ position: 'relative', zIndex: 10 }}>

        {/* Poster + info hero */}
        <div style={{ minHeight: IS_FIRETV ? 200 : 380, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: IS_FIRETV ? '2rem 2rem 1.5rem' : '5rem 2rem 2rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>

            {/* Poster — hover to reveal "Change Poster" button */}
            {poster && (
              <div
                style={{ position: 'relative', width: 180, flexShrink: 0, alignSelf: 'flex-start', marginTop: '1rem' }}
                onMouseEnter={() => setPosterHovered(true)}
                onMouseLeave={() => setPosterHovered(false)}
              >
                <img
                  src={poster}
                  alt={title}
                  style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block', boxShadow: '0 8px 40px rgba(0,0,0,0.9)' }}
                />
                {posterHovered && (
                  <button
                    onClick={() => setArtPicker('poster')}
                    style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
                      border: 'none', color: '#fff', cursor: 'pointer',
                      padding: '0.55rem 0', borderRadius: '0 0 var(--radius) var(--radius)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                      fontSize: '0.78rem', fontWeight: 600,
                    }}
                  >
                    <FiImage size={13} /> Change Poster
                  </button>
                )}
              </div>
            )}

            {/* Info */}
            <div style={{ flex: 1, minWidth: 260 }}>
              <h1 style={{ margin: '0 0 0.5rem', fontSize: 'clamp(1.6rem, 4vw, 2.5rem)', fontWeight: 800, textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>{title}</h1>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.9rem' }}>
                {detail?.vote_average && (
                  <Pill><FiStar size={11} style={{ color: '#fbbf24' }} /> {detail.vote_average.toFixed(1)}</Pill>
                )}
                {(detail?.release_date || detail?.first_air_date) && (
                  <Pill><FiCalendar size={11} /> {(detail.release_date || detail.first_air_date).slice(0,4)}</Pill>
                )}
                {detail?.runtime && <Pill><FiClock size={11} /> {detail.runtime}m</Pill>}
                {certification && <Pill>{certification}</Pill>}
                {type === 'tv' && detail?.number_of_seasons && (
                  <Pill>{detail.number_of_seasons} Season{detail.number_of_seasons > 1 ? 's' : ''}</Pill>
                )}
              </div>

              <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, marginBottom: '1.5rem', maxWidth: 600, fontSize: '0.92rem', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                {detail?.overview}
              </p>

              {/* Watch / Find Streams */}
              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>

                {/* Play local file — split button with version picker */}
                {detail && (() => {
                  const versions = getLocalVersions(Number(id), type)
                  if (!versions.length) return null
                  return (
                    <LocalPlayButton
                      versions={versions}
                      getFileUrl={getFileUrl}
                      play={play}
                      title={title}
                      detail={detail}
                      tmdbId={Number(id)}
                      imdbId={imdbId}
                      mediaType={type}
                      subtitleTracks={autoSubs}
                      setMusicDismissed={setMusicDismissed}
                      getSavedProgress={getSavedProgress}
                      onProgress={makeProgressHandler(id, type)}
                      onStartWatching={() => startWatching({ id: Number(id), type, title, poster: IMG(detail?.poster_path, 'w780') })}
                    />
                  )
                })()}

                {type === 'movie' && (
                  <button
                    className="btn-accent"
                    autoFocus
                    onClick={() => handleWatch()}
                    style={{ fontSize: '0.9rem', padding: '0.65rem 1.6rem' }}
                  >
                    <FiPlay size={15} /> Find Streams
                  </button>
                )}
                {trailerKey && (
                  <a
                    href={`https://www.youtube.com/watch?v=${trailerKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost"
                    style={{ fontSize: '0.9rem' }}
                  >
                    Watch Trailer
                  </a>
                )}
                {/* Save to library */}
                {detail && (
                  <button
                    onClick={() => toggleSave({ id: Number(id), type, title: detail.title || detail.name, poster_path: detail.poster_path || null })}
                    title={isSaved(Number(id), type) ? `Remove from My ${type === 'tv' ? 'Shows' : 'Movies'}` : `Add to My ${type === 'tv' ? 'Shows' : 'Movies'}`}
                    style={{
                      background: isSaved(Number(id), type) ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius)',
                      color: '#fff', cursor: 'pointer', padding: '0.6rem 0.9rem',
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      fontSize: '0.88rem', transition: 'background 0.15s',
                    }}
                  >
                    <FiBookmark size={15} fill={isSaved(Number(id), type) ? '#fff' : 'none'} />
                    {isSaved(Number(id), type) ? 'In My ' + (type === 'tv' ? 'Shows' : 'Movies') : '+ My ' + (type === 'tv' ? 'Shows' : 'Movies')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── TV Episodes ── */}
        {type === 'tv' && detail?.number_of_seasons && (
          <div ref={episodesRef} style={{ padding: '0 2rem 2rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Episodes</h2>
              {IS_FIRETV ? (
                /* FireTV: individual focusable season buttons */
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {Array.from({ length: detail.number_of_seasons }, (_, i) => (
                    <button
                      key={i+1}
                      data-season-btn
                      onClick={() => { setSelectedSeason(i+1); setStreamEp(null); setStreams(null) }}
                      style={{
                        background: selectedSeason === i+1 ? 'var(--accent)' : 'var(--bg-card)',
                        border: `1px solid ${selectedSeason === i+1 ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)', color: '#fff',
                        padding: '0.4rem 0.75rem', cursor: 'pointer',
                        fontSize: '0.85rem', fontWeight: selectedSeason === i+1 ? 700 : 400,
                      }}
                    >
                      S{i+1}
                    </button>
                  ))}
                </div>
              ) : (
                /* Desktop/web: native select */
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedSeason}
                    onChange={e => { setSelectedSeason(Number(e.target.value)); setStreamEp(null); setStreams(null) }}
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.4rem 2rem 0.4rem 0.75rem', cursor: 'pointer', appearance: 'none', fontSize: '0.88rem' }}
                  >
                    {Array.from({ length: detail.number_of_seasons }, (_, i) => (
                      <option key={i+1} value={i+1}>Season {i+1}</option>
                    ))}
                  </select>
                  <FiChevronDown style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {season?.episodes?.map(ep => {
                const epVersions = getLocalVersions(Number(id), 'tv', selectedSeason, ep.episode_number)
                const hasLocal = epVersions.length > 0
                const isExpanded = streamEp?.season === selectedSeason && streamEp?.episode === ep.episode_number
                const epWatched = isEpisodeWatched(Number(id), selectedSeason, ep.episode_number)
                return (
                  <div key={ep.episode_number}>
                    <EpisodeRow
                      ep={ep}
                      season={selectedSeason}
                      localVersions={epVersions}
                      hasLocal={hasLocal}
                      active={isExpanded}
                      watched={epWatched}
                      onWatch={() => handleWatch(selectedSeason, ep.episode_number)}
                      onPlayLocal={async (file) => {
                        try {
                          const url = await getFileUrl(file.filename)
                          setMusicDismissed(true)
                          play({
                            url,
                            title: `${title} · S${String(selectedSeason).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')} · ${ep.name}`,
                            poster: IMG(detail?.poster_path, 'w780'),
                            subtitleTracks: autoSubs,
                            imdbId,
                            mediaType: 'tv',
                            season: selectedSeason,
                            episode: ep.episode_number,
                            onProgress: makeProgressHandler(id, 'tv', selectedSeason, ep.episode_number),
                            startTime: getSavedProgress(id, 'tv'),
                            onEpisodeEnded: makeNextEpisodeHandler(selectedSeason, ep.episode_number, null, true),
                            onPlaybackEnded: () => { closePlayer() },
                          })
                          startWatching({ id: Number(id), type: 'tv', title, poster: IMG(detail?.poster_path, 'w780') })
                        } catch (e) {
                          // Local file unavailable — fall back to stream list
                          handleWatch(selectedSeason, ep.episode_number)
                        }
                      }}
                    />
                    {/* ── Inline stream tray — opens below the clicked episode ── */}
                    {isExpanded && (
                      <StreamErrorBoundary>
                      <InlineStreamTray
                        loading={loadingStreams}
                        streams={streams}
                        preferredLang={audioLang}
                        onSelect={(url, stream) => {
                          setMusicDismissed(true)
                          const epTitle = `${title} · S${String(selectedSeason).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')} · ${ep.name}`
                          const langs = stream ? parseStreamLanguages(stream) : []
                          const { videoCodec } = stream ? parseStreamCodecs(stream) : {}
                          const needsVideoTranscode = videoCodec && !['h264','avc','x264'].includes(videoCodec.toLowerCase())
                          play({
                            url,
                            title: epTitle,
                            year: (detail?.release_date || detail?.first_air_date)?.slice(0, 4),
                            poster: IMG(detail?.poster_path, 'w780'),
                            subtitleTracks: stream?._subtitles || [],
                            imdbId,
                            mediaType: 'tv',
                            season: selectedSeason,
                            episode: ep.episode_number,
                            onProgress: makeProgressHandler(id, 'tv', selectedSeason, ep.episode_number),
                            streamLangs: langs,
                            rawStreamUrl: stream?.url || null,
                            transcodeVideo: !!needsVideoTranscode,
                            startTime: getSavedProgress(id, 'tv'),
                            onEpisodeEnded: makeNextEpisodeHandler(selectedSeason, ep.episode_number, stream?.addonName),
                            onPlaybackEnded: () => { closePlayer() },
                          })
                          startWatching({ id: Number(id), type: 'tv', title, poster: IMG(detail?.poster_path, 'w780') })
                          saveLastStream(Number(id), 'tv', { url, streamLangs: langs, rawStreamUrl: stream?.url || null, transcodeVideo: !!needsVideoTranscode, subtitleTracks: stream?._subtitles || [], imdbId, season: selectedSeason, episode: ep.episode_number })
                        }}
                      />
                      </StreamErrorBoundary>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Movie streams panel (unchanged — shows below poster/info) ── */}
        {type === 'movie' && (loadingStreams || streams !== null) && (
          <div style={{ padding: '0 2rem 2rem' }}>
            <StreamErrorBoundary>
            <StreamPanel
              loading={loadingStreams}
              streams={streams}
              preferredLang={audioLang}
              onSelect={(url, stream) => {
                setMusicDismissed(true)
                const langs = stream ? parseStreamLanguages(stream) : []
                const { videoCodec } = stream ? parseStreamCodecs(stream) : {}
                const needsVideoTranscode = videoCodec && !['h264','avc','x264'].includes(videoCodec.toLowerCase())
                play({
                  url,
                  title,
                  year: (detail?.release_date || detail?.first_air_date)?.slice(0, 4),
                  poster: IMG(detail?.poster_path, 'w780'),
                  subtitleTracks: stream?._subtitles || [],
                  imdbId,
                  mediaType: type,
                  onProgress: makeProgressHandler(id, type),
                  streamLangs: langs,
                  rawStreamUrl: stream?.url || null,
                  transcodeVideo: !!needsVideoTranscode,
                  startTime: getSavedProgress(id, type),
                })
                startWatching({ id: Number(id), type, title, poster: IMG(detail?.poster_path, 'w780') })
                saveLastStream(Number(id), type, { url, streamLangs: langs, rawStreamUrl: stream?.url || null, transcodeVideo: !!needsVideoTranscode, subtitleTracks: stream?._subtitles || [], imdbId, mediaType: type })
              }}
            />
            </StreamErrorBoundary>
          </div>
        )}


        {/* ── Similar ── */}
        {similar?.results?.length > 0 && (
          <div style={{ paddingBottom: '3rem' }}>
            <MediaShelf title="More Like This" items={similar.results} />
          </div>
        )}
      </div>

      {/* CSS for music pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
    </>
  )
}

function Pill({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
      borderRadius: 4, padding: '3px 8px', fontSize: '0.78rem',
      color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {children}
    </span>
  )
}

/** Collect all unique language codes present across a stream list */
function streamLangOptions(streams) {
  const seen = new Set()
  for (const s of streams) {
    for (const code of parseStreamLanguages(s)) {
      if (code !== 'MULTI' && code !== 'DUAL') seen.add(code)
    }
  }
  return [...seen].sort()
}

/** Compact sort/filter toolbar shared by both stream panels */
class StreamErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,80,80,0.8)' }}>
        Stream list error: {this.state.err.message}
      </p>
    )
    return this.props.children
  }
}

function StreamSortBar({ streams, sortBy, setSortBy, filterLang, setFilterLang, compatOnly, setCompatOnly }) {
  const langOptions = streamLangOptions(streams)
  const selectStyle = {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, color: '#fff', padding: '0.25rem 0.5rem',
    fontSize: '0.72rem', cursor: 'pointer',
  }
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
      {/* Sort */}
      <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Sort</span>
      {[
        { value: 'default',   label: 'Best Match' },
        { value: 'seeds',     label: '👤 Seeds'   },
        { value: 'size-desc', label: '💾 Largest'  },
        { value: 'size-asc',  label: '💾 Smallest' },
        { value: 'quality',   label: '✨ Quality'  },
        { value: 'language',  label: '🌐 Language' },
      ].map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setSortBy(value)}
          style={{
            background: sortBy === value ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${sortBy === value ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 6, color: sortBy === value ? '#fff' : 'rgba(255,255,255,0.65)',
            padding: '0.25rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: sortBy === value ? 700 : 400,
            transition: 'all 0.12s',
          }}
        >
          {label}
        </button>
      ))}

      {/* Language filter */}
      {langOptions.length > 1 && (
        <>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, marginLeft: 4 }}>Lang</span>
          <select value={filterLang} onChange={e => setFilterLang(e.target.value)} style={selectStyle}>
            <option value=''>All</option>
            {langOptions.map(code => (
              <option key={code} value={code}>{LANG_LABELS[code] || code.toUpperCase()}</option>
            ))}
          </select>
        </>
      )}

      {/* Compat-only toggle */}
      <button
        onClick={() => setCompatOnly(v => !v)}
        style={{
          marginLeft: 'auto',
          background: compatOnly ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${compatOnly ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 6, color: compatOnly ? '#4ade80' : 'rgba(255,255,255,0.45)',
          padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: compatOnly ? 700 : 400,
          transition: 'all 0.12s', flexShrink: 0,
        }}
      >
        ✓ Compatible only
      </button>
    </div>
  )
}

/** Horizontal stream tray that slides in below a clicked episode row */
function InlineStreamTray({ loading, streams, onSelect, preferredLang }) {
  const [sortBy,      setSortBy]      = useState('default')
  const [filterLang,  setFilterLang]  = useState('')
  const [compatOnly,  setCompatOnly]  = useState(false)
  const { companionOnline } = useLocalLibrary()

  const sorted = streams
    ? sortAndFilterStreams(streams, { sortBy, filterLang, compatOnly, preferredLang })
    : null

  return (
    <div style={{
      margin: '0 0 0.25rem',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid var(--border)',
      borderTop: '2px solid var(--accent)',
      borderRadius: '0 0 var(--radius) var(--radius)',
      padding: '0.85rem 1rem',
      animation: 'slideDown 0.18s ease',
    }}>
      {loading && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Querying add-ons…</p>
      )}
      {!loading && streams?.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No streams found. Make sure your add-ons are installed.</p>
      )}
      {!loading && streams?.length > 0 && (
        <>
          <StreamSortBar
            streams={streams}
            sortBy={sortBy}       setSortBy={setSortBy}
            filterLang={filterLang} setFilterLang={setFilterLang}
            compatOnly={compatOnly} setCompatOnly={setCompatOnly}
          />
          {sorted.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No streams match the current filters.</p>
          ) : (
            <div style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.25rem' }} className="shelf-scroll">
              {sorted.map((s, i) => <StreamCard key={i} stream={s} onSelect={onSelect} preferredLang={preferredLang} companionOnline={companionOnline} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StreamPanel({ loading, streams, onSelect, preferredLang }) {
  const [sortBy,      setSortBy]      = useState('default')
  const [filterLang,  setFilterLang]  = useState('')
  const [compatOnly,  setCompatOnly]  = useState(false)
  const { companionOnline } = useLocalLibrary()

  const sorted = streams
    ? sortAndFilterStreams(streams, { sortBy, filterLang, compatOnly, preferredLang })
    : null

  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Available Streams</h3>
        {streams?.length > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{streams.length} total</span>
        )}
      </div>
      {loading && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Querying add-ons…</p>}
      {!loading && streams?.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No streams found. Make sure your add-ons are installed.</p>
      )}
      {!loading && streams?.length > 0 && (
        <>
          <StreamSortBar
            streams={streams}
            sortBy={sortBy}         setSortBy={setSortBy}
            filterLang={filterLang} setFilterLang={setFilterLang}
            compatOnly={compatOnly} setCompatOnly={setCompatOnly}
          />
          {sorted.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No streams match the current filters.</p>
          ) : IS_FIRETV ? (
            <div data-stream-row style={{ display: 'flex', flexDirection: 'row', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {sorted.map((s, i) => <StreamPanelRow key={i} stream={s} onSelect={onSelect} preferredLang={preferredLang} companionOnline={companionOnline} horizontal />)}
            </div>
          ) : sorted.map((s, i) => <StreamPanelRow key={i} stream={s} onSelect={onSelect} preferredLang={preferredLang} companionOnline={companionOnline} />)}
        </>
      )}
    </div>
  )
}

function StreamPanelRow({ stream: s, onSelect, preferredLang, companionOnline = false, horizontal = false }) {
  // On FireTV, ExoPlayer handles all codecs natively — treat everything as compatible
  const compat    = IS_FIRETV ? 'compatible' : streamCompat(s)
  const badge     = compatBadge(compat)
  const dimmed    = compat === 'both-issues' && !companionOnline
  const hasIssue  = compat === 'audio-issue' || compat === 'video-issue' || compat === 'both-issues'
  const langs     = parseStreamLanguages(s)
  const meta      = parseStreamMeta(s)
  const langMatch = preferredLang && langs.length > 0 && !['MULTI','DUAL'].includes(langs[0]) && langs.includes(preferredLang)
  const rawTooltip = [s.name, s.title, companionOnline && hasIssue ? '⚡ Auto-transcoding via companion' : badge?.title].filter(Boolean).join('\n─────\n')

  function handleClick() {
    if (!s.url) return
    if (hasIssue && companionOnline) {
      const { videoCodec } = parseStreamCodecs(s)
      const needsVideoTranscode = videoCodec && !['h264','avc','x264'].includes(videoCodec.toLowerCase())
      // Use preferred language so ffmpeg picks the right audio track by default
      const al = preferredLang && langs.includes(preferredLang) ? preferredLang : ''
      onSelect(transcodeUrl(s.url, 0, needsVideoTranscode, al), s)
    } else {
      onSelect(s.url, s)
    }
  }

  // Effective compat badge — show ⚡ when companion will auto-fix it
  const effectiveBadge = hasIssue && companionOnline
    ? { label: '⚡ Auto', color: '#4ade80', title: 'Will be transcoded automatically via companion' }
    : badge

  if (horizontal) {
    return (
      <div
        tabIndex={s.url ? 0 : -1}
        data-card
        onClick={handleClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
        style={{
          flexShrink: 0, width: 180, padding: '0.6rem 0.75rem',
          background: langMatch ? 'rgba(251,191,36,0.05)' : 'var(--bg-secondary)',
          borderRadius: 'var(--radius)', cursor: s.url ? 'pointer' : 'default',
          border: `1px solid ${langMatch ? 'rgba(251,191,36,0.35)' : 'rgba(74,222,128,0.25)'}`,
          opacity: dimmed ? 0.5 : 1, display: 'flex', flexDirection: 'column', gap: '0.3rem',
        }}
      >
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s.name || s.title || 'Stream'}
        </p>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s.addonName}
        </span>
        {meta.resolution && (
          <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>{meta.resolution}</span>
        )}
      </div>
    )
  }

  return (
    <div
      tabIndex={s.url ? 0 : -1}
      data-card
      title={rawTooltip}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
      style={{
        padding: '0.65rem 0.75rem', marginBottom: '0.4rem',
        background: langMatch ? 'rgba(251,191,36,0.05)' : 'var(--bg-secondary)',
        borderRadius: 'var(--radius)', cursor: s.url ? 'pointer' : 'default',
        border: `1px solid ${langMatch ? 'rgba(251,191,36,0.35)' : compat === 'compatible' || (hasIssue && companionOnline) ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>{s.name || s.title || 'Stream'}</p>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>via {s.addonName}</span>
              {meta.seeds != null && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>👤 {meta.seeds}</span>}
              {meta.sizeGb != null && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>💾 {meta.sizeGb >= 1 ? `${meta.sizeGb.toFixed(1)} GB` : `${(meta.sizeGb * 1024).toFixed(0)} MB`}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {langs.map(code => (
              <span key={code} style={{ fontSize: '0.6rem', borderRadius: 3, padding: '2px 5px', fontWeight: 700,
                background: code === 'MULTI' ? 'rgba(99,102,241,0.2)' : langMatch && code === preferredLang ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.08)',
                color: code === 'MULTI' ? '#818cf8' : langMatch && code === preferredLang ? '#fbbf24' : 'rgba(255,255,255,0.55)',
                border: `1px solid ${code === 'MULTI' ? 'rgba(99,102,241,0.4)' : langMatch && code === preferredLang ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.12)'}`,
              }}>{LANG_LABELS[code] || code.toUpperCase()}</span>
            ))}
            {effectiveBadge && <span title={effectiveBadge.title} style={{ fontSize: '0.62rem', background: effectiveBadge.color + '22', color: effectiveBadge.color, border: `1px solid ${effectiveBadge.color}55`, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{effectiveBadge.label}</span>}
            {s.url && <FiPlay size={16} style={{ color: 'var(--accent)' }} />}
          </div>
        </div>
      )}
    </div>
  )
}

/** Shared stream card used in the inline episode tray */
function StreamCard({ stream: s, onSelect, preferredLang, companionOnline = false }) {
  // On FireTV, ExoPlayer handles all codecs natively — treat everything as compatible
  const compat    = IS_FIRETV ? 'compatible' : streamCompat(s)
  const badge     = compatBadge(compat)
  const hasIssue  = compat === 'audio-issue' || compat === 'video-issue' || compat === 'both-issues'
  const dimmed    = compat === 'both-issues' && !companionOnline
  const langs     = parseStreamLanguages(s)
  const meta      = parseStreamMeta(s)
  const langMatch = preferredLang && langs.length > 0 && !['MULTI','DUAL'].includes(langs[0]) && langs.includes(preferredLang)
  const qualMatch = (s.name || '').match(/4K|\d{3,4}p|HD|SD/i)
  const effectiveBadge = hasIssue && companionOnline
    ? { label: '⚡ Auto', color: '#4ade80', title: 'Will be transcoded automatically via companion' }
    : badge
  const baseBorder = langMatch ? 'rgba(251,191,36,0.45)'
                   : compat === 'compatible' || (hasIssue && companionOnline) ? 'rgba(74,222,128,0.35)'
                   : 'var(--border)'

  const rawTooltip = [s.name, s.title, companionOnline && hasIssue ? '⚡ Auto-transcoding via companion' : effectiveBadge?.title].filter(Boolean).join('\n─────\n')

  function handleClick() {
    if (!s.url) return
    if (hasIssue && companionOnline) {
      const { videoCodec } = parseStreamCodecs(s)
      const needsVideoTranscode = videoCodec && !['h264','avc','x264'].includes(videoCodec.toLowerCase())
      const al = preferredLang && langs.includes(preferredLang) ? preferredLang : ''
      onSelect(transcodeUrl(s.url, 0, needsVideoTranscode, al), s)
    } else {
      onSelect(s.url, s)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!s.url}
      title={rawTooltip}
      style={{
        flexShrink: 0, width: 176, opacity: dimmed ? 0.45 : 1,
        background: langMatch ? 'rgba(251,191,36,0.04)' : 'var(--bg-card)',
        border: `1px solid ${baseBorder}`,
        borderRadius: 'var(--radius)', padding: '0.65rem 0.75rem',
        cursor: s.url ? 'pointer' : 'default', textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { if (!dimmed) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)' }}}
      onMouseLeave={e => { e.currentTarget.style.borderColor = baseBorder; e.currentTarget.style.background = langMatch ? 'rgba(251,191,36,0.04)' : 'var(--bg-card)' }}
    >
      {/* Top row: play icon + quality/compat badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <FiPlay size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {qualMatch && (
            <span style={{ fontSize: '0.58rem', background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>
              {qualMatch[0]}
            </span>
          )}
          {effectiveBadge && (
            <span style={{ fontSize: '0.58rem', background: effectiveBadge.color + '22', color: effectiveBadge.color, border: `1px solid ${effectiveBadge.color}55`, borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>
              {effectiveBadge.label}
            </span>
          )}
        </div>
      </div>

      {/* Stream name */}
      <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
        {s.name || s.title || 'Stream'}
      </p>

      {/* Torrent / file name */}
      {(() => {
        const nameLower = (s.name || '').toLowerCase()
        const addonLower = (s.addonName || '').toLowerCase()
        const firstLine = str => str?.split('\n').map(l => l.trim()).find(l => l.length > 3) || ''
        // looks like a real filename/torrent name: has a video extension, or has dots/dots+year pattern, or is long (>25 chars)
        const looksLikeFilename = str => /\.(mkv|mp4|avi|mov|ts|m2ts|webm)$/i.test(str) || str.length > 25
        // looksLikeSource: short string that's just a rehash of the addon/cache source
        const looksLikeSource = str => {
          const l = str.toLowerCase()
          return str.length < 20 && (
            l.includes(addonLower) || (addonLower && addonLower.includes(l.split(' ')[0]))
          )
        }

        // behaviorHints.filename is the most reliable — always use if present
        const hintFile = firstLine(s.behaviorHints?.filename)
        if (hintFile && !nameLower.includes(hintFile.toLowerCase())) {
          return <p style={{ margin: '1px 0 0', fontSize: '0.66rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{hintFile}</p>
        }

        // Fall back to first line of title/description only if it looks like a real filename
        const candidate = firstLine(s.title) || firstLine(s.description)
        if (!candidate) return null
        if (nameLower.includes(candidate.toLowerCase())) return null
        if (looksLikeSource(candidate)) return null
        if (!looksLikeFilename(candidate)) return null

        return <p style={{ margin: '1px 0 0', fontSize: '0.66rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{candidate}</p>
      })()}

      {/* Addon name + seeds + size */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', margin: '2px 0 4px', flexWrap: 'wrap' }}>
        {s.addonName && !(s.name || '').toLowerCase().includes(s.addonName.toLowerCase()) && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
            {s.addonName}
          </span>
        )}
        {meta.seeds != null && (
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>👤{meta.seeds}</span>
        )}
        {meta.sizeGb != null && (
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
            💾{meta.sizeGb >= 1 ? `${meta.sizeGb.toFixed(1)}G` : `${(meta.sizeGb * 1024).toFixed(0)}M`}
          </span>
        )}
      </div>

      {/* Language badges row */}
      {langs.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {langs.map(code => (
            <span
              key={code}
              style={{
                fontSize: '0.58rem', borderRadius: 3, padding: '1px 5px', fontWeight: 700,
                background: code === 'MULTI' ? 'rgba(99,102,241,0.18)'
                           : langMatch && code === preferredLang ? 'rgba(251,191,36,0.2)'
                           : 'rgba(255,255,255,0.07)',
                color: code === 'MULTI' ? '#818cf8'
                     : langMatch && code === preferredLang ? '#fbbf24'
                     : 'rgba(255,255,255,0.5)',
                border: `1px solid ${code === 'MULTI' ? 'rgba(99,102,241,0.35)'
                          : langMatch && code === preferredLang ? 'rgba(251,191,36,0.45)'
                          : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {LANG_LABELS[code] || code.toUpperCase()}
            </span>
          ))}
        </div>
      )}

    </button>
  )
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
      Loading…
    </div>
  )
}

/** Split-button: plays best version by default; ▼ reveals version picker */
function LocalPlayButton({ versions, getFileUrl, play, title, detail, tmdbId, imdbId, mediaType, subtitleTracks = [], setMusicDismissed, getSavedProgress, onProgress, onStartWatching }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useState(null)

  const best = versions[0]

  async function playFile(file) {
    setLoading(true)
    setOpen(false)
    try {
      const url = await getFileUrl(file.filename)
      setMusicDismissed(true)
      play({
        url, title,
        year: (detail?.release_date || detail?.first_air_date)?.slice(0, 4),
        poster: IMG(detail?.poster_path, 'w780'),
        subtitleTracks,
        imdbId,
        mediaType,
        onProgress,
        startTime: getSavedProgress ? getSavedProgress(tmdbId, mediaType) : 0,
      })
      onStartWatching()
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      {/* Main play button */}
      <button
        className="btn-accent"
        autoFocus
        disabled={loading}
        onClick={() => playFile(best)}
        style={{
          fontSize: '0.9rem', padding: '0.65rem 1.2rem',
          background: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.4rem',
          borderRadius: versions.length > 1 ? 'var(--radius) 0 0 var(--radius)' : 'var(--radius)',
          borderRight: versions.length > 1 ? '1px solid rgba(255,255,255,0.2)' : undefined,
        }}
      >
        <FiHardDrive size={15} />
        {loading ? 'Opening…' : 'Play Local'}
        {best.qualityLabel && (
          <span style={{ fontSize: '0.72rem', opacity: 0.8, background: 'rgba(0,0,0,0.25)', borderRadius: 3, padding: '1px 5px' }}>
            {best.qualityLabel}
          </span>
        )}
      </button>

      {/* ▼ versions dropdown toggle */}
      {versions.length > 1 && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              fontSize: '0.9rem', padding: '0.65rem 0.7rem',
              background: '#16a34a', display: 'flex', alignItems: 'center',
              borderRadius: '0 var(--radius) var(--radius) 0',
              border: 'none', cursor: 'pointer', color: '#fff',
            }}
            title={`${versions.length} versions available`}
          >
            <FiLayers size={14} />
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
              background: 'rgba(15,15,20,0.97)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
              minWidth: 280, overflow: 'hidden',
            }}>
              <p style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {versions.length} Versions Available
              </p>
              {versions.map((v, i) => (
                <VersionItem key={v.id} file={v} isBest={i === 0} onClick={() => playFile(v)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function VersionItem({ file, isBest, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.55rem 0.85rem', border: 'none', cursor: 'pointer', textAlign: 'left',
        background: hovered ? 'rgba(22,163,74,0.2)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        transition: 'background 0.1s',
      }}
    >
      <FiHardDrive size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {file.qualityLabel && (
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>{file.qualityLabel}</span>
          )}
          {isBest && (
            <span style={{ fontSize: '0.62rem', background: '#16a34a', color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>BEST</span>
          )}
        </div>
        <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.filename}
        </p>
      </div>
      <FiPlay size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
    </button>
  )
}

/** TV episode row with local version awareness */
const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

function EpisodeRow({ ep, season, localVersions, hasLocal, onWatch, onPlayLocal, watched }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const best = localVersions[0]
  const lastFired = useRef(0)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])
  // On FireTV local files come via companion stream URL — always show stream list
  // so user can pick a stream and benefit from auto-transcode if needed.
  // Guard: debounce 300ms to prevent double-fire from spatial nav el.click()
  // firing onClick AND the keydown event also reaching onKeyDown.
  const handlePrimary = () => {
    const now = Date.now()
    if (now - lastFired.current < 300) return
    lastFired.current = now
    hasLocal ? onPlayLocal(best) : onWatch()
  }

  function epNavKey(e, isRowBody) {
    const RIGHT = e.keyCode === 39 || e.keyCode === 228
    const LEFT  = e.keyCode === 37 || e.keyCode === 225
    if (!RIGHT && !LEFT) return
    e.preventDefault(); e.stopPropagation()
    const row = dropdownRef.current?.closest('[data-ep-row]') || e.currentTarget.closest('[data-ep-row]')
    if (!row) return
    const btns = Array.from(row.querySelectorAll('[data-ep-btn]'))
    if (RIGHT && isRowBody) { btns[0]?.focus(); return }
    const idx = btns.indexOf(e.currentTarget)
    if (RIGHT) { btns[idx + 1]?.focus(); return }
    if (LEFT)  { idx > 0 ? btns[idx - 1]?.focus() : row.querySelector('[data-card]')?.focus() }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-ep-row
      style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', backdropFilter: 'blur(8px)', overflow: 'visible', position: 'relative', zIndex: open ? 10 : undefined }}
    >
      <div
        data-card
        style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '0.75rem', cursor: 'pointer' }}
        tabIndex={0}
        onClick={handlePrimary}
        onKeyDown={e => { if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23) { handlePrimary(); return } epNavKey(e, true) }}
      >
        {ep.still_path && <img src={IMG(ep.still_path, 'w300')} alt="" style={{ width: 120, borderRadius: 4, flexShrink: 0, aspectRatio: '16/9', objectFit: 'cover' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: watched ? 'rgba(255,255,255,0.45)' : undefined }}>{ep.episode_number}. {ep.name}</p>
            {watched && (
              <span title="Watched" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', background: 'rgba(52,211,153,0.15)', color: '#34d399', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                <FiCheck size={9} strokeWidth={3} /> Watched
              </span>
            )}
            {hasLocal && (
              <span style={{ fontSize: '0.62rem', background: '#16a34a', color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                LOCAL{best?.qualityLabel ? ` · ${best.qualityLabel}` : ''}
              </span>
            )}
            {localVersions.length > 1 && (
              <span style={{ fontSize: '0.62rem', background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                +{localVersions.length - 1} more
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ep.overview?.slice(0, 140)}{ep.overview?.length > 140 ? '…' : ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          {localVersions.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
              title="Choose version"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '0.25rem 0.4rem', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.7rem' }}
            >
              <FiLayers size={11} /> Versions
            </button>
          )}
          {hasLocal && (
            <button
              data-ep-btn
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onPlayLocal(best) }}
              onKeyDown={e => { if (e.keyCode === 13 || e.keyCode === 23) { e.stopPropagation(); onPlayLocal(best) } else epNavKey(e, false) }}
              title="Play local file"
              style={{ background: '#16a34a', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', fontWeight: 600 }}
            >
              <FiPlay size={11} /> Play
            </button>
          )}
          <button
            data-ep-btn
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onWatch() }}
            onKeyDown={e => { if (e.keyCode === 13 || e.keyCode === 23) { e.stopPropagation(); onWatch() } else epNavKey(e, false) }}
            title="Find streams"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem' }}
          >
            <FiPlay size={11} /> Stream
          </button>
        </div>
      </div>

      {/* Version picker dropdown */}
      {open && localVersions.length > 1 && (
        <div ref={dropdownRef} style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 400,
          background: 'rgba(15,15,20,0.97)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.8)', minWidth: 260, overflow: 'hidden',
        }}>
          <p style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            Choose Version
          </p>
          {localVersions.map((v, i) => (
            <VersionItem key={v.id} file={v} isBest={i === 0} onClick={() => { setOpen(false); onPlayLocal(v) }} />
          ))}
          <button
            onClick={() => { setOpen(false); onWatch() }}
            style={{ width: '100%', padding: '0.55rem 0.85rem', border: 'none', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <FiPlay size={12} /> Stream instead
          </button>
        </div>
      )}
    </div>
  )
}
