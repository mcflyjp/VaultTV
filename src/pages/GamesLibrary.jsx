import { useState } from 'react'
import { FiPlay, FiSmartphone, FiImage, FiRefreshCw, FiX, FiArrowLeft } from 'react-icons/fi'
import { useGamesLibrary, HAS_ANDROID_BRIDGE } from '../hooks/useGamesLibrary'
import ConsoleIcon, { ConsoleTile } from '../components/ConsoleIcon'
import { useModalBackTrap } from '../hooks/useModalBackTrap'

export default function GamesLibrary() {
  const {
    allGames, gamesByPlatform, platformCount, raExists,
    androidFolderUri, loading, error, play, saveArtwork, rescanArtwork,
    hasIgdbKeys, scrapingAll, scrapeAll, igdbQuotaExceededAt,
  } = useGamesLibrary()

  const [artworkGame, setArtworkGame]         = useState(null)
  const [selectedPlatform, setSelectedPlatform] = useState(null)

  const platforms = Object.entries(gamesByPlatform).sort((a, b) => b[1].length - a[1].length)
  const activeList = selectedPlatform ? (gamesByPlatform[selectedPlatform] || []) : []

  return (
    <div style={{ padding: '2rem 1.75rem', minHeight: '100vh' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      {selectedPlatform ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedPlatform(null)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', padding: '0.4rem 0.6rem', display: 'flex', alignItems: 'center' }}
            title="Back to consoles"
          >
            <FiArrowLeft size={16} />
          </button>
          <ConsoleIcon platform={selectedPlatform} size={36} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{selectedPlatform}</h1>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{activeList.length} game{activeList.length === 1 ? '' : 's'}</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <FiPlay size={20} style={{ color: '#a78bfa' }} />
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Games</h1>
          <BetaBadge />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>({allGames.length} across {platformCount} platform{platformCount === 1 ? '' : 's'})</span>
          {hasIgdbKeys && allGames.length > 0 && (
            <button
              onClick={scrapeAll}
              disabled={scrapingAll || !!igdbQuotaExceededAt}
              title={igdbQuotaExceededAt ? "IGDB's rate limit was hit — try again shortly" : "Scrape box art for every game that doesn't have it yet"}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: (scrapingAll || igdbQuotaExceededAt) ? 'default' : 'pointer', opacity: igdbQuotaExceededAt ? 0.5 : 1 }}
            >
              <FiRefreshCw size={13} style={{ animation: scrapingAll ? 'spin 1s linear infinite' : 'none' }} />
              {scrapingAll ? 'Scraping…' : igdbQuotaExceededAt ? 'Rate Limited' : 'Scrape All Box Art'}
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#f87171' }}>
          {error}
        </div>
      )}

      {igdbQuotaExceededAt && (
        <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#eab308' }}>
          IGDB's rate limit was hit during the last scrape — it resets within seconds, so just try Scrape All again in a moment.
        </div>
      )}

      {!raExists && !androidFolderUri && !loading && !selectedPlatform && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          No RetroArch source configured yet. Open the folder icon → Games to set a ROM folder + RetroArch path{HAS_ANDROID_BRIDGE ? ', or pick a folder on this device' : ''}.
        </div>
      )}

      {allGames.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🎮</div>
          <p style={{ margin: 0, fontSize: '1rem' }}>No games found yet.</p>
          <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.88rem' }}>Add a ROM folder from the Libraries panel.</p>
        </div>
      )}

      {/* Console selector — big tiles, biggest library first. Picking one
          drops into that console's own game grid instead of dumping every
          platform into one long scrolling wall. */}
      {!selectedPlatform && platforms.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
          {platforms.map(([platform, list]) => (
            <ConsoleTile key={platform} platform={platform} count={list.length} onClick={() => setSelectedPlatform(platform)} />
          ))}
        </div>
      )}

      {selectedPlatform && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {activeList.map(g => (
            <GameCard
              key={g._source === 'android' ? g.uri : g.path}
              game={g}
              raExists={raExists}
              onPlay={() => play(g)}
              onEditArtwork={g._source === 'server' ? () => setArtworkGame(g) : undefined}
            />
          ))}
        </div>
      )}

      {artworkGame && (
        <BoxArtModal
          game={artworkGame}
          onSave={async url => { await saveArtwork(artworkGame, url); setArtworkGame(null) }}
          onRescan={() => rescanArtwork(artworkGame)}
          onClose={() => setArtworkGame(null)}
        />
      )}
    </div>
  )
}

