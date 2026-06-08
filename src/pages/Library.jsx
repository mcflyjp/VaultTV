import { useMemo, useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { useContextMenu } from '../context/ContextMenuContext'
import { useArtwork } from '../context/ArtworkContext'
import { usePlayer } from '../context/PlayerContext'
import { IMG } from '../lib/tmdb'
import { FiTrash2, FiFilm, FiTv, FiBookmark, FiHardDrive, FiAlertCircle, FiArrowUp, FiArrowDown, FiChevronDown, FiFilter, FiX } from 'react-icons/fi'
import MediaCard from '../components/MediaCard'

// TMDB genre ID → display name (combined movie + TV)
const GENRE_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
}

const SORT_OPTIONS = [
  { id: 'title_asc',    label: 'Title (A → Z)',        icon: 'asc'  },
  { id: 'title_desc',   label: 'Title (Z → A)',        icon: 'desc' },
  { id: 'added_desc',   label: 'Date Added (Newest)',   icon: 'desc' },
  { id: 'added_asc',    label: 'Date Added (Oldest)',   icon: 'asc'  },
  { id: 'release_desc', label: 'Release Date (Newest)', icon: 'desc' },
  { id: 'release_asc',  label: 'Release Date (Oldest)', icon: 'asc'  },
  { id: 'rating_desc',  label: 'Rating (Highest)',      icon: 'desc' },
  { id: 'rating_asc',   label: 'Rating (Lowest)',       icon: 'asc'  },
  { id: 'quality_desc', label: 'Quality (Best First)',  icon: 'desc' },
]

function applySort(items, sortId) {
  const arr = [...items]
  switch (sortId) {
    case 'title_asc':    return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    case 'title_desc':   return arr.sort((a, b) => (b.title || '').localeCompare(a.title || ''))
    case 'added_desc':   return arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    case 'added_asc':    return arr.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0))
    case 'release_desc': return arr.sort((a, b) => (b.year || b.release_date || '').localeCompare(a.year || a.release_date || ''))
    case 'release_asc':  return arr.sort((a, b) => (a.year || a.release_date || '').localeCompare(b.year || b.release_date || ''))
    case 'rating_desc':  return arr.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    case 'rating_asc':   return arr.sort((a, b) => (a.vote_average || 0) - (b.vote_average || 0))
    case 'quality_desc': return arr.sort((a, b) => (b._qualityScore || 0) - (a._qualityScore || 0))
    default:             return arr
  }
}

