import { useState } from 'react'
import { FiFolder, FiRefreshCw, FiPlus, FiTrash2, FiPlay, FiSearch, FiSmartphone } from 'react-icons/fi'
import { LibraryCard } from './LibraryPanel'
import { useGamesLibrary, HAS_ANDROID_BRIDGE } from '../hooks/useGamesLibrary'

/**
 * Games library card — same shape as the Movies/TV Shows cards in LibraryPanel:
 * a stats row + "Open library" (→ /library/games, the browsable page) + an
 * expandable section for source configuration only (folders, RetroArch path).
 * The actual game list/browsing lives on the dedicated page, not in here.
 */
export default function GamesLibraryCard({ expanded, onToggle, onOpen }) {
  const {
    folders, allGames, platformCount, retroarchPath, raExists, scanningId, error, detecting,
    androidFolderUri, androidGames, androidScanning,
    saveRetroarch, detect, addFolder, removeFolder, rescanFolder,
    pickAndroidFolder, refreshAndroid,
  } = useGamesLibrary()

  const [raInput, setRaInput]         = useState('')
  const [folderInput, setFolderInput] = useState('')

  return (
    <LibraryCard
      expanded={expanded}
      onToggle={onToggle}
      icon={<FiPlay size={20} style={{ color: '#a78bfa' }} />}
      color="#7c3aed"
      title="Games"
      stats={[
        { label: 'Games', value: allGames.length },
        { label: 'Platforms', value: platformCount },
        { label: 'Sources', value: folders.length + (androidFolderUri ? 1 : 0) },
      ]}
      onOpen={onOpen}
    >
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.5rem 0.65rem', marginBottom: '0.65rem', fontSize: '0.74rem', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* RetroArch path */}
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>RetroArch Location</p>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
        <input
          value={raInput || retroarchPath}
          onChange={e => setRaInput(e.target.value)}
          placeholder="C:\RetroArch\retroarch.exe or Z:\RetroArch\retroarch.exe"
          style={inputStyle}
        />
        <button onClick={() => (raInput.trim()) && saveRetroarch(raInput.trim())} style={smallBtn}>Save</button>
      </div>
      <button
        onClick={async () => { const found = await detect(); if (found) setRaInput(found) }}
        disabled={detecting}
        style={{ ...smallBtn, width: '100%', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <FiSearch size={12} /> {detecting ? 'Detecting…' : 'Auto-detect RetroArch'}
      </button>
      {retroarchPath && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.7rem', color: raExists ? '#34d399' : '#f87171' }}>
          {raExists ? '✓ Found' : '✗ Not found at this path'} — {retroarchPath}
        </p>
      )}

      {/* ROM folders (Media Server) */}
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
                <button onClick={() => rescanFolder(f.id)} disabled={scanningId === f.id} title="Rescan" style={iconBtn}>
                  <FiRefreshCw size={13} style={{ animation: scanningId === f.id ? 'spin 1s linear infinite' : 'none' }} />
                </button>
                <button onClick={() => removeFolder(f.id)} title="Remove folder" style={{ ...iconBtn, color: '#f87171' }}>
                  <FiTrash2 size={13} />
                </button>
              </div>
            ))}
            <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: HAS_ANDROID_BRIDGE ? '0.75rem' : 0 }}>
        <input
          value={folderInput}
          onChange={e => setFolderInput(e.target.value)}
          placeholder="Z:\Roms"
          style={inputStyle}
        />
        <button onClick={() => folderInput.trim() && (addFolder(folderInput.trim()), setFolderInput(''))} style={smallBtn}><FiPlus size={13} /></button>
      </div>

      {/* On-device Android ROMs — only shown inside the native app */}
      {HAS_ANDROID_BRIDGE && (
        <>
          <p style={{ margin: '0.5rem 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <FiSmartphone size={11} /> On This Device
          </p>
          {androidFolderUri
            ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.65rem' }}>
                <FiFolder size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600 }}>{androidGames.length} game{androidGames.length === 1 ? '' : 's'} found</p>
                  <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-secondary)' }}>Launches RetroArch installed on this phone</p>
                </div>
                <button onClick={refreshAndroid} disabled={androidScanning} title="Rescan" style={iconBtn}>
                  <FiRefreshCw size={13} style={{ animation: androidScanning ? 'spin 1s linear infinite' : 'none' }} />
                </button>
                <button onClick={pickAndroidFolder} title="Change folder" style={iconBtn}>
                  <FiFolder size={13} />
                </button>
              </div>
            )
            : (
              <button onClick={pickAndroidFolder} style={{ ...smallBtn, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <FiFolder size={13} /> Pick ROM folder on this device
              </button>
            )}
        </>
      )}
    </LibraryCard>
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
