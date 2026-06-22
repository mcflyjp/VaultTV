import { useState, useEffect, useRef } from 'react'
import { search } from '../lib/tmdb'
import { IMG } from '../lib/tmdb'
import { FiSearch, FiX, FiFilm, FiTv, FiCheck } from 'react-icons/fi'

export default function TmdbMatchModal({ file, onMatch, onClose }) {
  const [query, setQuery]     = useState(file?.title || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [matched, setMatched] = useState(null) // id of just-matched result
  const inputRef    = useRef(null)
  const debounceRef = useRef(null)
  const backdropRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (query.trim()) doSearch(query)
  }, [])

  function doSearch(q) {
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await search(q)
        setResults((data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 12))
      } catch {}
      setLoading(false)
    }, 350)
  }

  function handleChange(e) {
    setQuery(e.target.value)
    doSearch(e.target.value)
  }

  function handleSelect(result) {
    setMatched(result.id)
    setTimeout(() => { onMatch(result); onClose() }, 400)
  }

  return (
    <div
      ref={backdropRef}
      style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onMouseDown={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 24px 80px rgba(0,0,0,0.8)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>Match to Title</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              File: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.72rem' }}>{file?.filename}</span>
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <FiSearch size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={handleChange}
              placeholder="Search movies & TV shows…"
              style={{
                width: '100%', padding: '0.55rem 0.75rem 0.55rem 2rem',
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }} onWheel={e => e.stopPropagation()}>
          {loading && (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', margin: 0, fontSize: '0.85rem' }}>Searching…</p>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', margin: 0, fontSize: '0.85rem' }}>No results found.</p>
          )}
          {!loading && results.length === 0 && !query.trim() && (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', margin: 0, fontSize: '0.85rem' }}>Type to search TMDB…</p>
          )}
          {results.map(r => {
            const title = r.title || r.name || 'Unknown'
            const year  = (r.release_date || r.first_air_date || '').slice(0, 4)
            const isSelected = matched === r.id
            return (
              <button
                key={r.id}
                onClick={() => handleSelect(r)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.85rem',
                  padding: '0.65rem 1.25rem', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: isSelected ? 'rgba(124,58,237,0.2)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                {/* Poster */}
                <div style={{ width: 40, height: 60, flexShrink: 0, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  {r.poster_path
                    ? <img src={IMG(r.poster_path, 'w92')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                        {r.media_type === 'tv' ? <FiTv size={16} /> : <FiFilm size={16} />}
                      </div>
                  }
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 3 }}>
                    <span style={{ fontSize: '0.68rem', background: r.media_type === 'tv' ? 'rgba(59,130,246,0.2)' : 'rgba(124,58,237,0.2)', color: r.media_type === 'tv' ? '#93c5fd' : '#c4b5fd', borderRadius: 3, padding: '1px 5px', fontWeight: 600, textTransform: 'uppercase' }}>
                      {r.media_type === 'tv' ? 'Series' : 'Movie'}
                    </span>
                    {year && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{year}</span>}
                    {r.vote_average > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>⭐ {r.vote_average.toFixed(1)}</span>}
                  </div>
                  {r.overview && <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.overview}</p>}
                </div>

                {isSelected && <FiCheck size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', flexShrink: 0, textAlign: 'right' }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
