import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { FiHome, FiSearch, FiGrid, FiSettings, FiChevronRight, FiFilm, FiTv, FiBookmark, FiList, FiMusic, FiMenu } from 'react-icons/fi'
import { useTheme, THEMES } from '../context/ThemeContext'
import { useLibrary } from '../context/LibraryContext'
import { useQueue } from '../context/QueueContext'
import { usePlaylist } from '../context/PlaylistContext'

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
  const { queue } = useQueue()
  const { playlists } = usePlaylist()
  const [query, setQuery] = useState('')
  const [themeOpen, setThemeOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // ── Library item order ──
  const [libOrder, setLibOrder] = useState(loadLibOrder)

  function saveLibOrder(order) {
    setLibOrder(order)
    localStorage.setItem('vt-lib-order', JSON.stringify(order))
  }
  function reorderLib(fromIdx, toIdx) {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= libOrder.length) return
    const next = [...libOrder]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    saveLibOrder(next)
  }

  // ── Desktop drag state ──
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  function onDragStart(e, idx) {
    setDragFrom(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setDragImage(e.currentTarget, 20, 20)
  }
  function onDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(idx)
  }
  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null)
  }
  function onDrop(e, idx) {
    e.preventDefault()
    if (dragFrom !== null) reorderLib(dragFrom, idx)
    setDragFrom(null)
    setDragOver(null)
  }
  function onDragEnd() { setDragFrom(null); setDragOver(null) }

  // ── Mobile: long-press (2s) then drag ──
  const pressTimer = useRef(null)
  const [mobileActive, setMobileActive] = useState(false) // true once long-press fires
  const touchFromIdx = useRef(null)
  const navRef = useRef(null)

  function onTouchStart(e, idx) {
    touchFromIdx.current = idx
    setMobileActive(false)
    pressTimer.current = setTimeout(() => {
      setDragFrom(idx)
      setMobileActive(true)
      navigator.vibrate?.(60)
    }, 2000)
  }

  // touchmove must be non-passive to call preventDefault — attach via ref
  const handleTouchMove = useCallback((e) => {
    if (!mobileActive) { clearTimeout(pressTimer.current); return }
    e.preventDefault()
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const row = el?.closest('[data-lib-idx]')
    if (row) setDragOver(Number(row.dataset.libIdx))
  }, [mobileActive])

  useEffect(() => {
    const el = navRef.current
    if (!el) return
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', handleTouchMove)
  }, [handleTouchMove])

  function onTouchEnd() {
    clearTimeout(pressTimer.current)
    if (mobileActive && dragFrom !== null && dragOver !== null) reorderLib(dragFrom, dragOver)
    setDragFrom(null)
    setDragOver(null)
    setMobileActive(false)
    touchFromIdx.current = null
  }

  // ── Fire TV / Keyboard: hold Enter/Space 2s → move mode, arrow keys to move ──
  const keyTimer = useRef(null)
  const [kbMovingIdx, setKbMovingIdx] = useState(null)

  function onKeyDown(e, idx) {
    // Arrow keys while in move mode
    if (kbMovingIdx !== null) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); reorderLib(kbMovingIdx, kbMovingIdx - 1); setKbMovingIdx(i => i - 1); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); reorderLib(kbMovingIdx, kbMovingIdx + 1); setKbMovingIdx(i => i + 1); return }
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKbMovingIdx(null); return }
    }
    // Start hold timer on Enter/Space (ignore key repeats)
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && kbMovingIdx === null) {
      keyTimer.current = setTimeout(() => {
        setKbMovingIdx(idx)
        navigator.vibrate?.(60)
        keyTimer.current = null
      }, 2000)
    }
  }
  function onKeyUp(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      clearTimeout(keyTimer.current)
      keyTimer.current = null
    }
  }

  // Dismiss kb move mode on click elsewhere
  useEffect(() => {
    if (kbMovingIdx === null) return
    const dismiss = () => setKbMovingIdx(null)
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [kbMovingIdx])

  // ── Badges ──
  const badges = {
    movies:    library.movies.length,
    shows:     library.shows.length,
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
      <div style={{ padding: '1.4rem 1.25rem 0.9rem' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.8rem', color: '#fff', flexShrink: 0 }}>V</div>
          <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
            VAULT<span style={{ color: 'var(--accent)' }}>TV</span>
          </span>
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
      <nav ref={navRef} style={{ flex: 1, padding: '0.5rem 0.5rem 0', overflowY: 'auto' }}>

        {/* Browse */}
        <SectionLabel>Browse</SectionLabel>
        <NavItem to="/"       icon={<FiHome size={14} />}   label="Home"   active={location.pathname === '/'} />
        <NavItem to="/search" icon={<FiSearch size={14} />} label="Search" active={location.pathname === '/search'} />

        {/* My Library — drag-reorderable */}
        <SectionLabel style={{ marginTop: '1rem' }}>My Library</SectionLabel>

        {libOrder.map((id, idx) => {
          const meta = LIB_META[id]
          if (!meta) return null
          const Icon = meta.icon
          const badge = badges[id] || null
          const isActive = location.pathname === meta.to ||
            (id === 'playlists' && location.pathname.startsWith('/playlists'))
          const isDragSrc    = dragFrom === idx
          const isDragTarget = dragOver === idx && dragFrom !== idx
          const isKbMoving   = kbMovingIdx === idx

          return (
            <div
              key={id}
              data-lib-idx={idx}
              draggable
              onDragStart={e => onDragStart(e, idx)}
              onDragOver={e => onDragOver(e, idx)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              onTouchStart={e => onTouchStart(e, idx)}
              onTouchEnd={onTouchEnd}
              onKeyDown={e => onKeyDown(e, idx)}
              onKeyUp={onKeyUp}
              tabIndex={0}
              style={{
                display: 'flex', alignItems: 'center',
                borderRadius: 'var(--radius)', marginBottom: 2,
                opacity: isDragSrc ? 0.35 : 1,
                background: isDragTarget ? 'rgba(124,58,237,0.13)' : isKbMoving ? 'rgba(124,58,237,0.2)' : 'transparent',
                outline: isDragTarget || isKbMoving ? '1px solid var(--accent)' : 'none',
                outlineOffset: -1,
                transition: 'background 0.1s, opacity 0.15s',
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              {/* Drag handle */}
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0.5rem 0 0.5rem 0.45rem',
                color: 'var(--text-secondary)', opacity: 0.35,
                cursor: 'grab', flexShrink: 0,
              }}>
                <FiMenu size={11} />
              </span>

              {/* Nav link — click navigates, drag doesn't */}
              <Link
                to={meta.to}
                draggable={false}
                onClick={e => {
                  // If a drag just happened, swallow the click
                  if (mobileActive) e.preventDefault()
                }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem',
                  padding: '0.5rem 0.75rem 0.5rem 0.3rem',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400, fontSize: '0.86rem',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  textDecoration: 'none',
                  outline: 'none',
                }}
              >
                <span style={{ color: isActive ? 'var(--accent)' : 'inherit', flexShrink: 0 }}>
                  <Icon size={14} />
                </span>
                <span style={{ flex: 1 }}>{meta.label}</span>
                {badge > 0 && (
                  <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>
                    {badge}
                  </span>
                )}
              </Link>
            </div>
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
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.82rem' }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: current?.color, flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{current?.label}</span>
          <FiChevronRight size={13} style={{ color: 'var(--text-secondary)', transform: themeOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
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
