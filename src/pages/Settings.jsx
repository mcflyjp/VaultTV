import { useState } from 'react'
import { useParental } from '../context/ParentalContext'
import { useTheme, THEMES } from '../context/ThemeContext'
import { useLayout } from '../context/LayoutContext'
import { useTrakt } from '../context/TraktContext'
import { FiLock, FiShield, FiSun, FiGrid, FiRadio, FiCheck, FiExternalLink } from 'react-icons/fi'

export default function Settings() {
  const { enabled, maxRating, pin, save, RATING_ORDER } = useParental()
  const { theme, changeTheme } = useTheme()
  const { density, changeDensity } = useLayout()
  const trakt = useTrakt()

  const [form, setForm] = useState({ enabled, maxRating, pin, confirmPin: pin })
  const [pinError, setPinError] = useState('')
  const [saved, setSaved] = useState(false)

  // Trakt credential form
  const [tClientId,     setTClientId]     = useState(trakt.clientId)
  const [tClientSecret, setTClientSecret] = useState(trakt.clientSecret)
  const [credsSaved,    setCredsSaved]    = useState(false)

  function handleCredsSave(e) {
    e.preventDefault()
    trakt.saveCredentials(tClientId, tClientSecret)
    setCredsSaved(true)
    setTimeout(() => setCredsSaved(false), 2000)
  }

  function handleSave(e) {
    e.preventDefault()
    if (form.enabled && form.pin !== form.confirmPin) {
      setPinError('PINs do not match'); return
    }
    if (form.enabled && form.pin.length < 4) {
      setPinError('PIN must be at least 4 digits'); return
    }
    setPinError('')
    save({ enabled: form.enabled, maxRating: form.maxRating, pin: form.pin })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ margin: '0 0 2rem', fontSize: '1.5rem', fontWeight: 700 }}>Settings</h1>

      {/* Theme */}
      <Card title="Appearance" icon={<FiSun />}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 1rem' }}>
          Change the color theme of the entire app.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => changeTheme(t.id)}
              style={{
                padding: '0.5rem 1rem', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '0.88rem',
                border: theme === t.id ? `2px solid ${t.color}` : '2px solid var(--border)',
                background: theme === t.id ? 'var(--bg-card)' : 'transparent',
                color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Layout Density */}
      <Card title="Card Size" icon={<FiGrid />}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 1rem' }}>
          Controls how many cards fit on screen. Comfortable is best for Fire TV remotes.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {[
            { n: 1, label: 'Comfortable', sub: 'Large cards — great for TV' },
            { n: 2, label: 'Default',     sub: 'Balanced for desktop' },
            { n: 3, label: 'Compact',     sub: 'More cards, smaller' },
          ].map(({ n, label, sub }) => (
            <button
              key={n}
              onClick={() => changeDensity(n)}
              style={{
                flex: 1, padding: '0.75rem', borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'left',
                border: density === n ? '2px solid var(--accent)' : '2px solid var(--border)',
                background: density === n ? 'var(--bg-card)' : 'transparent',
                color: 'var(--text-primary)',
              }}
            >
              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.88rem' }}>{label}</p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Parental Controls */}
      <Card title="Parental Controls" icon={<FiShield />}>
        <form onSubmit={handleSave}>
          {/* Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', cursor: 'pointer' }}>
            <div
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              style={{
                width: 44, height: 24, borderRadius: 12, background: form.enabled ? 'var(--accent)' : 'var(--border)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: form.enabled ? 22 : 2, width: 20, height: 20,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontWeight: 600 }}>{form.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>

          {form.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Max rating */}
              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.4rem' }}>Maximum Rating</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {RATING_ORDER.filter(r => r !== 'NR').map(r => (
                    <button
                      key={r} type="button"
                      onClick={() => setForm(f => ({ ...f, maxRating: r }))}
                      style={{
                        padding: '0.35rem 0.85rem', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '0.85rem',
                        border: form.maxRating === r ? '2px solid var(--accent)' : '2px solid var(--border)',
                        background: form.maxRating === r ? 'var(--bg-card)' : 'transparent',
                        color: 'var(--text-primary)',
                      }}
                    >{r}</button>
                  ))}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
                  Content rated above {form.maxRating} will be hidden from search and browsing.
                </p>
              </div>

              {/* PIN */}
              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.4rem' }}>PIN (to temporarily unlock)</label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <input
                    type="password" inputMode="numeric" maxLength={8}
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g,'') }))}
                    placeholder="New PIN"
                    style={{ width: 140, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.55rem 0.75rem' }}
                  />
                  <input
                    type="password" inputMode="numeric" maxLength={8}
                    value={form.confirmPin}
                    onChange={e => setForm(f => ({ ...f, confirmPin: e.target.value.replace(/\D/g,'') }))}
                    placeholder="Confirm PIN"
                    style={{ width: 140, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.55rem 0.75rem' }}
                  />
                </div>
                {pinError && <p style={{ color: '#f87171', fontSize: '0.82rem', margin: '0.4rem 0 0' }}>{pinError}</p>}
              </div>
            </div>
          )}

          <button type="submit" className="btn-accent" style={{ marginTop: '1.5rem' }}>
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </form>
      </Card>

      {/* Trakt */}
      <Card title="Trakt Integration" icon={<FiRadio />}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.6 }}>
          Connect your Trakt account to add your watchlists and custom lists as shelves on the home dashboard.
          You need a free Trakt API app — create one at{' '}
          <a href="https://trakt.tv/oauth/applications/new" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            trakt.tv/oauth/applications/new <FiExternalLink size={11} style={{ verticalAlign: 'middle' }} />
          </a>{' '}
          with redirect URI <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 4, fontSize: '0.82rem' }}>urn:ietf:wg:oauth:2.0:oob</code>.
        </p>

        {/* Credential inputs */}
        {!trakt.connected && (
          <form onSubmit={handleCredsSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <input
                value={tClientId}
                onChange={e => setTClientId(e.target.value)}
                placeholder="Client ID"
                style={{ flex: 1, minWidth: 200, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.55rem 0.75rem', fontSize: '0.85rem', fontFamily: 'monospace' }}
              />
              <input
                value={tClientSecret}
                onChange={e => setTClientSecret(e.target.value)}
                placeholder="Client Secret"
                type="password"
                style={{ flex: 1, minWidth: 200, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.55rem 0.75rem', fontSize: '0.85rem', fontFamily: 'monospace' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <button type="submit" className="btn-ghost" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}>
                {credsSaved ? <><FiCheck size={13} /> Saved</> : 'Save Credentials'}
              </button>
              {trakt.clientId && !trakt.deviceFlow && (
                <button type="button" className="btn-accent" style={{ padding: '0.45rem 1.1rem', fontSize: '0.85rem' }} onClick={trakt.startDeviceAuth}>
                  Connect Trakt Account
                </button>
              )}
            </div>
          </form>
        )}

        {/* Device auth flow — show code */}
        {trakt.deviceFlow && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>Activate on Trakt</p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Go to <a href={trakt.deviceFlow.verificationUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{trakt.deviceFlow.verificationUrl}</a> and enter this code:
            </p>
            <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '0.15em', fontFamily: 'monospace', color: 'var(--accent)', marginBottom: '0.75rem' }}>
              {trakt.deviceFlow.userCode}
            </div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Waiting for activation… (this page will update automatically)
            </p>
            <button onClick={trakt.cancelDeviceAuth} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem' }}>
              Cancel
            </button>
          </div>
        )}

        {trakt.flowError && (
          <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '0 0 1rem' }}>{trakt.flowError}</p>
        )}

        {/* Connected state */}
        {trakt.connected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: '#4ade80', borderRadius: '50%', width: 10, height: 10, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Connected as <span style={{ color: 'var(--accent)' }}>@{trakt.username}</span></span>
              <button onClick={trakt.disconnect} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                Disconnect
              </button>
            </div>

            {trakt.lists.length > 0 && (
              <div>
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Lists</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {[{ id: 'watchlist', name: 'Watchlist' }, ...trakt.lists].map(l => (
                    <div key={l.id} style={{ padding: '0.4rem 0.65rem', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {l.name}
                    </div>
                  ))}
                </div>
                <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Add these as shelves via <strong style={{ color: 'var(--text-primary)' }}>Home → Customize</strong>.
                </p>
              </div>
            )}

            {trakt.lists.length === 0 && (
              <button className="btn-ghost" style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }} onClick={() => trakt.fetchLists()}>
                Refresh Lists
              </button>
            )}
          </div>
        )}
      </Card>

      {/* About */}
      <Card title="About" icon={null}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>VaultTV</strong> — a personal streaming frontend powered by your Stremio add-ons and Real-Debrid.<br />
          Metadata provided by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>The Movie Database (TMDB)</a>.
        </p>
      </Card>
    </div>
  )
}

function Card({ title, icon, children }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', marginBottom: '1.5rem' }}>
      {title && (
        <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {icon} {title}
        </h2>
      )}
      {children}
    </div>
  )
}
