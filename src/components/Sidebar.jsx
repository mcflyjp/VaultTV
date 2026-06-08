import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { FiHome, FiSearch, FiGrid, FiSettings, FiChevronRight, FiFilm, FiTv, FiBookmark, FiList, FiMusic } from 'react-icons/fi'
import { useTheme, THEMES } from '../context/ThemeContext'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { useQueue } from '../context/QueueContext'
import { usePlaylist } from '../context/PlaylistContext'

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

// ── Library item definitions (canonical order) ──
const ALL_LIB_IDS = ['movies', 'shows', 'saved', 'queue', 'playlists']

const LIB_META = {
  movies:    { label: 'My Movies',   icon: FiFilm,     to: '/library/movies' },
  shows:     { label: 'My TV Shows', icon: FiTv,       to: '/library/shows' },
  saved:     { label: 'Saved',       icon: FiBookmark, to: '/library/saved' },
  queue:     { label: 'Queue',       icon: FiList,     to: '/queue' },
  playlists: { label: 'Playlists',   icon: FiMusic,    to: '/playlists' },
}

function loadLibOrder() {
  try {
    const raw = JSON.parse(localStorage.getItem('vt-lib-order') || 'null')
    if (!raw) return ALL_LIB_IDS
    // Merge: keep saved order, append any new ids, drop removed ids
    const merged = raw.filter(id => ALL_LIB_IDS.includes(id))
    for (const id of ALL_LIB_IDS) { if (!merged.includes(id)) merged.push(id) }
    return merged
  } catch { return ALL_LIB_IDS }
}

export default function Sidebar() {
  const { theme, changeTheme } = useTheme()
  const { library } = useLibrary()
  const { files: localFiles } = useLocalLibrary()
  const { queue } = useQueue()
  const { playlists } = usePlaylist()

  // Count unique local titles per type (merged with saved, deduplicated)
  const localMovieIds = new Set(localFiles.filter(f => f.media_type === 'movie' && f.tmdbId).map(f => f.tmdbId))
  const localShowIds  = new Set(localFiles.filter(f => f.media_type === 'tv'    && f.tmdbId).map(f => f.tmdbId))
  const localMovieUnmatched = new Set(localFiles.filter(f => f.media_type === 'movie' && !f.tmdbId).map(f => f.title)).size
  const localShowUnmatched  = new Set(localFiles.filter(f => f.media_type === 'tv'    && !f.tmdbId).map(f => f.title)).size
  const savedMovieIds = new Set(library.movies.map(m => m.id))
  const savedShowIds  = new Set(library.shows.map(s => s.id))
  const totalMovies   = new Set([...savedMovieIds, ...localMovieIds]).size + localMovieUnmatched
  const totalShows    = new Set([...savedShowIds,  ...localShowIds]).size  + localShowUnmatched
  const [query, setQuery] = useState('')
  const [themeOpen, setThemeOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // ── Library item order ──
  const [libOrder, setLibOrder] = useState(loadLibOrder)

  // Drag/reorder removed — My Library items are static nav links

  // ── Badges ──
  const badges = {
    movies:    totalMovies,
    shows:     totalShows,
    saved:     library.movies.length + library.shows.length,
    queue:     queue.length,
    playlists: playlists.length,
  }

  const current = THEMES.find(t => t.id === theme)

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) { navigate(`/search?q=${encodeURIComponent(query.trim())}`); setQuery('') }
  }

  return (
    <aside style={{
      width: 220, minWidth: 220,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
      overflow: 'hidden', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '0.75rem 1rem' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="VaultTV" style={{ width: '100%', height: 'auto', maxHeight: 80, objectFit: 'contain', objectPosition: 'left center' }} />
        </Link>
      </div>

      {/* Search */}
      <div style={{ padding: '0 0.75rem 0.75rem' }}>
        <form onSubmit={handleSearch}>
          <div style={{ position: 'relative' }}>
            <FiSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none', fontSize: '0.8rem' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </form>
      </div>

      <Divider />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.5rem 0.5rem 0', overflowY: 'auto' }}>

        {/* Browse */}
        <SectionLabel>Browse</SectionLabel>
        <NavItem to="/"       icon={<FiHome size={14} />}   label="Home"   active={location.pathname === '/'} />
        <NavItem to="/search" icon={<FiSearch size={14} />} label="Search" active={location.pathname === '/search'} />

        {/* My Library — static nav items */}
        <SectionLabel style={{ marginTop: '1rem' }}>My Library</SectionLabel>

        {libOrder.map(id => {
          const meta = LIB_META[id]
          if (!meta) return null
          const Icon = meta.icon
          const badge = badges[id] || null
          const isActive = location.pathname === meta.to ||
            (id === 'playlists' && location.pathname.startsWith('/playlists'))
          return (
            <NavItem
              key={id}
              to={meta.to}
              icon={<Icon size={14} />}
              label={meta.label}
              active={isActive}
              badge={badge > 0 ? badge : null}
            />
          )
        })}

        {/* Manage */}
        <SectionLabel style={{ marginTop: '1rem' }}>Manage</SectionLabel>
        <NavItem to="/addons"   icon={<FiGrid size={14} />}     label="Add-ons"  active={location.pathname === '/addons'} />
        <NavItem to="/settings" icon={<FiSettings size={14} />} label="Settings" active={location.pathname === '/settings'} />
      </nav>

      {/* Theme picker */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', position: 'relative' }}>
        <button
          onClick={() => setThemeOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: current?.color, flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left', fontSize: '0.82rem' }}>{current?.label}</span>
          <FiChevronRight size={13} style={{ color: 'var(--text-secondary)', transform: themeOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
        </button>

        {themeOpen && (
          <div style={{ position: 'absolute', bottom: 'calc(100% - 0.25rem)', left: '0.75rem', right: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: '0 -8px 32px rgba(0,0,0,0.5)' }}>
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => { changeTheme(t.id); setThemeOpen(false) }}
                style={{ width: '100%', padding: '0.6rem 0.75rem', background: theme === t.id ? 'var(--bg-card)' : 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function NavItem({ to, icon, label, active, badge }) {
  return (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      background: active ? 'var(--bg-card)' : 'transparent',
      fontSize: '0.86rem', fontWeight: active ? 600 : 400,
      transition: 'all 0.15s', marginBottom: '0.1rem',
      borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
      textDecoration: 'none',
    }}>
      <span style={{ color: active ? 'var(--accent)' : 'inherit', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>{badge}</span>
      )}
    </Link>
  )
}

function SectionLabel({ children, style }) {
  return (
    <p style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '0 0.75rem', margin: '0 0 0.3rem', ...style }}>{children}</p>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '0 0.75rem 0.75rem' }} />
}
