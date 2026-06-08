import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { IMG } from '../lib/tmdb'
import { FiPlay, FiInfo, FiStar, FiVolume2, FiVolumeX } from 'react-icons/fi'
import { useState } from 'react'

export default function HeroBanner({ item, cinematic = false }) {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const [muted, setMuted] = useState(true)

  if (!item) return null

  const isVaultflix = theme === 'vaultflix'
  const isVaultPlus = theme === 'vaultplus'
  // backward-compat aliases used below
  const isNetflix = isVaultflix
  const isDisney  = isVaultPlus

  const type     = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const title    = item.title || item.name
  const backdrop = IMG(item.backdrop_path, 'original')
  const overview = item.overview?.slice(0, 200) + (item.overview?.length > 200 ? '…' : '')
  const year     = (item.release_date || item.first_air_date || '').slice(0, 4)
  const rating   = item.vote_average?.toFixed(1)

  const height = cinematic ? 'min(82vh, 700px)' : 420

  // Gradient style varies by theme
  const gradient = isNetflix
    ? 'linear-gradient(to top, #141414 0%, rgba(20,20,20,0.7) 45%, rgba(20,20,20,0.2) 70%, transparent 100%), linear-gradient(to right, rgba(20,20,20,0.8) 0%, transparent 60%)'
    : isDisney
    ? 'linear-gradient(to top, #040714 0%, rgba(4,7,20,0.75) 45%, rgba(4,7,20,0.1) 70%, transparent 100%), linear-gradient(to right, rgba(4,7,20,0.85) 0%, transparent 55%)'
    : 'linear-gradient(to right, var(--bg-primary) 30%, rgba(0,0,0,0.6) 60%, transparent 100%), linear-gradient(to top, var(--bg-primary) 0%, transparent 35%)'

  return (
    <div style={{ position: 'relative', height, overflow: 'hidden', marginBottom: cinematic ? 0 : '1.5rem', flexShrink: 0 }}>
      {backdrop && (
        <img
          src={backdrop} alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }}
        />
      )}

      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: gradient }} />

      {/* Age/type watermark — Netflix style top-right */}
      {cinematic && isNetflix && (
        <div style={{
          position: 'absolute', top: '1.5rem', right: '3rem',
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.3)',
          padding: '2px 8px', fontSize: '0.78rem', color: '#fff', letterSpacing: '0.05em',
        }}>
          {type === 'tv' ? 'SERIES' : 'FILM'}
        </div>
      )}

      {/* Disney+ brand ribbon — subtle top-right */}
      {cinematic && isDisney && (
        <div style={{
          position: 'absolute', top: '1.5rem', right: '3rem',
          background: 'linear-gradient(135deg, #0063e5, #0483ee)',
          borderRadius: 6, padding: '3px 12px',
          fontSize: '0.72rem', fontWeight: 800, color: '#fff', letterSpacing: '0.08em',
        }}>
          VAULT+
        </div>
      )}

      <div style={{
        position: 'relative', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: cinematic ? '0 3rem 3.5rem' : '0 2rem 2rem',
      }}>

        {/* Netflix-style title logo / large title */}
        <div style={{ maxWidth: cinematic ? 580 : 520 }}>
          {/* Meta badges */}
          {!cinematic && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
              {year && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4 }}>{year}</span>}
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4 }}>{type === 'tv' ? 'Series' : 'Movie'}</span>
              {rating && (
                <span style={{ fontSize: '0.78rem', color: '#fbbf24', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FiStar size={11} /> {rating}
                </span>
              )}
            </div>
          )}

          {/* Title */}
          <h1 style={{
            margin: '0 0 0.75rem',
            fontSize: cinematic ? 'clamp(2rem, 5vw, 3.5rem)' : 'clamp(1.6rem, 3.5vw, 2.6rem)',
            fontWeight: 900, color: '#fff', lineHeight: 1.05,
            textShadow: '0 2px 16px rgba(0,0,0,0.6)',
            letterSpacing: cinematic ? '-0.02em' : 'normal',
          }}>{title}</h1>

          {/* Cinematic meta row */}
          {cinematic && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
              {rating && (
                <span style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FiStar size={12} style={{ color: '#fbbf24' }} /> {rating}
                </span>
              )}
              {year && <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>{year}</span>}
              <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>{type === 'tv' ? 'Series' : 'Movie'}</span>
              {isNetflix && <span style={{ border: '1px solid rgba(255,255,255,0.35)', fontSize: '0.72rem', padding: '1px 6px', color: 'rgba(255,255,255,0.6)' }}>HD</span>}
            </div>
          )}

          {/* Overview */}
          {overview && (
            <p style={{
              margin: '0 0 1.5rem',
              color: cinematic ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.7)',
              maxWidth: cinematic ? 520 : 480,
              lineHeight: 1.65, fontSize: cinematic ? '0.95rem' : '0.88rem',
              textShadow: '0 1px 4px rgba(0,0,0,0.5)',
            }}>{overview}</p>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className="btn-accent"
            onClick={() => navigate(`/detail/${type}/${item.id}`)}
            style={{
              fontSize: cinematic ? '0.95rem' : '0.88rem',
              padding: cinematic ? '0.7rem 2rem' : undefined,
              background: isNetflix ? '#fff' : isDisney ? '#0063e5' : undefined,
              color: isNetflix ? '#000' : '#fff',
              fontWeight: 700,
              gap: '0.5rem',
            }}
          >
            <FiPlay size={cinematic ? 18 : 14} fill={isNetflix ? '#000' : '#fff'} /> Play
          </button>
          <button
            className="btn-ghost"
            onClick={() => navigate(`/detail/${type}/${item.id}`)}
            style={{
              fontSize: cinematic ? '0.95rem' : '0.88rem',
              padding: cinematic ? '0.7rem 1.5rem' : undefined,
              background: cinematic ? 'rgba(109,109,110,0.7)' : undefined,
              border: cinematic ? 'none' : undefined,
              color: '#fff', fontWeight: 600,
            }}
          >
            <FiInfo size={cinematic ? 18 : 14} /> More Info
          </button>
        </div>
      </div>
    </div>
  )
}