/** Marks the Games section as still in development — see the ES-DE redesign
 *  queued for v2. Sits next to the heading rather than in the nav so it reads
 *  as "this feature is beta", not "this link is beta". */
function BetaBadge() {
  return (
    <span
      title="Games is still in development — expect rough edges"
      style={{
        fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: '#fbbf24',
        background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)',
        borderRadius: 4, padding: '2px 6px', lineHeight: 1.4, flexShrink: 0,
      }}
    >
      Beta
    </span>
  )
}

function GameCard({ game, raExists, onPlay, onEditArtwork }) {
  const disabled = game._source === 'server' && !raExists
  return (
    <button
      onClick={onPlay}
      onContextMenu={onEditArtwork ? (e => { e.preventDefault(); onEditArtwork() }) : undefined}
      disabled={disabled}
      title={disabled ? 'Set a valid RetroArch path first' : onEditArtwork ? 'Play (right-click for box art)' : 'Play'}
      style={{
        width: 150, textAlign: 'left', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        overflow: 'hidden', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.15s',
      }}
      className={!disabled ? 'card-hover' : undefined}
    >
      <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {game.boxArt
          ? <img src={game.boxArt} alt={game.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          : <FiPlay size={28} style={{ color: 'var(--accent)', opacity: 0.7 }} />
        }
      </div>
      <div style={{ padding: '0.5rem 0.6rem 0.6rem' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.name}</p>
        {game._source === 'android' && (
          <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <FiSmartphone size={10} /> This device
          </p>
        )}
      </div>
    </button>
  )
}

// Mirrors the server's normalizeGameTitle() — strips region/revision tags like
// "(USA) (v1.00)" so the search box starts with a clean title, not raw ROM cruft.
function cleanTitle(name) {
  return (name || '')
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
    .replace(/^\s*\d+[\s._-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function BoxArtModal({ game, onSave, onRescan, onClose }) {
  // FireTV: trap D-pad focus + make Back close this instead of leaving the page.
  useModalBackTrap(onClose)
  const [url, setUrl]           = useState(game.boxArt || '')
  const [query, setQuery]       = useState(cleanTitle(game.name))
  const [rescanning, setRescanning] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  async function handleRescan() {
    setRescanning(true)
    setErr('')
    try {
      const found = await onRescan(query.trim())
      setUrl(found || '')
      if (!found) setErr(`No match found on IGDB for "${query.trim()}".`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setRescanning(false)
    }
  }

  async function handleSave(value = url) {
    setSaving(true)
    setErr('')
    try {
      await onSave(value.trim())
    } catch (e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Box Art"
      style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.8)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiImage size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Box Art — {game.name}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <FiX size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ width: 84, aspectRatio: '2/3', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <FiPlay size={20} style={{ opacity: 0.3 }} />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Search IGDB by title, or paste a direct image URL below to set it manually.
              </p>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && query.trim() && !rescanning) handleRescan() }}
                placeholder="Game title to search for…"
                style={{ width: '100%', padding: '0.4rem 0.6rem', marginBottom: '0.5rem', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }}
              />
              <button
                onClick={handleRescan}
                disabled={rescanning || !query.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.7rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
              >
                <FiRefreshCw size={12} style={{ animation: rescanning ? 'spin 1s linear infinite' : 'none' }} />
                {rescanning ? 'Searching…' : 'Search IGDB'}
              </button>
              <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block', fontWeight: 600 }}>Image URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://…"
              style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {err && <p style={{ margin: 0, fontSize: '0.76rem', color: '#f87171' }}>{err}</p>}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
          <button onClick={() => { setUrl(''); handleSave('') }} className="btn-ghost" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>Clear</button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={onClose} className="btn-ghost" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>Cancel</button>
            <button onClick={() => handleSave()} disabled={saving} className="btn-primary" style={{ fontSize: '0.85rem', padding: '0.4rem 1.25rem' }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
