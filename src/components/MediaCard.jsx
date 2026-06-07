import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IMG } from '../lib/tmdb'
import { useContextMenu } from '../context/ContextMenuContext'
import { useArtwork } from '../context/ArtworkContext'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { FiPlay, FiStar, FiCheck, FiHardDrive, FiFilm } from 'react-icons/fi'

export default function MediaCard({ item, width = 150, onKeyDown }) {
  const navigate = useNavigate()
  const { show: showMenu } = useContextMenu()
  const { getArtwork } = useArtwork()
  const { isSaved } = useLibrary()
  const { hasLocal, getLocalEpisodeCount } = useLocalLibrary()
  const [hovered, setHovered] = useState(false)
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const title = item.title || item.name || 'Untitled'
  const customArt = getArtwork(item.id, type)
  const poster = customArt || IMG(item.poster_path, 'w342')
  const saved   = isSaved(item.id, type)
  const isLocal = hasLocal(item.id, type)
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
      {/* Poster */}
      {poster
        ? <img src={poster} alt={title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>No Image</div>
      }

      {/* Hover overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.92) 40%, rgba(0,0,0,0.1) 100%)',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.2s',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '0.6rem',
      }}>
        {/* Play button */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '0.4rem', flexShrink: 0,
        }}>
          <FiPlay size={16} style={{ color: '#fff', marginLeft: 2 }} />
        </div>
        <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.78rem', color: '#fff', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{title}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {year && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>{year}</span>}
          {rating && (
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 2 }}>
              <FiStar size={10} style={{ color: '#fbbf24' }} />{rating}
            </span>
          )}
        </div>
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
