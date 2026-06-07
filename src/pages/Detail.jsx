import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getDetail, getSeason, getSimilar, getVideos, IMG, getCertification, YT_EMBED, pickTrailer, pickTheme } from '../lib/tmdb'
import { useAddons } from '../context/AddonsContext'
import { useLibrary } from '../context/LibraryContext'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { usePlayer } from '../context/PlayerContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import MediaShelf from '../components/MediaShelf'
import { FiPlay, FiStar, FiClock, FiCalendar, FiChevronDown, FiVolume2, FiVolumeX, FiMusic, FiX, FiBookmark, FiHardDrive, FiLayers } from 'react-icons/fi'

export default function Detail() {
  const { type, id } = useParams()
  const { getStreams, getSubtitles } = useAddons()
  const { isSaved, toggle: toggleSave } = useLibrary()
  const { startWatching, updateProgress } = useWatchHistory()
  const { play } = usePlayer()
  const { getLocalFile, getLocalVersions, getFileUrl } = useLocalLibrary()
  const [streams, setStreams]         = useState(null)
  const [loadingStreams, setLoadingStreams] = useState(false)
  const [autoSubs, setAutoSubs]       = useState([])
  const [selectedSeason, setSelectedSeason] = useState(1)
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
  const backdrop      = IMG(detail?.backdrop_path, 'original')
  const poster        = IMG(detail?.poster_path, 'w342')
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
    setLoadingStreams(true)
    setStreams(null)
    try {
      // Fetch streams and subtitles in parallel
      const [streamResults, subResults] = await Promise.all([
        getStreams(type, imdbId, season, episode),
        getSubtitles(type, imdbId, season, episode).catch(() => []),
      ])
      setStreams(streamResults.map(s => ({ ...s, _subtitles: subResults })))
    } finally {
      setLoadingStreams(false)
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>

      {/* ── Background trailer video ── */}
      {bgVideoUrl && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0,
          pointerEvents: 'none',
        }}>
          <iframe
            src={bgVideoUrl}
            title="background"
            allow="autoplay; encrypted-media"
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '177.78vh',   // 16:9 fill
              minWidth: '100%',
              height: '56.25vw',
              minHeight: '100%',
              border: 'none',
              opacity: 0.45,
              filter: 'blur(2px) brightness(0.6)',
            }}
          />
          {/* gradient over the video */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, var(--bg-primary) 80%)',
          }} />
        </div>
      )}

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

            {/* Poster */}
            {poster && (
              <img
                src={poster}
                alt={title}
                style={{ width: 180, borderRadius: 'var(--radius)', flexShrink: 0, boxShadow: '0 8px 40px rgba(0,0,0,0.9)', alignSelf: 'flex-start', marginTop: '1rem' }}
              />
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
                      subtitleTracks={autoSubs}
                      setMusicDismissed={setMusicDismissed}
                      onProgress={(t, d) => updateProgress(Number(id), type, t, d, title, IMG(detail?.poster_path, 'w342'))}
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
                  onChange={e => setSelectedSeason(Number(e.target.value))}
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
                return (
                  <EpisodeRow
                    key={ep.episode_number}
                    ep={ep}
                    season={selectedSeason}
                    localVersions={epVersions}
                    hasLocal={hasLocal}
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
                          onProgress: (t, d) => updateProgress(Number(id), 'tv', t, d, title, IMG(detail?.poster_path, 'w342')),
                        })
                        startWatching({ id: Number(id), type: 'tv', title, poster: IMG(detail?.poster_path, 'w342') })
                      } catch (e) { alert(e.message) }
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* ── Streams panel ── */}
        {(loadingStreams || streams !== null) && (
          <div style={{ padding: '0 2rem 2rem' }}>
            <StreamPanel
            loading={loadingStreams}
            streams={streams}
            onSelect={(url, stream) => {
              setMusicDismissed(true)
              play({
                url,
                title,
                year: (detail?.release_date || detail?.first_air_date)?.slice(0, 4),
                poster: IMG(detail?.poster_path, 'w342'),
                subtitleTracks: stream?._subtitles || [],
                onProgress: (t, d) => updateProgress(Number(id), type, t, d, title, IMG(detail?.poster_path, 'w342')),
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
      `}</style>
    </div>
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

function StreamPanel({ loading, streams, onSelect }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '1px solid var(--border)' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Available Streams</h3>
      {loading && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Querying add-ons…</p>}
      {!loading && streams?.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No streams found. Make sure your add-ons are installed.</p>
      )}
      {!loading && streams?.map((s, i) => (
        <div
          key={i}
          tabIndex={s.url ? 0 : -1}
          onClick={() => s.url && onSelect(s.url, s)}
          onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && s.url) onSelect(s.url, s) }}
          style={{ padding: '0.65rem 0.75rem', marginBottom: '0.4rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', cursor: s.url ? 'pointer' : 'default', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>{s.name || s.title || 'Stream'}</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>via {s.addonName}</p>
          </div>
          {s.url && <FiPlay size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
        </div>
      ))}
    </div>
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
function LocalPlayButton({ versions, getFileUrl, play, title, detail, subtitleTracks = [], setMusicDismissed, onProgress, onStartWatching }) {
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
function EpisodeRow({ ep, season, localVersions, hasLocal, onWatch, onPlayLocal }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const best = localVersions[0]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', backdropFilter: 'blur(8px)', overflow: 'visible', position: 'relative' }}
    >
      <div
        style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '0.75rem', cursor: 'pointer' }}
        tabIndex={0}
        onClick={() => hasLocal ? onPlayLocal(best) : onWatch()}
        onKeyDown={e => { if (e.key === 'Enter') hasLocal ? onPlayLocal(best) : onWatch() }}
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
