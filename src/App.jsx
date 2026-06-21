import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from './context/ThemeContext'
import { useLayout } from './context/LayoutContext'
import Sidebar from './components/Sidebar'
import TopNav, { TOP_NAV_THEMES } from './components/TopNav'
import ContextMenu from './components/ContextMenu'
import VideoPlayer from './components/VideoPlayer'
import Home from './pages/Home'
import Search from './pages/Search'
import Detail from './pages/Detail'
import Settings from './pages/Settings'
import Addons from './pages/Addons'
import Library from './pages/Library'
import Queue from './pages/Queue'
import Playlists from './pages/Playlists'
import Guide from './pages/Guide'
import { FiChevronLeft, FiMaximize, FiMinimize } from 'react-icons/fi'
import { useState, useEffect } from 'react'

const IS_ELECTRON = !!window.electronAPI?.isElectron
const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

export default function App() {
  const { theme } = useTheme()
  const { density } = useLayout()
  const useTopNav = TOP_NAV_THEMES.has(theme)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const navigate = useNavigate()

  // After a theme switch on FireTV, React remounts Sidebar↔TopNav which drops focus.
  // Re-focus the first visible element so D-pad nav recovers automatically.
  useEffect(() => {
    if (!IS_FIRETV) return
    const t = setTimeout(() => {
      if (document.activeElement === document.body || !document.activeElement) {
        const first = Array.from(document.querySelectorAll('a[href], button:not([disabled])'))
          .find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
        if (first) first.focus()
      }
    }, 600)
    return () => clearTimeout(t)
  }, [theme])

  // Global FireTV back handler — navigate router history by default.
  // VideoPlayer / ContinueWatching override this when they're open.
  useEffect(() => {
    if (!IS_FIRETV) return
    window.__vaulttvBack = () => {
      window.history.back()
    }
    // Clean up so VideoPlayer can take over when it mounts
    return () => { window.__vaulttvBack = null }
  }, [navigate])

  useEffect(() => {
    if (!IS_ELECTRON) return
    // Sync initial state
    window.electronAPI.isFullScreen().then(setIsFullScreen)
    // Keep in sync when window state changes
    window.electronAPI.onFullscreenChange(setIsFullScreen)
    // F11 in renderer (backup — globalShortcut in main handles it too)
    const onKey = e => {
      if (e.key === 'F11') { e.preventDefault(); window.electronAPI.toggleFullscreen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      data-theme={theme}
      data-density={density}
      data-layout={useTopNav ? 'top' : 'sidebar'}
      style={{ display: 'flex', flexDirection: useTopNav ? 'column' : 'row', minHeight: '100vh', background: 'var(--bg-primary)' }}
    >
      {!useTopNav && <Sidebar />}
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, position: 'relative' }}>
        {useTopNav && <TopNav />}
        {!useTopNav && <BackButton />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/detail/:type/:id" element={<Detail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/addons" element={<Addons />} />
          <Route path="/library/saved" element={<Navigate to="/library/movies" replace />} />
          <Route path="/library/:section" element={<Library />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlists/:id" element={<Playlists />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ContextMenu />
      <VideoPlayer />

      {/* App fullscreen toggle — Electron only, fixed top-right corner */}
      {IS_ELECTRON && (
        <button
          onClick={() => window.electronAPI.toggleFullscreen()}
          title={isFullScreen ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)'}
          style={{
            position: 'fixed',
            top: 8,
            right: 8,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            padding: '4px 7px',
            display: 'flex',
            alignItems: 'center',
            lineHeight: 1,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.75)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.45)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
        >
          {isFullScreen ? <FiMinimize size={13} /> : <FiMaximize size={13} />}
        </button>
      )}
    </div>
  )
}

function BackButton() {
  const location = useLocation()
  const navigate  = useNavigate()

  // Don't show on Home
  if (location.pathname === '/') return null

  // On detail pages the backdrop sits behind everything — float the button
  // above it using a high z-index so it's always visible
  const isDetail = location.pathname.startsWith('/detail/')

  return (
    <button
      onClick={() => navigate(-1)}
      title="Go back"
      style={{
        position: isDetail ? 'fixed' : 'sticky',
        top: isDetail ? '1.1rem' : 0,
        left: isDetail ? 'calc(220px + 1.1rem)' : 0,
        zIndex: isDetail ? 200 : 10,
        display: 'flex', alignItems: 'center', gap: '0.35rem',
        background: isDetail ? 'rgba(0,0,0,0.65)' : 'var(--bg-secondary)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border)',
        borderRadius: isDetail ? 'var(--radius)' : '0 0 var(--radius) 0',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        padding: isDetail ? '0.45rem 0.85rem' : '0.5rem 1rem',
        fontSize: '0.82rem',
        fontWeight: 500,
        transition: 'color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = isDetail ? 'rgba(0,0,0,0.85)' : 'var(--bg-card)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = isDetail ? 'rgba(0,0,0,0.65)' : 'var(--bg-secondary)' }}
    >
      <FiChevronLeft size={16} /> Back
    </button>
  )
}
