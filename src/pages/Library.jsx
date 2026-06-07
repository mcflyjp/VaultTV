import { useParams, useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { IMG } from '../lib/tmdb'
import { FiTrash2, FiPlay, FiFilm, FiTv, FiBookmark } from 'react-icons/fi'

export default function Library() {
  const { section } = useParams() // 'movies' | 'shows' | 'saved'
  const { library, removeFromLibrary } = useLibrary()
  const navigate = useNavigate()

  const items = section === 'movies' ? library.movies
              : section === 'shows'  ? library.shows
              : [...library.movies, ...library.shows].sort((a, b) => b.savedAt - a.savedAt)

  const title = section === 'movies' ? 'My Movies'
              : section === 'shows'  ? 'My TV Shows'
              : 'Saved'

  const icon  = section === 'movies' ? <FiFilm size={20} />
              : section === 'shows'  ? <FiTv size={20} />
              : <FiBookmark size={20} />

  return (
    <div style={{ padding: '2rem 1.75rem', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{title}</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>({items.length})</span>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>{section === 'movies' ? '🎬' : section === 'shows' ? '📺' : '🔖'}</div>
          <p style={{ margin: 0, fontSize: '1rem' }}>Nothing saved yet.</p>
          <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.88rem' }}>
            Open any {section === 'shows' ? 'TV show' : 'movie'} and click the bookmark icon to save it here.
          </p>
          <button className="btn-accent" onClick={() => navigate('/')}>Browse Home</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        {items.map(item => (
          <LibraryCard key={`${item.id}-${item.type}`} item={item} onNavigate={() => navigate(`/detail/${item.type}/${item.id}`)} onRemove={() => removeFromLibrary(item.id, item.type)} />
        ))}
      </div>
    </div>
  )
}

function LibraryCard({ item, onNavigate, onRemove }) {
  const poster = item.poster || IMG(item.poster_path, 'w342')

  return (
    <div style={{ width: 150, position: 'relative' }}>
      <div
        onClick={onNavigate}
        style={{ borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-card)', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative' }}
        className="card-hover"
      >
        {poster
          ? <img src={poster} alt={item.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>No Image</div>
        }
        <div style={{ padding: '0.45rem 0.6rem 0.55rem' }}>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{item.type === 'movie' ? 'Movie' : 'Series'}</p>
        </div>
      </div>
      {/* Remove button */}
      <button
        onClick={e => { e.stopPropagation(); onRemove() }}
        title="Remove from library"
        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex', zIndex: 5 }}
      >
        <FiTrash2 size={12} />
      </button>
    </div>
  )
}
