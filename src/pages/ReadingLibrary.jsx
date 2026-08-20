import { useState } from 'react'
import { FiBook, FiImage, FiRefreshCw, FiX, FiPlay } from 'react-icons/fi'
import { useReadingLibrary } from '../hooks/useReadingLibrary'
import ComicReader from '../components/ComicReader'
import EpubReader from '../components/EpubReader'
import PdfReader from '../components/PdfReader'
import { useModalBackTrap } from '../hooks/useModalBackTrap'

export default function ReadingLibrary() {
  const {
    comics, novels, graphicNovels, comicsByPublisher, loading, error, saveArtwork, rescanArtwork,
    hasComicVineKey, comicVineQuotaExceededAt, scrapingAll, scrapeAll,
  } = useReadingLibrary()
  const [openFile, setOpenFile]     = useState(null) // { ...item, kind }
  const [artworkItem, setArtworkItem] = useState(null)

  const total = comics.length + novels.length + graphicNovels.length
  const publisherGroups = Object.entries(comicsByPublisher).sort((a, b) => {
    if (a[0] === 'Other') return 1
    if (b[0] === 'Other') return -1
    return b[1].length - a[1].length
  })

  return (
    <div style={{ padding: '2rem 1.75rem', minHeight: '100vh' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <FiBook size={20} style={{ color: '#38bdf8' }} />
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Reading</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>({total} items)</span>
        {total > 0 && (
          <button
            onClick={scrapeAll}
            disabled={scrapingAll || !!comicVineQuotaExceededAt}
            title={comicVineQuotaExceededAt ? "ComicVine's rate limit was hit — try again shortly" : 'Scrape cover art for every item that doesn\'t have it yet'}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: (scrapingAll || comicVineQuotaExceededAt) ? 'default' : 'pointer', opacity: comicVineQuotaExceededAt ? 0.5 : 1 }}
          >
            <FiRefreshCw size={13} style={{ animation: scrapingAll ? 'spin 1s linear infinite' : 'none' }} />
            {scrapingAll ? 'Scraping…' : comicVineQuotaExceededAt ? 'Rate Limited' : 'Scrape All Covers'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#f87171' }}>
          {error}
        </div>
      )}

      {!hasComicVineKey && total > 0 && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1.25rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Covers come from Open Library automatically. Add a free ComicVine key in the Libraries panel for more accurate comic covers specifically.
        </div>
      )}

      {!loading && total === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>📚</div>
          <p style={{ margin: 0, fontSize: '1rem' }}>No comics or books found yet.</p>
          <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.88rem' }}>Add a folder from the Libraries panel.</p>
        </div>
      )}

      {novels.length > 0 && (
        <Section title="Novels" icon={<FiBook size={16} />} items={novels} onOpen={setOpenFile} onEditArtwork={setArtworkItem} />
      )}
      {graphicNovels.length > 0 && (
        <Section title="Graphic Novels" icon={<FiBook size={16} />} items={graphicNovels} onOpen={setOpenFile} onEditArtwork={setArtworkItem} />
      )}
      {comics.length > 0 && (
        <div style={{ marginBottom: '2.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            <FiImage size={16} />
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Comics</h2>
            <span style={{ fontSize: '0.78rem' }}>{comics.length}</span>
          </div>
          {publisherGroups.map(([publisher, items]) => (
            <Section
              key={publisher}
              title={publisher}
              subheading
              items={items}
              onOpen={setOpenFile}
              onEditArtwork={setArtworkItem}
            />
          ))}
        </div>
      )}

      {(openFile?.ext === '.cbz' || openFile?.ext === '.cbr') && <ComicReader file={openFile} onClose={() => setOpenFile(null)} />}
      {openFile?.ext === '.epub' && <EpubReader file={openFile} onClose={() => setOpenFile(null)} />}
      {openFile?.ext === '.pdf' && <PdfReader file={openFile} onClose={() => setOpenFile(null)} />}

      {artworkItem && (
        <ArtworkModal
          item={artworkItem}
          onSave={async url => { await saveArtwork(artworkItem, url); setArtworkItem(null) }}
          onRescan={(query, year, issueNumber) => rescanArtwork(artworkItem, query, year, issueNumber)}
          onClose={() => setArtworkItem(null)}
        />
      )}
    </div>
  )
}

function Section({ title, icon, items, onOpen, onEditArtwork, subheading }) {
  return (
    <div style={{ marginBottom: subheading ? '1.5rem' : '2.25rem', paddingLeft: subheading ? '1.5rem' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
        {icon}
        {subheading
          ? <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          : <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>}
        <span style={{ fontSize: '0.78rem' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem' }}>
        {items.map(item => (
          <button
            key={item.path}
            onClick={() => onOpen(item)}
            onContextMenu={e => { e.preventDefault(); onEditArtwork(item) }}
            title="Open (right-click for cover art)"
            style={{
              width: 150, textAlign: 'left', display: 'flex', flexDirection: 'column',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              overflow: 'hidden', cursor: 'pointer',
            }}
            className="card-hover"
          >
            <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {item.cover
                ? <img src={item.cover} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                : item.kind === 'comic' ? <FiImage size={28} style={{ color: '#38bdf8', opacity: 0.7 }} /> : <FiBook size={28} style={{ color: '#38bdf8', opacity: 0.7 }} />}
            </div>
            <div style={{ padding: '0.5rem 0.6rem 0.6rem' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function cleanTitle(name) {
  return (name || '')
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
    .replace(/^\s*\d+[\s._-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Comics carry the issue number AFTER the series name ("X-Men 001") — strip
// it so the search box defaults to the series title, matching the server's
// comicSeriesTitle() so what you see here is what actually gets searched.
function seriesTitle(name) {
  return cleanTitle(name).replace(/\s*#?\d+\s*$/, '').replace(/\s+vol(ume)?\s*\d*\s*$/i, '').trim()
}

// Mirror the server's extractComicYear/extractComicIssueNumber so the modal's
// Year/Issue # fields default to whatever the auto-scraper would've guessed
// from the filename — the user only needs to type something when that guess
// is wrong (mistagged scanlation year, missing issue number, etc).
function guessYear(name) {
  const m = (name || '').match(/\((19|20)\d{2}\)/)
  return m ? m[0].slice(1, -1) : ''
}
function guessIssueNumber(name) {
  const m = cleanTitle(name).match(/\s*#?(\d+)\s*$/)
  return m ? m[1] : ''
}

function ArtworkModal({ item, onSave, onRescan, onClose }) {
  // FireTV: trap D-pad focus + make Back close this instead of leaving the page.
  useModalBackTrap(onClose)
  const isComic = item.kind === 'comic'
  const [url, setUrl]         = useState(item.cover || '')
  const [query, setQuery]     = useState(isComic ? seriesTitle(item.name) : cleanTitle(item.name))
  const [year, setYear]       = useState(String(item.override?.year ?? guessYear(item.name)))
  const [issueNumber, setIssueNumber] = useState(String(item.override?.issueNumber ?? guessIssueNumber(item.name)))
  const [rescanning, setRescanning] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')

  async function handleRescan() {
    setRescanning(true)
    setErr('')
    try {
      const found = await onRescan(query.trim(), year.trim(), issueNumber.trim())
      setUrl(found || '')
      if (!found) setErr(`No cover found for "${query.trim()}".`)
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
    <div role="dialog" aria-label="Cover Art" style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiImage size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Cover Art — {item.name}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}><FiX size={18} /></button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ width: 84, aspectRatio: '2/3', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <FiPlay size={20} style={{ opacity: 0.3 }} />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Search by title, or paste a direct image URL below to set it manually.
              </p>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && query.trim() && !rescanning) handleRescan() }}
                placeholder="Title to search for…"
                style={{ width: '100%', padding: '0.4rem 0.6rem', marginBottom: '0.5rem', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }}
              />
              {isComic && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    value={year}
                    onChange={e => setYear(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !rescanning) handleRescan() }}
                    placeholder="Year"
                    inputMode="numeric"
                    style={{ width: 80, padding: '0.4rem 0.6rem', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                  />
                  <input
                    value={issueNumber}
                    onChange={e => setIssueNumber(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !rescanning) handleRescan() }}
                    placeholder="Issue #"
                    inputMode="numeric"
                    style={{ width: 80, padding: '0.4rem 0.6rem', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                  />
                </div>
              )}
              <button
                onClick={handleRescan}
                disabled={rescanning || !query.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.7rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
              >
                <FiRefreshCw size={12} style={{ animation: rescanning ? 'spin 1s linear infinite' : 'none' }} />
                {rescanning ? 'Searching…' : 'Search'}
              </button>
              <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
            </div>
          </div>

          {isComic && (
            <p style={{ margin: '-0.5rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Year/Issue # override what was guessed from the filename — corrections here are saved and reused every future scrape.
            </p>
          )}

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

