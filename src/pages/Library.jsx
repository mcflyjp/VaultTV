import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { useContextMenu } from '../context/ContextMenuContext'
import { IMG } from '../lib/tmdb'
import { FiTrash2, FiFilm, FiTv, FiBookmark, FiHardDrive, FiAlertCircle } from 'react-icons/fi'
import MediaCard from '../components/MediaCard'

export default function Library() {
  const { section } = useParams() // 'movies' | 'shows' | 'saved'
  const { library, removeFromLibrary } = useLibrary()
  const { files } = useLocalLibrary()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all') // 'all' | 'local' | 'saved'

  // ── Build merged item list ─────────────────────────────────────────────
  const { items, title, icon } = useMemo(() => {
    const mediaType = section === 'movies' ? 'movie' : section === 'shows' ? 'tv' : null

    if (!mediaType) {
      // Saved section — just the bookmark library
      return {
        items: [...library.movies, ...library.shows]
          .sort((a, b) => b.savedAt - a.savedAt)
          .map(i => ({ ...i, _source: 'saved' })),
        title: 'Saved',
        icon: <FiBookmark size={20} />,
      }
    }

    const savedItems = mediaType === 'movie' ? library.movies : library.shows
    const savedIds   = new Set(savedItems.map(i => i.id))

    // Unique local titles for this media type (best quality per tmdbId)
    const byTmdbId  = new Map()
    const unmatched = []

    for (const f of files) {
      if (f.media_type !== mediaType) continue
      if (f.tmdbId) {
        const existing = byTmdbId.get(f.tmdbId)
        if (!existing || (f.qualityScore || 0) > (existing.qualityScore || 0)) {
          byTmdbId.set(f.tmdbId, f)
        }
      } else {
        // Only keep one unmatched entry per filename title
        if (!unmatched.find(u => u.title === f.title)) unmatched.push(f)
      }
    }

    // Saved items — add isLocal flag if they also have a local file
    const savedMerged = savedItems.map(i => ({
      ...i,
      _source: byTmdbId.has(i.id) ? 'both' : 'saved',
    }))

    // Local-only items (not in saved library)
    const localOnly = [...byTmdbId.values()]
      .filter(f => !savedIds.has(f.tmdbId))
      .map(f => ({
        id:          f.tmdbId,
        type:        mediaType,
        title:       f.title,
        poster:      f.poster_path ? `https://image.tmdb.org/t/p/w342${f.poster_path}` : null,
        poster_path: f.poster_path,
        _source:     'local',
        _qualityLabel: f.qualityLabel,
        _matched:    f.matched,
      }))

    // Unmatched local files (no TMDB match found)
    const localUnmatched = unmatched.map(f => ({
      id:       `local_${f.id}`,
      type:     mediaType,
      title:    f.title || f.filename,
      poster:   null,
      _source:  'local',
      _matched: false,
      _filename: f.filename,
    }))

    const merged = [...savedMerged, ...localOnly, ...localUnmatched]

    return {
      items: merged,
      title: mediaType === 'movie' ? 'My Movies' : 'My TV Shows',
      icon:  mediaType === 'movie' ? <FiFilm size={20} /> : <FiTv size={20} />,
    }
  }, [section, library, files])

  // Apply filter
  const filtered = useMemo(() => {
    if (filter === 'local') return items.filter(i => i._source === 'local' || i._source === 'both')
    if (filter === 'saved') return items.filter(i => i._source === 'saved' || i._source === 'both')
    return items
  }, [items, filter])

  const localCount = items.filter(i => i._source === 'local' || i._source === 'both').length
  const savedCount = items.filter(i => i._source === 'saved' || i._source === 'both').length
  const showFilters = section !== 'saved' && (localCount > 0 && savedCount > 0)

  return (
    <div style={{ padding: '2rem 1.75rem', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{title}</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>({filtered.length})</span>

        {/* Filter pills */}
        {showFilters && (
          <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.5rem' }}>
            {[
              { id: 'all',   label: `All (${items.length})` },
              { id: 'local', label: `Local (${localCount})` },
              { id: 'saved', label: `Saved (${savedCount})` },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '0.25rem 0.75rem', borderRadius: 20, cursor: 'pointer',
                  border: '1px solid var(--border)', fontSize: '0.78rem',
                  background: filter === f.id ? 'var(--accent)' : 'transparent',
                  color: filter === f.id ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >{f.label}</button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>
            {section === 'movies' ? '🎬' : section === 'shows' ? '📺' : '🔖'}
          </div>
          <p style={{ margin: 0, fontSize: '1rem' }}>Nothing here yet.</p>
          <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.88rem' }}>
            Save items or add a local folder in Settings → Local Library.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-accent" onClick={() => navigate('/')}>Browse Home</button>
            <button className="btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        {filtered.map(item => (
          <LibraryCard
            key={`${item._source}-${item.id}`}
            item={item}
            onNavigate={() => {
              if (item.id && !String(item.id).startsWith('local_')) {
                navigate(`/detail/${item.type}/${item.id}`)
              }
            }}
            onRemove={item._source === 'saved' || item._source === 'both'
              ? () => removeFromLibrary(item.id, item.type)
              : null
            }
          />
        ))}
      </div>
    </div>
  )
}

function LibraryCard({ item, onNavigate, onRemove }) {
  const { show: showMenu } = useContextMenu()
  const poster = item.poster || IMG(item.poster_path, 'w342')
  const isLocal = item._source === 'local' || item._source === 'both'
  const isUnmatched = item._matched === false && item._source === 'local'
  const canNavigate = item.id && !String(item.id).startsWith('local_')

  return (
    <div style={{ width: 150, position: 'relative' }}>
      <div
        onClick={canNavigate ? onNavigate : undefined}
        onContextMenu={canNavigate ? e => { e.preventDefault(); showMenu(item, e.clientX, e.clientY) } : undefined}
        style={{
          borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-card)',
          cursor: canNavigate ? 'pointer' : 'default',
          transition: 'transform 0.2s', position: 'relative',
          opacity: isUnmatched ? 0.7 : 1,
        }}
        className={canNavigate ? 'card-hover' : undefined}
      >
        {poster
          ? <img src={poster} alt={item.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '0.5rem', textAlign: 'center' }}>
              <FiHardDrive size={24} style={{ opacity: 0.4 }} />
              <span style={{ opacity: 0.7, lineHeight: 1.3 }}>{item.title}</span>
            </div>
        }

        {/* Badges */}
        <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {isLocal && (
            <div style={{ background: '#16a34a', borderRadius: 4, padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', fontWeight: 700, color: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
              <FiHardDrive size={8} /> LOCAL
            </div>
          )}
          {isUnmatched && (
            <div style={{ background: 'rgba(251,191,36,0.9)', borderRadius: 4, padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', fontWeight: 700, color: '#000', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
              <FiAlertCircle size={8} /> NO MATCH
            </div>
          )}
          {item._qualityLabel && (
            <div style={{ background: 'rgba(0,0,0,0.75)', borderRadius: 4, padding: '2px 5px', fontSize: '0.6rem', fontWeight: 600, color: '#fff' }}>
              {item._qualityLabel}
            </div>
          )}
        </div>

        <div style={{ padding: '0.45rem 0.6rem 0.55rem' }}>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {item.type === 'movie' ? 'Movie' : 'Series'}
            {item._source === 'both' ? ' · Saved + Local' : isLocal ? ' · Local' : ''}
          </p>
        </div>
      </div>

      {/* Remove from saved-library button */}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Remove from library"
          style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex', zIndex: 5 }}
        >
          <FiTrash2 size={12} />
        </button>
      )}
    </div>
  )
}
