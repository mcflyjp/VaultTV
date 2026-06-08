import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getDetail, getSeason, getSimilar, getVideos, IMG, getCertification, YT_EMBED, pickTrailer, pickTheme } from '../lib/tmdb'
import { useAddons } from '../context/AddonsContext'
import { useLibrary } from '../context/LibraryContext'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { usePlayer } from '../context/PlayerContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { useArtwork } from '../context/ArtworkContext'
import ArtworkPicker from '../components/ArtworkPicker'
import { useLanguage } from '../context/LanguageContext'
import { useTrakt } from '../context/TraktContext'
import MediaShelf from '../components/MediaShelf'
import { FiPlay, FiStar, FiClock, FiCalendar, FiChevronDown, FiVolume2, FiVolumeX, FiMusic, FiX, FiBookmark, FiHardDrive, FiLayers, FiImage } from 'react-icons/fi'
import { sortAndFilterStreams, streamCompat, compatBadge, parseStreamLanguages, parseStreamMeta, parseStreamCodecs, LANG_LABELS } from '../lib/streamCompat'
import { platformLabel } from '../lib/platform'
import { transcodeUrl } from '../lib/companion'

export default function Detail() {
  const { type, id } = useParams()
  const { getStreams, getSubtitles } = useAddons()
  const { isSaved, toggle: toggleSave } = useLibrary()
  const { startWatching, updateProgress } = useWatchHistory()
  const { syncWatched: traktSyncWatched } = useTrakt()
  // Track whether we've already synced the current item as watched this session
  const watchSyncedRef = { current: false }

  /** Shared progress handler — fires Trakt watch sync at 90% completion */
  function makeProgressHandler(itemId, itemType) {
    return (t, d) => {
      updateProgress(Number(itemId), itemType, t, d, title, IMG(detail?.poster_path, 'w342'))
      if (!watchSyncedRef.current && d > 0 && t / d >= 0.9) {
        watchSyncedRef.current = true
        traktSyncWatched(itemType, Number(itemId))
      }
    }
  }
  const { play } = usePlayer()
  const { getLocalFile, getLocalVersions, getFileUrl } = useLocalLibrary()
  const { getPoster, getBackdrop } = useArtwork()
  const { audioLang } = useLanguage()
  const [artPicker, setArtPicker]     = useState(null) // null | 'poster' | 'backdrop'
  const [posterHovered, setPosterHovered] = useState(false)
  const [streams, setStreams]         = useState(null)
  const [loadingStreams, setLoadingStreams] = useState(false)
  const [autoSubs, setAutoSubs]       = useState([])
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [streamEp, setStreamEp]       = useState(null) // { season, episode } currently expanded
  const [musicPlaying, setMusicPlaying] = useState(true)
  const [musicDismissed, setMusicDismissed] = useState(false)

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
  const imdbId = detail?.external_ids?.imdb_id || `tmdb:${id}`

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

  if (isLoading) return <LoadingState />

  const title         = detail?.title || detail?.name
  const tmdbBackdrop  = IMG(detail?.backdrop_path, 'original')
  const tmdbPoster    = IMG(detail?.poster_path, 'w342')
  const backdrop      = getBackdrop(Number(id), type) || tmdbBackdrop
  const poster        = getPoster(Number(id), type)   || tmdbPoster
  const certification = getCertification(detail, type)

  const allVideos   = videos?.results || detail?.videos?.results || []
  const trailerKey  = pickTrailer(allVideos)
  const themeKey    = pickTheme(allVideos)

  // Movies: show trailer as muted background video
  // TV shows: no background video — theme audio only
  const bgVideoUrl = type === 'movie' && trailerKey
    ? `${YT_EMBED}/${trailerKey}?autoplay=1&mute=1&loop=1&playlist=${trailerKey}&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&rel=0&playsinline=1`
    : null

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

  /* ArtworkPicker needs the full detail object so item can have a title */
  const artItem = detail ? { id: Number(id), title, poster_path: detail.poster_path, backdrop_path: detail.backdrop_path } : null

  return (
    <>
    {artPicker && artItem && (
      <ArtworkPicker
        item={artItem}
        type={type}
        slot={artPicker}
        onClose={() => setArtPicker(null)}
      />
    )}
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>

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

      {/* ── Change Banner button — top-right of viewport ── */}
      <button
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
      </button>

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
        <div style={{ minHeight: 380, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '5rem 2rem 2rem' }}>
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
                      imdbId={imdbId}
                      mediaType={type}
                      subtitleTracks={autoSubs}
                      setMusicDismissed={setMusicDismissed}
                      onProgress={makeProgressHandler(id, type)}
                      onStartWatching={() => startWatching({ id: Number(id), type, title, poster: IMG(detail?.poster_path, 'w342') })}
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
                    onClick={() => toggleSave({ id: Number(id), type, title: detail.title || detail.name, poster: IMG(detail.poster_path, 'w342') })}
                    title={isSaved(Number(id), type) ? 'Remove from library' : 'Save to library'}
                    style={{
                      background: isSaved(Number(id), type) ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius)',
                      color: '#fff', cursor: 'pointer', padding: '0.6rem 0.9rem',
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      fontSize: '0.88rem', transition: 'background 0.15s',
                    }}
                  >
                    <FiBookmark size={15} fill={isSaved(Number(id), type) ? '#fff' : 'none'} />
                    {isSaved(Number(id), type) ? 'Saved' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── TV Episodes ── */}
        {type === 'tv' && detail?.number_of_seasons && (
          <div style={{ padding: '0 2rem 2rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Episodes</h2>
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
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {season?.episodes?.map(ep => {
                const epVersions = getLocalVersions(Number(id), 'tv', selectedSeason, ep.episode_number)
                const hasLocal = epVersions.length > 0
                const isExpanded = streamEp?.season === selectedSeason && streamEp?.episode === ep.episode_number
                return (
                  <div key={ep.episode_number}>
                    <EpisodeRow
                      ep={ep}
                      season={selectedSeason}
                      localVersions={epVersions}
                      hasLocal={hasLocal}
                      active={isExpanded}
                      onWatch={() => handleWatch(selectedSeason, ep.episode_number)}
                      onPlayLocal={async (file) => {
                        try {
                          const url = await getFileUrl(file.filename)
                          setMusicDismissed(true)
                          play({
                            url,
                            title: `${title} · S${String(selectedSeason).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')} · ${ep.name}`,
                            poster: IMG(detail?.poster_path, 'w342'),
                            subtitleTracks: autoSubs,
                            imdbId,
                            mediaType: 'tv',
                            season: selectedSeason,
                            episode: ep.episode_number,
                            onProgress: makeProgressHandler(id, 'tv'),
                          })
                          startWatching({ id: Number(id), type: 'tv', title, poster: IMG(detail?.poster_path, 'w342') })
                        } catch (e) {
                          // Local file unavailable — fall back to stream list
                          handleWatch(selectedSeason, ep.episode_number)
                        }
                      }}
                    />
                    {/* ── Inline stream tray — opens below the clicked episode ── */}
                    {isExpanded && (
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
                            poster: IMG(detail?.poster_path, 'w342'),
                            subtitleTracks: stream?._subtitles || [],
                            imdbId,
                            mediaType: 'tv',
                            season: selectedSeason,
                            episode: ep.episode_number,
                            onProgress: makeProgressHandler(id, 'tv'),
                            streamLangs: langs,
                            rawStreamUrl: stream?.url || null,
                            transcodeVideo: !!needsVideoTranscode,
                          })
                          startWatching({ id: Number(id), type: 'tv', title, poster: IMG(detail?.poster_path, 'w342') })
                        }}
                      />
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
                  poster: IMG(detail?.poster_path, 'w342'),
                  subtitleTracks: stream?._subtitles || [],
                  imdbId,
                  mediaType: type,
                  onProgress: makeProgressHandler(id, type),
                  streamLangs: langs,
                  rawStreamUrl: stream?.url || null,
                  transcodeVideo: !!needsVideoTranscode,
                })
                startWatching({ id: Number(id), type, title, poster: IMG(detail?.poster_path, 'w342') })
              }}
            />
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
          ) : sorted.map((s, i) => <StreamPanelRow key={i} stream={s} onSelect={onSelect} preferredLang={preferredLang} companionOnline={companionOnline} />)}
        </>
      )}
    </div>
  )
}

