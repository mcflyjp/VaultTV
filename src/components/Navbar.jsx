import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { FiSearch, FiSettings, FiGrid, FiHome } from 'react-icons/fi'
import { useTheme, THEMES } from '../context/ThemeContext'

export default function Navbar() {
  const { theme, changeTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [themeOpen, setThemeOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery('')
    }
  }

  const current = THEMES.find(t => t.id === theme)

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'linear-gradient(to bottom, var(--bg-primary) 70%, transparent)',
      borderBottom: '1px solid var(--border)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 1.5rem', height: 60, display: 'flex', alignItems: 'center', gap: '1.5rem' }}>

        {/* Logo */}
        <Link to="/" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <img src="/logo.png" alt="VaultTV" style={{ height: 36, width: 'auto' }} />
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <NavLink to="/" icon={<FiHome />} label="Home" active={location.pathname === '/'} />
          <NavLink to="/addons" icon={<FiGrid />} label="Add-ons" active={location.pathname === '/addons'} />
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
            <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search movies & shows…"
              style={{
                width: '100%', paddingLeft: 38, paddingRight: 16, paddingTop: 8, paddingBottom: 8,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
              }}
            />
          </div>
        </form>

        {/* Theme picker */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setThemeOpen(o => !o)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '0.4rem 0.8rem',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: current?.color, display: 'inline-block' }} />
            {current?.label}
          </button>
          {themeOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', overflow: 'hidden', minWidth: 160,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { changeTheme(t.id); setThemeOpen(false) }}
                  style={{
                    width: '100%', padding: '0.65rem 1rem', background: theme === t.id ? 'var(--bg-card)' : 'transparent',
                    border: 'none', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
                    fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, display: 'inline-block', flexShrink: 0 }} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Settings */}
        <Link to="/settings" style={{ color: location.pathname === '/settings' ? 'var(--accent)' : 'var(--text-secondary)', padding: '0.4rem', display: 'flex' }}>
          <FiSettings size={20} />
        </Link>
      </div>
    </nav>
  )
}

function NavLink({ to, icon, label, active }) {
  return (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.35rem 0.75rem', borderRadius: 'var(--radius)',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      background: active ? 'var(--bg-card)' : 'transparent',
      fontSize: '0.88rem', fontWeight: active ? 600 : 400, transition: 'all 0.15s',
    }}>
      {icon} {label}
    </Link>
  )
}
