import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import {
  FiX, FiFilm, FiTv, FiFolder, FiChevronRight, FiChevronDown,
  FiRefreshCw, FiPlus, FiTrash2, FiCloud, FiExternalLink,
} from 'react-icons/fi'
import { MdOutlineGamepad } from 'react-icons/md'

export default function LibraryPanel({ onClose }) {
  const { library } = useLibrary()
  const { files: localFiles, sources, addSource, removeSource, rescanSource, scanning, error } = useLocalLibrary()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState('movies') // which card is expanded
  const [rescanningId, setRescanningId] = useState(null)

  const localMovies = localFiles.filter(f => f.media_type === 'movie')
  const localShows  = localFiles.filter(f => f.media_type === 'tv')
  const movieSources = sources.filter(s => s.type === 'movie')
  const showSources   = sources.filter(s => s.type === 'tv')

  const totalMovies = new Set([
    ...library.movies.map(m => m.id),
    ...localMovies.filter(f => f.tmdbId).map(f => f.tmdbId),
  ]).size + localMovies.filter(f => !f.tmdbId).length

  const totalShows = new Set([
    ...library.shows.map(s => s.id),
    ...localShows.filter(f => f.tmdbId).map(f => f.tmdbId),
  ]).size + localShows.filter(f => !f.tmdbId).length

  function go(path) { navigate(path); onClose() }

  async function handleRescan(id) {
    setRescanningId(id)
    try { await rescanSource(id) } finally { setRescanningId(null) }
  }

  function toggle(key) {
    setExpanded(prev => prev === key ? null : key)
  }

  return (
    <PanelOverlay onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <FiFolder size={18} style={{ color: 'var(--accent)' }} />
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Your Libraries</h2>
        </div>
        <button onClick={onClose} style={closeBtn}><FiX size={18} /></button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '1rem' }}>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.76rem', color: '#f87171' }}>
            {error}
          </div>
        )}

        <LibraryCard
          expanded={expanded === 'movies'}
          onToggle={() => toggle('movies')}
          icon={<FiFilm size={20} style={{ color: '#818cf8' }} />}
          color="#4f46e5"
          title="Movies"
          stats={[
            { label: 'Saved', value: library.movies.length },
            { label: 'Local', value: localMovies.length },
            { label: 'Total', value: totalMovies },
          ]}
          onOpen={() => go('/library/movies')}
        >
          <SourceList
            sources={movieSources}
            onRescan={handleRescan}
            onRemove={removeSource}
            rescanningId={rescanningId}
            scanning={scanning}
          />
          <AddFolderButton onClick={() => addSource('movie')} label="Add movie folder" />
        </LibraryCard>

        <LibraryCard
          expanded={expanded === 'shows'}
          onToggle={() => toggle('shows')}
          icon={<FiTv size={20} style={{ color: '#34d399' }} />}
          color="#059669"
          title="TV Shows"
          stats={[
            { label: 'Saved', value: library.shows.length },
            { label: 'Local', value: localShows.length },
            { label: 'Total', value: totalShows },
          ]}
          onOpen={() => go('/library/shows')}
        >
          <SourceList
            sources={showSources}
            onRescan={handleRescan}
            onRemove={removeSource}
            rescanningId={rescanningId}
            scanning={scanning}
          />
          <AddFolderButton onClick={() => addSource('tv')} label="Add TV show folder" />
        </LibraryCard>

        {/* Gaming */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Gaming</p>
          <GamingRow
            icon={<FiCloud size={18} style={{ color: '#16a34a' }} />}
            title="Xbox Cloud Gaming"
            sub="Stream Xbox games in your browser"
            onClick={() => window.open('https://www.xbox.com/play', '_blank')}
          />
          <GamingRow
            icon={<MdOutlineGamepad size={18} style={{ color: '#0ea5e9' }} />}
            title="PlayStation (PXPlay)"
            sub="Remote play your PS4 / PS5"
            onClick={() => launchPXPlay()}
          />
          <div style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: 10, padding: '0.7rem 0.85rem', marginTop: '0.4rem', opacity: 0.55 }}>
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600 }}>Local ROM library</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Coming soon — emulation + remote play</p>
          </div>
        </div>
      </div>
    </PanelOverlay>
  )
}

/** Launch PXPlay via Android Intent if installed; otherwise open the Play Store listing */
function launchPXPlay() {
  const IS_ANDROID = /android/i.test(navigator.userAgent)
  if (IS_ANDROID) {
    // intent:// URI triggers the installed app, falls back to Play Store via S.browser_fallback_url
    window.location.href =
      'intent://#Intent;package=psplay.grill.com;scheme=psplay;S.browser_fallback_url=' +
      encodeURIComponent('https://play.google.com/store/apps/details?id=psplay.grill.com') +
      ';end'
  } else {
    window.open('https://play.google.com/store/apps/details?id=psplay.grill.com', '_blank')
  }
}

function LibraryCard({ icon, color, title, stats, onOpen, expanded, onToggle, children }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, marginBottom: '0.75rem', overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{ padding: '1rem', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {icon}
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              onClick={e => { e.stopPropagation(); onOpen() }}
              title="Open library"
              style={{ ...iconBtn, color: 'var(--text-secondary)' }}
            >
              <FiChevronRight size={15} />
            </button>
            {expanded ? <FiChevronDown size={15} style={{ color: 'var(--text-secondary)' }} /> : <FiChevronRight size={15} style={{ color: 'var(--text-secondary)', transform: 'rotate(90deg)' }} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {stats.map(s => (
            <div key={s.label}>
              <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 1rem 1rem' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function SourceList({ sources, onRescan, onRemove, rescanningId, scanning }) {
  if (!sources.length) {
    return <p style={{ margin: '0 0 0.6rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>No folders added yet.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
      {sources.map(s => {
        const isRescanning = rescanningId === s.id && scanning
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '0.5rem 0.65rem',
          }}>
            <FiFolder size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || s.dirName}</p>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                {s.fileCount ?? 0} file{s.fileCount === 1 ? '' : 's'}
                {s.scannedAt && ` · scanned ${new Date(s.scannedAt).toLocaleDateString()}`}
              </p>
            </div>
            <button
              onClick={() => onRescan(s.id)}
              disabled={isRescanning}
              title="Rescan"
              style={{ ...iconBtn, color: 'var(--accent)' }}
            >
              <FiRefreshCw size={13} style={{ animation: isRescanning ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={() => onRemove(s.id)}
              title="Remove folder"
              style={{ ...iconBtn, color: '#f87171' }}
            >
              <FiTrash2 size={13} />
            </button>
          </div>
        )
      })}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function AddFolderButton({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
        padding: '0.55rem', borderRadius: 8,
        background: 'transparent', border: '1px dashed var(--border)',
        color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
      }}
    >
      <FiPlus size={14} /> {label}
    </button>
  )
}

function GamingRow({ icon, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.65rem',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '0.75rem 0.85rem', marginBottom: '0.5rem',
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{title}</p>
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{sub}</p>
      </div>
      <FiExternalLink size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
    </button>
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
        width: 380, maxWidth: '92vw',
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

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '0.3rem', display: 'flex', alignItems: 'center', borderRadius: 4, flexShrink: 0,
}
