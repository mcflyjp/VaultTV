import { useState } from 'react'

const IS_ELECTRON = !!window.electronAPI?.isElectron
const IS_FIRETV   = /VaultTV-FireTV/i.test(navigator.userAgent)

/** Open a link in the system browser. Works in both Electron and web. */
function openLink(url) {
  if (IS_ELECTRON) { window.electronAPI.openExternal(url) }
  else { window.open(url, '_blank', 'noopener,noreferrer') }
}
import { useParental } from '../context/ParentalContext'
import { useTheme, THEMES } from '../context/ThemeContext'
import { useLayout } from '../context/LayoutContext'
import { useTrakt } from '../context/TraktContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { useAuth } from '../context/AuthContext'
import { useAddons } from '../context/AddonsContext'
import { useLanguage } from '../context/LanguageContext'
import { FiLock, FiShield, FiSun, FiGrid, FiRadio, FiCheck, FiExternalLink, FiFolder, FiRefreshCw, FiTrash2, FiHardDrive, FiFilm, FiTv, FiPlus, FiWifi, FiWifiOff, FiUser, FiLogOut, FiLogIn, FiCloud, FiGlobe } from 'react-icons/fi'

export default function Settings() {
  const { enabled, maxRating, pin, save, RATING_ORDER } = useParental()
  const { theme, changeTheme } = useTheme()
  const { density, changeDensity } = useLayout()
  const trakt = useTrakt()
  const local = useLocalLibrary()
  const auth  = useAuth()
  const lang  = useLanguage()
  const { syncing, syncError } = useAddons()

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

      {/* Language Preferences */}
      <Card title="Language Preferences" icon={<FiGlobe />}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
          Set your preferred subtitle and audio language. The player will automatically select matching
          tracks when available. If no subtitles are found in a stream, VaultTV will download them
          automatically from OpenSubtitles (requires the companion server to be running).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Subtitle language */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Preferred Subtitle Language
            </label>
            <select
              value={lang.subLang}
              onChange={e => lang.savePrefs({ subLang: e.target.value })}
              style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                padding: '0.55rem 0.85rem', fontSize: '0.88rem', cursor: 'pointer', minWidth: 200,
              }}
            >
              {lang.LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
              When streams include multiple subtitle tracks, the matching language is selected automatically.
            </p>
          </div>

          {/* Audio language */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Preferred Audio Language
            </label>
            <select
              value={lang.audioLang}
              onChange={e => lang.savePrefs({ audioLang: e.target.value })}
              style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                padding: '0.55rem 0.85rem', fontSize: '0.88rem', cursor: 'pointer', minWidth: 200,
              }}
            >
              <option value="">No preference</option>
              {lang.LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
              Applies to HLS streams with multiple audio tracks (e.g. dubbed vs. original).
            </p>
          </div>

          {/* Auto-fetch toggle */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <div
                onClick={() => lang.savePrefs({ autoFetchSubs: !lang.autoFetchSubs })}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: lang.autoFetchSubs ? 'var(--accent)' : 'var(--border)',
                  position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: lang.autoFetchSubs ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                }} />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>
                  Auto-download subtitles
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  When a stream has no built-in subtitles, automatically fetch them from OpenSubtitles.org
                  in your preferred language via the companion server.
                </p>
              </div>
            </label>
          </div>
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

      {/* Local Library */}
      <Card title="Local Library" icon={<FiHardDrive />}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
          Add folders for your local media. Separate your Movies and TV Shows so VaultTV matches
          metadata correctly. You can add as many folders as you like.
        </p>

        {/* Scan progress */}
        {local.scanning && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              <span>Scanning "{local.progress.label}"…</span>
              <span>{local.progress.done} / {local.progress.total}</span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: 'var(--accent)', borderRadius: 2,
                width: local.progress.total > 0 ? `${(local.progress.done / local.progress.total) * 100}%` : '5%',
                transition: 'width 0.2s',
              }} />
            </div>
          </div>
        )}

        {local.error && <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '0 0 1rem' }}>{local.error}</p>}

        {/* Source list */}
        {local.sources.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {local.sources.map(src => {
              const srcFiles = local.files.filter(f => f.sourceId === src.id)
              const matched  = srcFiles.filter(f => f.matched).length
              return (
                <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  {/* Type icon */}
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: src.type === 'movie' ? 'rgba(124,58,237,0.2)' : 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {src.type === 'movie'
                      ? <FiFilm size={15} style={{ color: 'var(--accent)' }} />
                      : <FiTv   size={15} style={{ color: '#3b82f6' }} />
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.dirName}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                      {src.type === 'movie' ? 'Movies' : 'TV Shows'} · {srcFiles.length} files · {matched} matched
                      {src.scannedAt && ` · ${new Date(src.scannedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  {/* Actions */}
                  <button
                    onClick={() => local.rescanSource(src.id)}
                    disabled={local.scanning}
                    title="Rescan"
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem 0.5rem', display: 'flex', alignItems: 'center' }}
                  >
                    <FiRefreshCw size={13} />
                  </button>
                  <button
                    onClick={() => local.removeSource(src.id)}
                    title="Remove"
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem 0.5rem', display: 'flex', alignItems: 'center' }}
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add folder buttons — hidden on FireTV (no File System Access API) */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: local.sources.length > 0 ? '1rem' : 0 }}>
          {!IS_FIRETV && (<>
          <button
            className="btn-accent"
            onClick={() => local.addSource('movie')}
            disabled={local.scanning}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <FiPlus size={14} /><FiFilm size={14} /> Add Movies Folder
          </button>
          <button
            className="btn-accent"
            onClick={() => local.addSource('tv')}
            disabled={local.scanning}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#3b82f6' }}
          >
            <FiPlus size={14} /><FiTv size={14} /> Add TV Shows Folder
          </button>
          {!IS_ELECTRON && local.sources.length > 0 && !local.hasHandles && (
            <button
              className="btn-ghost"
              onClick={local.reGrantAll}
              style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <FiRefreshCw size={13} /> Re-grant Access
            </button>
          )}
          </>)}
          {local.sources.length > 0 && (
            <button
              onClick={local.clearAll}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <FiTrash2 size={13} /> Clear All
            </button>
          )}
        </div>

        {/* File list preview — collapsed per source */}
        {local.sources.map(src => {
          const srcFiles = local.files.filter(f => f.sourceId === src.id)
          if (!srcFiles.length || local.scanning) return null
          return (
            <details key={src.id} style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', userSelect: 'none', marginBottom: '0.4rem' }}>
                {src.dirName} ({srcFiles.filter(f => f.matched).length}/{srcFiles.length} matched)
              </summary>
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem' }}>
                {srcFiles.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0.5rem', background: 'var(--bg-secondary)', borderRadius: 6, border: `1px solid ${f.matched ? 'var(--border)' : 'rgba(251,191,36,0.3)'}` }}>
                    {f.poster_path
                      ? <img src={`https://image.tmdb.org/t/p/w45${f.poster_path}`} alt="" style={{ width: 24, height: 36, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                      : <div style={{ width: 24, height: 36, background: 'var(--border)', borderRadius: 3, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</p>
                      <p style={{ margin: '1px 0 0', fontSize: '0.68rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</p>
                    </div>
                    {!f.matched && <span style={{ fontSize: '0.65rem', color: '#fbbf24', flexShrink: 0 }}>unmatched</span>}
                  </div>
                ))}
              </div>
            </details>
          )
        })}

        {/* Companion server status */}
        <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', border: `1px solid ${local.companionOnline ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ marginTop: 2, color: local.companionOnline ? '#4ade80' : 'var(--text-secondary)', flexShrink: 0 }}>
            {local.companionOnline ? <FiWifi size={16} /> : <FiWifiOff size={16} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.85rem', color: local.companionOnline ? '#4ade80' : 'var(--text-secondary)' }}>
              Companion Server — {local.companionOnline ? 'Online' : 'Offline'}
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {local.companionOnline
                ? 'Auto-sync is active. VaultTV will prompt you to rescan when new files are detected in your folders.'
                : IS_ELECTRON
                  ? 'The companion server starts automatically with the app. If it stays offline, try restarting VaultTV.'
                  : IS_FIRETV
                    ? 'Enter your PC\'s LAN IP below so the FireTV can reach the companion server.'
                    : <>
                        Auto-sync is unavailable. Run <code style={{ background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4 }}>cd companion &amp;&amp; npm install &amp;&amp; node server.js</code> in the VaultTV folder to enable it. Stop it any time — the library keeps working.
                      </>
              }
            </p>
            {/* Companion host override — shown on FireTV or when loaded from hosted URL */}
            {(IS_FIRETV || !['localhost', '127.0.0.1'].includes(window.location.hostname) && !window.location.hostname.match(/^192\.|^10\.|^172\./)) && (
              <CompanionHostInput />
            )}
          </div>
        </div>

        {!IS_ELECTRON && !IS_FIRETV && !window.showDirectoryPicker && (
          <p style={{ color: '#fbbf24', fontSize: '0.82rem', margin: '1rem 0 0' }}>
            ⚠ Your browser doesn't support folder access. Use Chrome or Edge.
          </p>
        )}
        {IS_FIRETV && (
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', margin: '0.75rem 0 0', lineHeight: 1.5 }}>
            ℹ Local library folders are added from the desktop app or browser. Once scanned, your library syncs here automatically via the cloud.
          </p>
        )}
      </Card>

      {/* Trakt */}
      <Card title="Trakt Integration" icon={<FiRadio />}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.6 }}>
          Connect your Trakt account to add your watchlists and custom lists as shelves on the home dashboard.
          You need a free Trakt API app — create one at{' '}
          <a
            href="https://trakt.tv/oauth/applications/new"
            onClick={e => { e.preventDefault(); openLink('https://trakt.tv/oauth/applications/new') }}
            style={{ color: 'var(--accent)', cursor: 'pointer' }}
          >
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
              Go to{' '}
              <a
                href={trakt.deviceFlow.verificationUrl}
                onClick={e => { e.preventDefault(); openLink(trakt.deviceFlow.verificationUrl) }}
                style={{ color: 'var(--accent)', cursor: 'pointer' }}
              >
                {trakt.deviceFlow.verificationUrl}
              </a>{' '}
              and enter this code:
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

      {/* Account / Cloud Sync */}
      <Card title="Account & Cloud Sync" icon={<FiCloud />}>
        {auth.loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>Loading…</p>
        ) : auth.user ? (
          <AccountPanel user={auth.user} signOut={auth.signOut} syncing={syncing} syncError={syncError} />
        ) : (
          <LoginPanel signInWithEmail={auth.signInWithEmail} signUpWithEmail={auth.signUpWithEmail} signInWithGoogle={auth.signInWithGoogle} />
        )}
      </Card>

      {/* About */}
      <Card title="About" icon={null}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>VaultTV</strong> — a personal streaming frontend powered by your Stremio add-ons and Real-Debrid.<br />
          Metadata provided by{' '}
          <a
            href="https://www.themoviedb.org"
            onClick={e => { e.preventDefault(); openLink('https://www.themoviedb.org') }}
            style={{ color: 'var(--accent)', cursor: 'pointer' }}
          >
            The Movie Database (TMDB)
          </a>.
        </p>
      </Card>
    </div>
  )
}