function StreamPanelRow({ stream: s, onSelect, preferredLang, companionOnline = false }) {
  const compat    = streamCompat(s)
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
  const compat    = streamCompat(s)
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

      {/* Addon name + seeds + size */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', margin: '2px 0 4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
          {s.addonName}
        </span>
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
function LocalPlayButton({ versions, getFileUrl, play, title, detail, imdbId, mediaType, subtitleTracks = [], setMusicDismissed, onProgress, onStartWatching }) {
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
        poster: IMG(detail?.poster_path, 'w342'),
        subtitleTracks,
        imdbId,
        mediaType,
        onProgress,
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

function EpisodeRow({ ep, season, localVersions, hasLocal, onWatch, onPlayLocal }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const best = localVersions[0]
  // On FireTV local files come via companion stream URL — always show stream list
  // so user can pick a stream and benefit from auto-transcode if needed
  const handlePrimary = () => (!IS_FIRETV && hasLocal) ? onPlayLocal(best) : onWatch()

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', backdropFilter: 'blur(8px)', overflow: 'visible', position: 'relative' }}
    >
      <div
        data-card
        style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '0.75rem', cursor: 'pointer' }}
        tabIndex={0}
        onClick={handlePrimary}
        onKeyDown={e => { if (e.key === 'Enter') handlePrimary() }}
      >
        {ep.still_path && <img src={IMG(ep.still_path, 'w300')} alt="" style={{ width: 120, borderRadius: 4, flexShrink: 0, aspectRatio: '16/9', objectFit: 'cover' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{ep.episode_number}. {ep.name}</p>
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
          <FiPlay size={18} style={{ color: hasLocal ? '#16a34a' : 'var(--accent)' }} />
        </div>
      </div>

      {/* Version picker dropdown */}
      {open && localVersions.length > 1 && (
        <div style={{
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