export default function Library() {
  const { section } = useParams() // 'movies' | 'shows' | 'saved'
  const { library, removeFromLibrary } = useLibrary()
  const { files } = useLocalLibrary()
  const navigate = useNavigate()
  const [filter, setFilter]     = useState('all') // 'all' | 'local' | 'saved'
  const [sortId, setSortId]     = useState('title_asc')
  const [genreFilter, setGenreFilter] = useState(null) // genre id number or null
  const [sortOpen, setSortOpen] = useState(false)
  const [genreOpen, setGenreOpen] = useState(false)
  const sortRef  = useRef(null)
  const genreRef = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = e => {
      if (sortRef.current  && !sortRef.current.contains(e.target))  setSortOpen(false)
      if (genreRef.current && !genreRef.current.contains(e.target)) setGenreOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

    // Saved items — add isLocal flag + quality score from best local version
    const savedMerged = savedItems.map(i => {
      const localFile = byTmdbId.get(i.id)
      return {
        ...i,
        _source:       localFile ? 'both' : 'saved',
        _qualityScore: localFile?.qualityScore || 0,
        _qualityLabel: localFile?.qualityLabel || null,
      }
    })

    // Local-only items (not in saved library)
    const localOnly = [...byTmdbId.values()]
      .filter(f => !savedIds.has(f.tmdbId))
      .map(f => ({
        id:            f.tmdbId,
        type:          mediaType,
        title:         f.title,
        poster:        f.poster_path ? `https://image.tmdb.org/t/p/w342${f.poster_path}` : null,
        poster_path:   f.poster_path,
        vote_average:  f.vote_average || 0,
        year:          f.year || '',
        _source:       'local',
        _qualityLabel: f.qualityLabel,
        _qualityScore: f.qualityScore || 0,
        _matched:      f.matched,
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

  // Derive available genres from all items that have genre_ids
  const availableGenres = useMemo(() => {
    const seen = new Set()
    items.forEach(i => (i.genre_ids || []).forEach(gid => {
      if (GENRE_MAP[gid]) seen.add(gid)
    }))
    return [...seen].sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b]))
  }, [items])

  // Apply source filter → genre filter → sort
  const filtered = useMemo(() => {
    let result = items
    if (filter === 'local') result = result.filter(i => i._source === 'local' || i._source === 'both')
    if (filter === 'saved') result = result.filter(i => i._source === 'saved' || i._source === 'both')
    if (genreFilter != null) result = result.filter(i => (i.genre_ids || []).includes(genreFilter))
    return applySort(result, sortId)
  }, [items, filter, genreFilter, sortId])

  const currentSort = SORT_OPTIONS.find(o => o.id === sortId)

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

        {/* Genre filter */}
        {availableGenres.length > 0 && (
          <div ref={genreRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setGenreOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.3rem 0.85rem', borderRadius: 20, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: genreFilter != null ? 'var(--accent)' : 'var(--bg-card)',
                color: genreFilter != null ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.8rem', transition: 'all 0.15s',
              }}
            >
              <FiFilter size={12} />
              {genreFilter != null ? GENRE_MAP[genreFilter] : 'Genre'}
              {genreFilter != null
                ? <FiX size={12} style={{ marginLeft: 2 }} onClick={e => { e.stopPropagation(); setGenreFilter(null) }} />
                : <FiChevronDown size={12} style={{ transform: genreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              }
            </button>
            {genreOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                overflow: 'hidden auto', minWidth: 180, maxHeight: 320,
              }}>
                <button
                  onClick={() => { setGenreFilter(null); setGenreOpen(false) }}
                  style={{ width: '100%', padding: '0.5rem 0.85rem', border: 'none', cursor: 'pointer', textAlign: 'left', background: genreFilter == null ? 'var(--bg-card)' : 'transparent', color: genreFilter == null ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.84rem' }}
                >All Genres</button>
                {availableGenres.map(gid => (
                  <button
                    key={gid}
                    onClick={() => { setGenreFilter(gid); setGenreOpen(false) }}
                    style={{ width: '100%', padding: '0.5rem 0.85rem', border: 'none', cursor: 'pointer', textAlign: 'left', background: genreFilter === gid ? 'var(--bg-card)' : 'transparent', color: genreFilter === gid ? 'var(--accent)' : 'var(--text-primary)', fontSize: '0.84rem' }}
                    onMouseEnter={e => { if (genreFilter !== gid) e.currentTarget.style.background = 'var(--bg-card)' }}
                    onMouseLeave={e => { if (genreFilter !== gid) e.currentTarget.style.background = 'transparent' }}
                  >
                    {GENRE_MAP[gid]}
                    {genreFilter === gid && <span style={{ marginLeft: 'auto', float: 'right', fontSize: '0.7rem', color: 'var(--accent)' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sort dropdown */}
        <div ref={sortRef} style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onClick={() => setSortOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.3rem 0.85rem', borderRadius: 20, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-secondary)', fontSize: '0.8rem',
              transition: 'all 0.15s',
            }}
          >
            {currentSort?.icon === 'asc' ? <FiArrowUp size={13} /> : <FiArrowDown size={13} />}
            {currentSort?.label}
            <FiChevronDown size={12} style={{ transform: sortOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {sortOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              overflow: 'hidden', minWidth: 220,
            }}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { setSortId(opt.id); setSortOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.5rem 0.85rem', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: sortId === opt.id ? 'var(--bg-card)' : 'transparent',
                    color: sortId === opt.id ? 'var(--accent)' : 'var(--text-primary)',
                    fontSize: '0.84rem',
                  }}
                  onMouseEnter={e => { if (sortId !== opt.id) e.currentTarget.style.background = 'var(--bg-card)' }}
                  onMouseLeave={e => { if (sortId !== opt.id) e.currentTarget.style.background = 'transparent' }}
                >
                  {opt.icon === 'asc' ? <FiArrowUp size={13} style={{ flexShrink: 0, opacity: 0.6 }} /> : <FiArrowDown size={13} style={{ flexShrink: 0, opacity: 0.6 }} />}
                  {opt.label}
                  {sortId === opt.id && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--accent)' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
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
  const { getPoster } = useArtwork()
  const { getFileUrl } = useLocalLibrary()
  const { play } = usePlayer()
  const isLocal = item._source === 'local' || item._source === 'both'
  const isUnmatched = item._matched === false && item._source === 'local'
  const canNavigate = item.id && !String(item.id).startsWith('local_')
  // Custom artwork overrides apply to unmatched items too (keyed by local_ id)
  const poster = getPoster(item.id, item.type) || item.poster || IMG(item.poster_path, 'w342')

  // Left-click on unmatched: play the file directly
  async function playUnmatched() {
    if (!item._filename) return
    try {
      const url = await getFileUrl(item._filename)
      play({ url, title: item.title, poster, subtitleTracks: [] })
    } catch (e) { alert('Could not open file: ' + e.message) }
  }

  const handleClick = canNavigate ? onNavigate : (isUnmatched ? playUnmatched : undefined)
  const handleContextMenu = e => { e.preventDefault(); showMenu(item, e.clientX, e.clientY) }

  return (
    <div style={{ width: 150, position: 'relative' }}>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-card)',
          cursor: (canNavigate || isUnmatched) ? 'pointer' : 'default',
          transition: 'transform 0.2s', position: 'relative',
          opacity: isUnmatched ? 0.85 : 1,
        }}
        className={(canNavigate || isUnmatched) ? 'card-hover' : undefined}
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
