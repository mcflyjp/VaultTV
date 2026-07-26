import { useEffect, useState } from 'react'
import {
  FiFolder, FiChevronRight, FiChevronDown, FiRefreshCw, FiPlus, FiTrash2, FiPlay, FiSearch,
} from 'react-icons/fi'
import {
  listRomFolders, addRomFolder, removeRomFolder, scanRomFolder,
  getRetroarchPath, setRetroarchPath, detectRetroarch, launchGame,
} from '../lib/companion'

/**
 * RetroArch-only ROM library (v1). Folder paths and the RetroArch executable
 * path can point at a mapped network drive (e.g. Z:\Roms, Z:\RetroArch\
 * retroarch.exe) — the Media Server treats those exactly like local paths.
 * Uses plain text-path inputs rather than a native file picker, matching the
 * Media Server admin UI's existing convention for Movies/TV folders.
 */
export default function GamesLibraryCard({ expanded, onToggle }) {
  const [folders, setFolders]           = useState([])
  const [games, setGames]               = useState([]) // flat list across all folders, merged
  const [retroarchPath, setRAPath]      = useState('')
  const [raExists, setRaExists]         = useState(false)
  const [raInput, setRaInput]           = useState('')
  const [folderInput, setFolderInput]   = useState('')
  const [scanningId, setScanningId]     = useState(null)
  const [error, setError]               = useState('')
  const [detecting, setDetecting]       = useState(false)

  useEffect(() => {
    if (!expanded) return
    refresh()
  }, [expanded])

  async function refresh() {
    setError('')
    try {
      const [f, ra] = await Promise.all([listRomFolders(), getRetroarchPath()])
      setFolders(f)
      setRAPath(ra.path || '')
      setRaExists(ra.exists)
      setRaInput(ra.path || '')
      // Re-scan all folders to build the merged game list
      const all = await Promise.all(f.map(folder => scanRomFolder(folder.id).catch(() => ({ games: [] }))))
      setGames(all.flatMap(r => r.games || []))
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleSaveRetroarch() {
    if (!raInput.trim()) return
    try {
      await setRetroarchPath(raInput.trim())
      await refresh()
    } catch (e) { setError(e.message) }
  }

  async function handleDetect() {
    setDetecting(true)
    try {
      const { found } = await detectRetroarch()
      if (found) { setRaInput(found); await setRetroarchPath(found); await refresh() }
      else setError('RetroArch not found in common install locations — enter its path manually below.')
    } catch (e) { setError(e.message) } finally { setDetecting(false) }
  }

  async function handleAddFolder() {
    if (!folderInput.trim()) return
    try {
      await addRomFolder({ id: `rom_${Date.now()}`, folderPath: folderInput.trim() })
      setFolderInput('')
      await refresh()
    } catch (e) { setError(e.message) }
  }

  async function handleRemoveFolder(id) {
    await removeRomFolder(id)
    await refresh()
  }

  async function handleRescan(id) {
    setScanningId(id)
    try { await refresh() } finally { setScanningId(null) }
  }

  async function handlePlay(game) {
    try {
      await launchGame({ romPath: game.path, ext: game.ext })
    } catch (e) { setError(e.message) }
  }

  const gamesByPlatform = games.reduce((acc, g) => {
    (acc[g.platform] ||= []).push(g)
    return acc
  }, {})

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, marginBottom: '0.75rem', overflow: 'hidden',
    }}>
      <div onClick={onToggle} style={{ padding: '1rem', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FiPlay size={18} style={{ color: '#a78bfa' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Games (RetroArch)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{games.length} game{games.length === 1 ? '' : 's'}</span>
            {expanded ? <FiChevronDown size={15} style={{ color: 'var(--text-secondary)' }} /> : <FiChevronRight size={15} style={{ color: 'var(--text-secondary)', transform: 'rotate(90deg)' }} />}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 1rem 1rem' }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.5rem 0.65rem', marginBottom: '0.65rem', fontSize: '0.74rem', color: '#f87171' }}>
              {error}
            </div>
          )}

          {/* RetroArch path */}
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>RetroArch Location</p>
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <input
              value={raInput}
              onChange={e => setRaInput(e.target.value)}
              placeholder="C:\RetroArch\retroarch.exe or Z:\RetroArch\retroarch.exe"
              style={inputStyle}
            />
            <button onClick={handleSaveRetroarch} style={smallBtn}>Save</button>
          </div>
          <button onClick={handleDetect} disabled={detecting} style={{ ...smallBtn, width: '100%', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <FiSearch size={12} /> {detecting ? 'Detecting…' : 'Auto-detect RetroArch'}
          </button>
          {retroarchPath && (
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.7rem', color: raExists ? '#34d399' : '#f87171' }}>
              {raExists ? '✓ Found' : '✗ Not found at this path'} — {retroarchPath}
            </p>
          )}

          {/* ROM folders */}
          <p style={{ margin: '0.5rem 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>ROM Folders</p>
          {folders.length === 0
            ? <p style={{ margin: '0 0 0.5rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>No folders added yet.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.6rem' }}>
                {folders.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.65rem' }}>
                    <FiFolder size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                      <p style={{ margin: 0, fontSize: '0.66rem', color: f.exists ? 'var(--text-secondary)' : '#f87171' }}>{f.exists ? f.folderPath : `Not found: ${f.folderPath}`}</p>
                    </div>
                    <button onClick={() => handleRescan(f.id)} disabled={scanningId === f.id} title="Rescan" style={iconBtn}>
                      <FiRefreshCw size={13} style={{ animation: scanningId === f.id ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                    <button onClick={() => handleRemoveFolder(f.id)} title="Remove folder" style={{ ...iconBtn, color: '#f87171' }}>
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                ))}
                <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
              </div>
            )}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <input
              value={folderInput}
              onChange={e => setFolderInput(e.target.value)}
              placeholder="Z:\Roms"
              style={inputStyle}
            />
            <button onClick={handleAddFolder} style={smallBtn}><FiPlus size={13} /></button>
          </div>

          {/* Game list, grouped by platform */}
          {Object.keys(gamesByPlatform).length > 0 && (
            <>
              <p style={{ margin: '0.5rem 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Library</p>
              {Object.entries(gamesByPlatform).map(([platform, list]) => (
                <div key={platform} style={{ marginBottom: '0.6rem' }}>
                  <p style={{ margin: '0 0 0.3rem', fontSize: '0.74rem', fontWeight: 700, color: 'var(--accent)' }}>{platform} ({list.length})</p>
                  {list.map(g => (
                    <button
                      key={g.path}
                      onClick={() => handlePlay(g)}
                      disabled={!raExists}
                      title={raExists ? 'Play' : 'Set a valid RetroArch path first'}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '0.4rem 0.6rem', marginBottom: '0.3rem',
                        cursor: raExists ? 'pointer' : 'not-allowed', opacity: raExists ? 1 : 0.5,
                        textAlign: 'left',
                      }}
                    >
                      <FiPlay size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  flex: 1, padding: '0.4rem 0.6rem', borderRadius: 6,
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none',
}

const smallBtn = {
  padding: '0.4rem 0.7rem', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
}

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '0.3rem', display: 'flex', alignItems: 'center', borderRadius: 4, flexShrink: 0,
}
