import { useNavigate } from 'react-router-dom'
import { IMG } from '../lib/tmdb'
import { FiPlay, FiInfo, FiStar } from 'react-icons/fi'

export default function HeroBanner({ item }) {
  const navigate = useNavigate()
  if (!item) return null

  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const title = item.title || item.name
  const backdrop = IMG(item.backdrop_path, 'original')
  const overview = item.overview?.slice(0, 180) + (item.overview?.length > 180 ? '…' : '')
  const year = (item.release_date || item.first_air_date || '').slice(0, 4)
  const rating = item.vote_average?.toFixed(1)

  return (
    <div style={{ position: 'relative', height: 420, overflow: 'hidden', marginBottom: '1.5rem' }}>
      {backdrop && (
        <img src={backdrop} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
      )}

      {/* Plex-style gradient — heavy left fade, subtle bottom */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, var(--bg-primary) 30%, rgba(0,0,0,0.6) 60%, transparent 100%), linear-gradient(to top, var(--bg-primary) 0%, transparent 35%)',
      }} />

      <div style={{
        position: 'relative', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '0 2rem 2rem',
      }}>
        {/* Meta badges */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          {year && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4 }}>{year}</span>
          )}
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4 }}>{type === 'tv' ? 'Series' : 'Movie'}</span>
          {rating && (
            <span style={{ fontSize: '0.78rem', color: '#fbbf24', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <FiStar size={11} /> {rating}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 style={{ margin: '0 0 0.6rem', fontSize: 'clamp(1.6rem, 3.5vw, 2.6rem)', fontWeight: 800, color: '#fff', lineHeight: 1.1, maxWidth: 550, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{title}</h1>

        {/* Overview */}
        {overview && <p style={{ margin: '0 0 1.25rem', color: 'rgba(255,255,255,0.7)', maxWidth: 480, lineHeight: 1.6, fontSize: '0.88rem' }}>{overview}</p>}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn-accent" onClick={() => navigate(`/detail/${type}/${item.id}`)} style={{ fontSize: '0.88rem' }}>
            <FiPlay size={14} /> Play
          </button>
          <button className="btn-ghost" onClick={() => navigate(`/detail/${type}/${item.id}`)} style={{ fontSize: '0.88rem' }}>
            <FiInfo size={14} /> More Info
          </button>
        </div>
      </div>
    </div>
  )
}
