import { useState } from 'react'
import { FiFolder, FiRefreshCw, FiPlus, FiTrash2, FiBook, FiImage } from 'react-icons/fi'
import { LibraryCard } from './LibraryPanel'
import { useReadingLibrary } from '../hooks/useReadingLibrary'

/**
 * Reading (comics + ebooks) library card — same shape as Games/Movies/TV
 * cards in LibraryPanel: stats + "Open library" + an expandable folder-config
 * section. Browsing/reading itself lives on the dedicated /library/reading page.
 */
export default function ReadingLibraryCard({ expanded, onToggle, onOpen }) {
  const {
    folders, comics, novels, graphicNovels, scanningId, error, addFolder, removeFolder, rescanFolder,
    hasComicVineKey, saveComicVineKey,
  } = useReadingLibrary()
  const [folderInput, setFolderInput]     = useState('')
  const [categoryInput, setCategoryInput] = useState('novels')
  const [cvKeyInput, setCvKeyInput]       = useState('')
  const [cvSaved, setCvSaved]             = useState(false)

  return (
    <LibraryCard
      expanded={expanded}
      onToggle={onToggle}
      icon={<FiBook size={20} style={{ color: '#38bdf8' }} />}
      color="#0284c7"
      title="Reading"
      stats={[
        { label: 'Comics', value: comics.length },
        { label: 'Graphic Novels', value: graphicNovels.length },
        { label: 'Novels', value: novels.length },
      ]}
      onOpen={onOpen}
    >
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.5rem 0.65rem', marginBottom: '0.65rem', fontSize: '0.74rem', color: '#f87171' }}>
          {error}
        </div>
      )}

      <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Comic/Book Folders</p>
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
        Supports CBZ, CBR, EPUB, and PDF. CBZ/CBR are always grouped as Comics — pick a category below for EPUB/PDF folders (Novels vs Graphic Novels can't be told apart automatically).
      </p>
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
                <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent)', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>
                  {CATEGORY_LABELS[f.category] || 'Novels'}
                </span>
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
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <input
          value={folderInput}
          onChange={e => setFolderInput(e.target.value)}
          placeholder="Z:\Comics"
          style={inputStyle}
        />
        <select value={categoryInput} onChange={e => setCategoryInput(e.target.value)} style={{ ...inputStyle, flex: 'none', width: 110 }}>
          <option value="novels">Novels</option>
          <option value="graphic-novels">Graphic Novels</option>
          <option value="comics">Comics</option>
        </select>
        <button onClick={() => folderInput.trim() && (addFolder(folderInput.trim(), categoryInput), setFolderInput(''))} style={smallBtn}><FiPlus size={13} /></button>
      </div>

      {/* Cover art — works out of the box via Open Library (no key needed).
          ComicVine is an optional upgrade for better comic-specific covers. */}
      <p style={{ margin: '1rem 0 0.15rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <FiImage size={11} /> Cover Art
      </p>
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
        Books and comics get covers automatically via Open Library — no signup needed.
      </p>
      {hasComicVineKey
        ? (
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.7rem', color: '#34d399' }}>✓ ComicVine key configured — comic covers use it first, before falling back to Open Library</p>
        )
        : (
          <>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              Optional: add a free <a href="https://comicvine.gamespot.com/api/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>ComicVine API key</a> for more accurate comic covers specifically.
            </p>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                value={cvKeyInput}
                onChange={e => setCvKeyInput(e.target.value)}
                placeholder="ComicVine API key (optional)"
                style={inputStyle}
              />
              <button
                onClick={async () => { if (cvKeyInput.trim()) { await saveComicVineKey(cvKeyInput.trim()); setCvSaved(true) } }}
                style={smallBtn}
              >
                Save
              </button>
            </div>
            {cvSaved && <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', color: '#34d399' }}>✓ Saved</p>}
          </>
        )}
    </LibraryCard>
  )
}

const CATEGORY_LABELS = { comics: 'Comics', 'graphic-novels': 'Graphic Novels', novels: 'Novels' }

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
