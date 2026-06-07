import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { FiPlay, FiX } from 'react-icons/fi'
import { IMG, getDetail } from '../lib/tmdb'

export default function ContinueWatching() {
  const { inProgress, removeFromHistory } = useWatchHistory()
  const navigate = useNavigate()

  if (!inProgress.length) return null

  return (
    <section style={{ marginBottom: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.75rem', marginBottom: '0.75rem' }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
        <h2 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Continue Your Adventure<span style={{ color: 'var(--accent)' }}>...</span>
        </h2>
      </div>

      {/* Horizontal shelf — wider cards with progress bar */}
      <div className="shelf-scroll" style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', padding: '0.25rem 1.75rem 1rem' }}>
        {inProgress.map(item => (
          <ContinueCard
            key={`${item.id}-${item.type}`}
            item={item}
            onPlay={() => navigate(`/detail/${item.type}/${item.id}`)}
            onDismiss={() => removeFromHistory(item.id, item.type)}
          />
        ))}
      </div>
    </section>
  )
}

function ContinueCard({ item, onPlay, onDismiss }) {
  const [poster, setPoster] = useState(
    item.poster || (item.poster_path ? IMG(item.poster_path, 'w342') : null)
  )

  // If poster is missing from the stored entry, fetch it from TMDB
  useEffect(() => {
    if (poster || !item.id || !item.type) return
    getDetail(item.type, item.id)
      .then(d => { if (d?.poster_path) setPoster(IMG(d.poster_path, 'w342')) })
      .catch(() => {})
  }, [item.id, item.type]) // eslint-disable-line react-hooks/exhaustive-deps

  const pct      = Math.round((item.progress || 0) * 100)
  const timeLeft = item.durationSec > 0 && item.progressSec > 0
    ? formatTime(item.durationSec - item.progressSec) + ' left'
    : null

  return (
    <div style={{ flexShrink: 0, width: 160, position: 'relative' }}>
      {/* Dismiss */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss() }}
        title="Remove"
        style={{ position: 'absolute', top: 6, left: 6, zIndex: 10, background: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
      >
        <FiX size={12} />
      </button>

      <div
        onClick={onPlay}
        style={{ borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-card)', cursor: 'pointer', position: 'relative' }}
        className="card-hover"
      >
        {/* Poster */}
        {poster
          ? <img src={poster} alt={item.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>No Image</div>
        }

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
        </div>

        {/* Info */}
        <div style={{ padding: '0.45rem 0.6rem 0.55rem' }}>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            {timeLeft
              ? <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{timeLeft}</span>
              : <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{item.type === 'tv' ? 'Series' : 'Movie'}</span>
            }
            <FiPlay size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTime(sec) {
  if (!sec || sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