function CompanionHostInput() {
  const [val, setVal] = useState(() => localStorage.getItem('vt-companion-host') || '')
  const [saved, setSaved] = useState(false)
  function save() {
    localStorage.setItem('vt-companion-host', val.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  return (
    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        data-card
        tabIndex={0}
        type="text"
        placeholder="192.168.1.xxx  (your PC's LAN IP)"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        style={{
          flex: 1, minWidth: 200, padding: '0.4rem 0.7rem',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontSize: '0.82rem',
        }}
      />
      <button
        data-card
        tabIndex={0}
        onClick={save}
        style={{
          padding: '0.4rem 0.85rem', background: saved ? '#16a34a' : 'var(--accent)',
          border: 'none', borderRadius: 'var(--radius)', color: '#fff',
          cursor: 'pointer', fontSize: '0.82rem', transition: 'background 0.2s',
        }}
      >{saved ? '✓ Saved' : 'Save'}</button>
    </div>
  )
}

function LoginPanel({ signInWithEmail, signUpWithEmail, signInWithGoogle }) {
  const [mode,     setMode]     = useState('signin') // 'signin' | 'signup'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [sent,     setSent]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password)
        setSent(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) return (
    <p style={{ color: '#4ade80', fontSize: '0.9rem', margin: 0 }}>
      ✓ Check your email to confirm your account, then sign in.
    </p>
  )

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
        Sign in to sync your add-ons across every device and browser automatically.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxWidth: 340 }}>
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.55rem 0.75rem', fontSize: '0.88rem' }}
        />
        <input
          type="password" required value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.55rem 0.75rem', fontSize: '0.88rem' }}
        />
        {error && <p style={{ color: '#f87171', fontSize: '0.82rem', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="btn-accent" disabled={loading} style={{ fontSize: '0.88rem', padding: '0.5rem 1.2rem' }}>
            <FiLogIn size={13} /> {loading ? '…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
          <button type="button" onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError('') }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>
            {mode === 'signin' ? 'Create account' : 'Already have an account?'}
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0', maxWidth: 340 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <button
        onClick={signInWithGoogle}
        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#fff', color: '#111', border: 'none', borderRadius: 'var(--radius)', padding: '0.55rem 1.2rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
    </div>
  )
}

function AccountPanel({ user, signOut, syncing, syncError }) {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FiUser size={18} color="#fff" />
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{user.user_metadata?.full_name || user.email}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{user.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', padding: '0.35rem 0.8rem', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <FiLogOut size={13} /> {signingOut ? '…' : 'Sign Out'}
        </button>
      </div>

      <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-secondary)', border: `1px solid ${syncError ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.3)'}`, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.84rem' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: syncError ? '#f87171' : syncing ? '#fbbf24' : '#4ade80', flexShrink: 0 }} />
        <span style={{ color: syncError ? '#f87171' : 'var(--text-secondary)' }}>
          {syncError || (syncing ? 'Syncing add-ons…' : 'Add-ons synced to cloud ✓')}
        </span>
      </div>
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
