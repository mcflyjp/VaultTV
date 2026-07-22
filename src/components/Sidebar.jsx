import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { FiHome, FiSearch, FiGrid, FiSettings, FiChevronRight, FiFilm, FiTv, FiBookmark, FiList, FiMusic, FiLogOut, FiBookOpen, FiFolder, FiUser, FiMenu, FiX } from 'react-icons/fi'
import { useTheme, THEMES } from '../context/ThemeContext'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { useQueue } from '../context/QueueContext'
import { usePlaylist } from '../context/PlaylistContext'
import LogoIcon from './LogoIcon'
import LibraryPanel from './LibraryPanel'
import ProfilePanel from './ProfilePanel'

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)
const IS_ANDROID = /android/i.test(navigator.userAgent)
// Treat narrow viewports OR Android as mobile (sidebar becomes a drawer)
const IS_MOBILE = IS_ANDROID && !IS_FIRETV

// ── Library item definitions (canonical order) ──
const ALL_LIB_IDS = ['movies', 'shows', 'queue', 'playlists']

const LIB_META = {
  movies:    { label: 'My Movies',   icon: FiFilm,  to: '/library/movies' },
  shows:     { label: 'My TV Shows', icon: FiTv,    to: '/library/shows' },
  queue:     { label: 'Queue',       icon: FiList,  to: '/queue' },
  playlists: { label: 'Playlists',   icon: FiMusic, to: '/playlists' },
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

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
  const asideRef = useRef(null)

  // FireTV: sidebar collapses when focus leaves it, expands on left-edge strip focus
  const [sidebarOpen, setSidebarOpen] = useState(!IS_FIRETV)

  // When sidebar opens on FireTV, focus the first nav item
  useEffect(() => {
    if (IS_FIRETV && sidebarOpen && asideRef.current) {
      setTimeout(() => {
        const first = asideRef.current?.querySelector('a, button')
        first?.focus()
      }, 50)
    }
  }, [sidebarOpen])

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

  // Mobile: render a floating hamburger button; drawer opens as overlay
  if (IS_MOBILE) {
    return (
      <>
        {/* Hamburger trigger — always visible at top-left */}
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          style={{
            position: 'fixed', top: 12, left: 12, zIndex: 600,
            width: 40, height: 40, borderRadius: 8,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-primary)', cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
        >
          <FiMenu size={18} />
        </button>

        {/* Drawer overlay */}
        {mobileOpen && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex' }}
            onClick={e => e.target === e.currentTarget && setMobileOpen(false)}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => setMobileOpen(false)} />
            <SidebarBody
              asideRef={asideRef}
              query={query} setQuery={setQuery}
              handleSearch={handleSearch}
              libOrder={libOrder} badges={badges}
              current={current}
              theme={theme} changeTheme={changeTheme}
              themeOpen={themeOpen} setThemeOpen={setThemeOpen}
              sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
              onClose={() => setMobileOpen(false)}
              onLibrary={() => { setMobileOpen(false); setLibraryOpen(true) }}
              onProfile={() => { setMobileOpen(false); setProfileOpen(true) }}
              style={{ position: 'relative', zIndex: 1 }}
            />
          </div>
        )}

        {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
        {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
      </>
    )
  }

  // FireTV collapsed state — render a thin focusable strip at the left edge.
  // Spatial nav beam will find it when the user presses Left from main content.
  if (IS_FIRETV && !sidebarOpen) {
    return (
      <div
        tabIndex={0}
        aria-label="Open navigation"
        data-sidebar-trigger
        onFocus={() => setSidebarOpen(true)}
        style={{
          width: 4, minWidth: 4, height: '100vh',
          position: 'sticky', top: 0, flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          outline: 'none', cursor: 'default',
        }}
      />
    )
  }

  return (
    <>
      <SidebarBody
        asideRef={asideRef}
        query={query} setQuery={setQuery}
        handleSearch={handleSearch}
        libOrder={libOrder} badges={badges}
        current={current}
        theme={theme} changeTheme={changeTheme}
        themeOpen={themeOpen} setThemeOpen={setThemeOpen}
        sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        onLibrary={() => setLibraryOpen(true)}
        onProfile={() => setProfileOpen(true)}
      />
      {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
      {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
    </>
  )
}

function SidebarBody({
  asideRef, query, setQuery, handleSearch,
  libOrder, badges, current, theme, changeTheme,
  themeOpen, setThemeOpen, sidebarOpen, setSidebarOpen,
  onLibrary, onProfile, onClose, style,
}) {
  const location = useLocation()
  const compact = IS_FIRETV

  return (
    <aside
      ref={asideRef}
      onTouchMove={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onBlur={e => {
        if (IS_FIRETV && !asideRef.current?.contains(e.relatedTarget)) {
          setSidebarOpen(false)
        }
      }}
      style={{
        width: 220, minWidth: 220,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0,
        overflowX: 'hidden', flexShrink: 0,
        ...style,
      }}>
      {/* Logo row + Folder + Profile icons */}
      <div style={{ padding: IS_FIRETV ? '0.4rem 0.75rem' : '0.65rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <Link to="/" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', textDecoration: 'none', flex: 1, minWidth: 0 }}>
          <LogoIcon size={IS_FIRETV ? 28 : 34} />
          <span style={{ fontWeight: 800, fontSize: IS_FIRETV ? '0.95rem' : '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>VaultTV</span>
        </Link>
        {/* Folder (Library) + Profile icon buttons */}
        <button onClick={onLibrary} title="Libraries" style={iconBtn}><FiFolder size={15} /></button>
        <button onClick={onProfile} title="Profile" style={iconBtn}><FiUser size={15} /></button>
        {onClose && <button onClick={onClose} title="Close menu" style={iconBtn}><FiX size={15} /></button>}
      </div>

      {/* Search */}
      <div style={{ padding: compact ? '0 0.75rem 0.4rem' : '0 0.75rem 0.75rem' }}>
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

      {/* Nav — FireTV: no overflow so all items are always in viewport and D-pad findable */}
      <nav style={{ flex: 1, minHeight: 0, padding: compact ? '0.25rem 0.5rem 0' : '0.5rem 0.5rem 0', overflowY: compact ? 'visible' : 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>

        {/* Browse */}
        <SectionLabel>Browse</SectionLabel>
        <NavItem to="/" onClick={onClose}     icon={<FiHome size={14} />}   label="Home"   active={location.pathname === '/'} compact={compact} />
        <NavItem to="/search" onClick={onClose} icon={<FiSearch size={14} />} label="Search" active={location.pathname === '/search'} compact={compact} />

        {/* My Library — static nav items */}
        <SectionLabel style={{ marginTop: compact ? '0.4rem' : '1rem' }}>My Library</SectionLabel>

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
              onClick={onClose}
              icon={<Icon size={14} />}
              label={meta.label}
              active={isActive}
              badge={badge > 0 ? badge : null}
              compact={compact}
            />
          )
        })}

        {/* Manage */}
        <SectionLabel style={{ marginTop: compact ? '0.4rem' : '1rem' }}>Manage</SectionLabel>
        <NavItem to="/addons"   onClick={onClose} icon={<FiGrid size={14} />}     label="Add-ons"  active={location.pathname === '/addons'}   compact={compact} />
        <NavItem to="/guide"    onClick={onClose} icon={<FiBookOpen size={14} />} label="How To"   active={location.pathname === '/guide'}    compact={compact} />
        <NavItem to="/settings" onClick={onClose} icon={<FiSettings size={14} />} label="Settings" active={location.pathname === '/settings'} compact={compact} />
      </nav>

      {/* Exit button — FireTV only */}
      {IS_FIRETV && (
        <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => window.vaulttvBridge?.exitApp()}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)',
              background: 'transparent', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: '0.86rem', fontWeight: 400,
            }}
          >
            <FiLogOut size={14} />
            Exit VaultTV
          </button>
        </div>
      )}

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

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)', padding: '0.3rem',
  borderRadius: 4, display: 'flex', alignItems: 'center',
  transition: 'color 0.15s', flexShrink: 0,
}

function NavItem({ to, icon, label, active, badge, compact, onClick }) {
  return (
    <Link to={to} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: compact ? '0.28rem 0.75rem' : '0.5rem 0.75rem',
      borderRadius: 'var(--radius)',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      background: active ? 'var(--bg-card)' : 'transparent',
      fontSize: compact ? '0.8rem' : '0.86rem', fontWeight: active ? 600 : 400,
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
