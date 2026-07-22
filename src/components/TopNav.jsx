import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme, THEMES } from '../context/ThemeContext'
import { useLibrary } from '../context/LibraryContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { FiSearch, FiSettings, FiChevronDown, FiLogOut, FiFolder, FiUser } from 'react-icons/fi'
import LogoIcon from './LogoIcon'
import LibraryPanel from './LibraryPanel'
import ProfilePanel from './ProfilePanel'

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

// Themes that use the top nav layout (no sidebar)
export const TOP_NAV_THEMES = new Set(['vaultflix', 'vaultplus'])

export default function TopNav() {
  const { theme, changeTheme } = useTheme()
  const { library } = useLibrary()
  const { files: localFiles } = useLocalLibrary()
  const navigate = useNavigate()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const searchRef = useRef(null)
  const themeRef = useRef(null)

  useEffect(() => {
    const el = document.querySelector('main')
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > 40)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handler = e => {
      if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isVaultflix = theme === 'vaultflix'
  const isVaultPlus = theme === 'vaultplus'

  const navBg = scrolled
    ? isVaultflix ? 'rgba(20,20,20,0.98)' : 'rgba(4,7,20,0.98)'
    : isVaultflix ? 'linear-gradient(to bottom, rgba(20,20,20,0.9) 0%, transparent 100%)'
                  : 'linear-gradient(to bottom, rgba(4,7,20,0.95) 0%, transparent 100%)'

  const links = isVaultPlus
    ? [
        { label: 'Home',       path: '/' },
        { label: 'Movies',     path: '/library/movies' },
        { label: 'Series',     path: '/library/shows' },
      ]
    : [
        { label: 'Home',       path: '/' },
        { label: 'TV Shows',   path: '/library/shows' },
        { label: 'Movies',     path: '/library/movies' },
      ]

  const VAULT_PLUS_BRANDS = ['All', 'Disney', 'Pixar', 'Marvel', 'Star Wars', 'Nat Geo']

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 500, width: '100%' }}>
    <nav style={{
      width: '100%',
      background: navBg,
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      transition: 'background 0.3s, backdrop-filter 0.3s',
      display: 'flex', alignItems: 'center',
      padding: '0 3rem',
      height: 68,
      borderBottom: (scrolled && !isVaultPlus) ? '1px solid rgba(255,255,255,0.06)' : 'none',
    }}>

      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '2rem', flexShrink: 0, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
      >
        <LogoIcon size={36} />
        <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>VaultTV</span>
      </button>

      {/* Nav links */}
      <div style={{ display: 'flex', gap: '0.25rem', flex: 1 }}>
        {links.map(link => {
          const active = location.pathname === link.path ||
            (link.path !== '/' && location.pathname.startsWith(link.path))
          return (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: isVaultflix ? '0.3rem 0.6rem' : '0.4rem 0.75rem',
                borderRadius: 4,
                fontSize: isVaultflix ? '0.82rem' : '0.88rem',
                fontWeight: active ? 700 : (isVaultflix ? 400 : 500),
                color: active ? '#fff' : (isVaultflix ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.65)'),
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = isVaultflix ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.65)' }}
            >{link.label}</button>
          )
        })}
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>

        {/* Search */}
        <div ref={searchRef} style={{ position: 'relative' }}>
          {searchOpen ? (
            <input
              autoFocus
              placeholder="Search…"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  navigate(`/search?q=${encodeURIComponent(e.target.value.trim())}`)
                  setSearchOpen(false)
                }
                if (e.key === 'Escape') setSearchOpen(false)
              }}
              style={{
                background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff', borderRadius: 4, padding: '0.35rem 0.75rem',
                fontSize: '0.88rem', width: 220, outline: 'none',
              }}
            />
          ) : (
            <button onClick={() => setSearchOpen(true)} style={iconBtn}><FiSearch size={18} /></button>
          )}
        </div>

        {/* Theme picker */}
        <div ref={themeRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setThemeOpen(o => !o)}
            style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.6rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}
          >
            Theme <FiChevronDown size={13} style={{ transform: themeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {themeOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              background: isVaultflix ? 'rgba(20,20,20,0.98)' : 'rgba(4,7,20,0.98)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
              overflow: 'hidden', minWidth: 160, zIndex: 600,
            }}>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { changeTheme(t.id); setThemeOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.5rem 0.85rem', border: 'none', cursor: 'pointer',
                    background: theme === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: theme === t.id ? '#fff' : 'rgba(255,255,255,0.65)',
                    fontSize: '0.84rem', textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = theme === t.id ? 'rgba(255,255,255,0.1)' : 'transparent' }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Library + Profile */}
        <button onClick={() => setLibraryOpen(true)} title="Libraries" style={iconBtn}><FiFolder size={18} /></button>
        <button onClick={() => setProfileOpen(true)} title="Profile" style={iconBtn}><FiUser size={18} /></button>

        {/* Settings */}
        <button onClick={() => navigate('/settings')} style={iconBtn}><FiSettings size={18} /></button>

        {/* Exit — FireTV only */}
        {IS_FIRETV && (
          <button
            onClick={() => window.vaulttvBridge?.exitApp()}
            style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}
          >
            <FiLogOut size={16} /> Exit
          </button>
        )}
      </div>
    </nav>

    {/* Vault+ brand bar — shown only in vaultplus theme */}
    {isVaultPlus && (
      <div className="vaultplus-brand-bar">
        {VAULT_PLUS_BRANDS.map(brand => (
          <button key={brand} className="no-pop">{brand}</button>
        ))}
      </div>
    )}
    {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
    {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
    </div>
  )
}

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'rgba(255,255,255,0.75)', padding: '0.4rem',
  borderRadius: 4, display: 'flex', alignItems: 'center',
  transition: 'color 0.15s',
}
