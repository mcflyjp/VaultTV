import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { FiX, FiFilm, FiTv, FiHardDrive, FiFolder, FiChevronRight } from 'react-icons/fi'

export default function LibraryPanel({ onClose }) {
  const { library } = useLibrary()
  const { files: localFiles } = useLocalLibrary()
  const navigate = useNavigate()

  const localMovies = localFiles.filter(f => f.media_type === 'movie')
  const localShows  = localFiles.filter(f => f.media_type === 'tv')
  const savedMovies = library.movies.length
  const savedShows  = library.shows.length

  const totalMovies = new Set([
    ...library.movies.map(m => m.id),
    ...localMovies.filter(f => f.tmdbId).map(f => f.tmdbId),
  ]).size + localMovies.filter(f => !f.tmdbId).length

  const totalShows = new Set([
    ...library.shows.map(s => s.id),
    ...localShows.filter(f => f.tmdbId).map(f => f.tmdbId),
  ]).size + localShows.filter(f => !f.tmdbId).length

  function go(path) { navigate(path); onClose() }

  return (
    <PanelOverlay onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <FiFolder size={18} style={{ color: 'var(--accent)' }} />
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>My Libraries</h2>
        </div>
        <button onClick={onClose} style={closeBtn}><FiX size={18} /></button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '1rem' }}>
        <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Each library tracks your saved titles and local files for that media type.
        </p>

        <LibraryCard
          icon={<FiFilm size={22} style={{ color: '#818cf8' }} />}
          color="#4f46e5"
          title="Movies"
          stats={[
            { label: 'Saved', value: savedMovies },
            { label: 'Local files', value: localMovies.length },
            { label: 'Total', value: totalMovies },
          ]}
          onClick={() => go('/library/movies')}
        />

        <LibraryCard
          icon={<FiTv size={22} style={{ color: '#34d399' }} />}
          color="#059669"
          title="TV Shows"
          stats={[
            { label: 'Saved', value: savedShows },
            { label: 'Local files', value: localShows.length },
            { label: 'Total', value: totalShows },
          ]}
          onClick={() => go('/library/shows')}
        />

        <LibraryCard
          icon={<FiHardDrive size={22} style={{ color: '#94a3b8' }} />}
          color="#64748b"
          title="Local Files"
          stats={[
            { label: 'Movies', value: localMovies.length },
            { label: 'TV episodes', value: localShows.length },
            { label: 'Total', value: localFiles.length },
          ]}
          onClick={() => go('/settings')}
          badge="Manage in Settings"
        />

        {/* Future libraries */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Coming Soon</p>
          <FutureCard label="Gaming Library" sub="ROMs, emulators, cloud gaming" />
        </div>
      </div>
    </PanelOverlay>
  )
}

function LibraryCard({ icon, color, title, stats, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', display: 'block',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '1rem', marginBottom: '0.75rem',
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = color}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {icon}
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</span>
          {badge && <span style={{ fontSize: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>{badge}</span>}
        </div>
        <FiChevronRight size={15} style={{ color: 'var(--text-secondary)' }} />
      </div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        {stats.map(s => (
          <div key={s.label}>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</p>
            <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{s.label}</p>
          </div>
        ))}
      </div>
    </button>
  )
}

function FutureCard({ label, sub }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '0.6rem', opacity: 0.6 }}>
      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.88rem' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub}</p>
    </div>
  )
}

export function PanelOverlay({ onClose, children }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 800, display: 'flex' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />

      {/* Panel slides in from right */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: 360, maxWidth: '92vw',
        background: 'var(--bg-primary)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-16px 0 48px rgba(0,0,0,0.5)',
        animation: 'slideInRight 0.2s ease',
      }}>
        {children}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

const closeBtn = {
  background: 'none', border: 'none', color: 'var(--text-secondary)',
  cursor: 'pointer', padding: '0.25rem', display: 'flex', borderRadius: 4,
}
