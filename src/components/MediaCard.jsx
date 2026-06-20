import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IMG } from '../lib/tmdb'
import { useContextMenu } from '../context/ContextMenuContext'
import { useArtwork } from '../context/ArtworkContext'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { FiPlay, FiStar, FiCheck, FiHardDrive, FiFilm } from 'react-icons/fi'

export default function MediaCard({ item, width = 150, onKeyDown, useBackdrop = false }) {
  const navigate = useNavigate()
  const { show: showMenu } = useContextMenu()
  const { getPoster } = useArtwork()
  const { isSaved } = useLibrary()
  const { hasLocal, getLocalEpisodeCount } = useLocalLibrary()
  const { history: watchHistory } = useWatchHistory()
  const [hovered, setHovered] = useState(false)
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const title = item.title || item.name || 'Untitled'
  // In backdrop mode use the 16:9 backdrop image; custom poster overrides still apply
  const poster = getPoster(item.id, type) ||
    (useBackdrop && item.backdrop_path ? IMG(item.backdrop_path, 'w780') : null) ||
    IMG(item.poster_path, 'w780')
  const aspectRatio = useBackdrop ? '16/9' : '2/3'
  const saved   = isSaved(item.id, type)
  const isLocal = hasLocal(item.id, type)
  const historyEntry = watchHistory.find(h => h.id === item.id && h.type === type)
  const isWatched = historyEntry && (
    type === 'movie' ? (historyEntry.progress || 0) >= 0.85 : false
  )
  const year = (item.release_date || item.first_air_date || '').slice(0, 4)
  const rating = item.vote_average?.toFixed(1)

  // Episode / season count for TV cards
  const isTV = type === 'tv'
  const localEpCount = isTV ? getLocalEpisodeCount(item.id) : 0
  // TMDB detail pages include number_of_seasons / number_of_episodes — show if present
  const tmdbSeasons  = item.number_of_seasons
  const tmdbEpisodes = item.number_of_episodes
  let episodeBadge = null
  if (isTV) {
    if (localEpCount > 0) {
      episodeBadge = `${localEpCount} ep${localEpCount !== 1 ? 's' : ''}`
    } else if (tmdbSeasons) {
      episodeBadge = `${tmdbSeasons} season${tmdbSeasons !== 1 ? 's' : ''}`
      if (tmdbEpisodes) episodeBadge += ` · ${tmdbEpisodes} eps`
    }
  }

  return (
    <div
      data-card
      tabIndex={0}
      className="focusable-card"
      onClick={() => navigate(`/detail/${type}/${item.id}`)}
      onContextMenu={e => { e.preventDefault(); showMenu(item, e.clientX, e.clientY) }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/detail/${type}/${item.id}`) }
        onKeyDown?.(e)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: 'var(--bg-card)',
        cursor: 'pointer',
        flexShrink: 0,
        width,
        position: 'relative',
        transform: hovered ? 'scale(1.06)' : 'scale(1)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        boxShadow: hovered ? '0 12px 40px rgba(0,0,0,0.7)' : 'none',
        zIndex: hovered ? 10 : 1,
      }}
    >
      {/* Poster / Backdrop */}
      {poster
        ? <img src={poster} alt={title} style={{ width: '100%', aspectRatio, objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', aspectRatio, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>No Image</div>
      }

      {/* Watched badge — top-left corner */}
      {isWatched && (
        <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 4, background: 'rgba(0,0,0,0.72)', borderRadius: 4, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3 }}>
          <FiCheck size={10} strokeWidth={3} style={{ color: '#34d399' }} />
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#34d399', letterSpacing: '0.03em' }}>WATCHED</span>
        </div>
      )}

      {/* Hover overlay — in backdrop mode: always show bottom gradient + title, darken on hover */}
      <div style={{
        position: 'absolute', inset: 0,
        background: useBackdrop
          ? `linear-gradient(to top, rgba(0,0,0,${hovered ? '0.85' : '0.55'}) 0%, rgba(0,0,0,${hovered ? '0.3' : '0'}) 60%, transparent 100%)`
          : `linear-gradient(to top, rgba(0,0,0,0.92) 40%, rgba(0,0,0,0.1) 100%)`,
        opacity: useBackdrop ? 1 : (hovered ? 1 : 0),
        transition: 'opacity 0.2s, background 0.2s',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: useBackdrop ? '0.5rem 0.6rem' : '0.6rem',
      }}>
        {/* Play button — only on hover */}
        {hovered && <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '0.4rem', flexShrink: 0,
        }}>
          <FiPlay size={16} style={{ color: '#fff', marginLeft: 2 }} />
        </div>}
        {/* In backdrop mode title is always visible; in poster mode only on hover */}
        {(useBackdrop || hovered) && <>
          <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: useBackdrop ? '0.72rem' : '0.78rem', color: '#fff', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{title}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {year && <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.6)' }}>{year}</span>}
            {rating && (
              <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 2 }}>
                <FiStar size={9} style={{ color: '#fbbf24' }} />{rating}
              </span>
            )}
          </div>
        </>}
      </div>

      {/* Badges — top-left stack */}
      <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', flexDirection: 'column', gap: 3, pointerEvents: 'none' }}>
        {episodeBadge && (
          <div style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', borderRadius: 4, padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 700, color: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <FiFilm size={9} />{episodeBadge}
          </div>
        )}
        {saved && (
          <div style={{ background: 'var(--accent)', borderRadius: 4, padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 700, color: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
            <FiCheck size={9} strokeWidth={3} /> Library
          </div>
        )}
        {isLocal && (
          <div style={{ background: '#16a34a', borderRadius: 4, padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 700, color: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
            <FiHardDrive size={9} /> Local
          </div>
        )}
      </div>

      {/* Always-visible rating badge (not hovered) */}
      {rating && !hovered && (
        <div style={{
          position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
          borderRadius: 4, padding: '2px 5px', fontSize: '0.7rem',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <FiStar size={10} style={{ color: '#fbbf24' }} />
          <span style={{ color: '#fff', fontWeight: 600 }}>{rating}</span>
        </div>
      )}
    </div>
  )
}
