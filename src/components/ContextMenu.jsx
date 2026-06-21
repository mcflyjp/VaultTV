import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useContextMenu } from '../context/ContextMenuContext'
import { useLibrary } from '../context/LibraryContext'
import { useQueue } from '../context/QueueContext'
import { useRatings } from '../context/RatingsContext'
import { usePlaylist } from '../context/PlaylistContext'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { useArtwork } from '../context/ArtworkContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { usePlayer } from '../context/PlayerContext'
import { IMG } from '../lib/tmdb'
import {
  FiPlay, FiList, FiBookmark, FiCheck, FiStar, FiImage,
  FiInfo, FiPlusSquare, FiX, FiPlus, FiHardDrive, FiLayers, FiChevronRight,
  FiFolder, FiCopy, FiEdit2
} from 'react-icons/fi'
import { useMetadata } from '../context/MetadataContext'
import ArtworkPicker from './ArtworkPicker'
import RatingPicker from './RatingPicker'
import PlaylistModal from './PlaylistModal'

export default function ContextMenu() {
  const { menu, hide } = useContextMenu()
  const { isSaved, toggle: toggleSave } = useLibrary()
  const { isQueued, addToQueue, removeFromQueue } = useQueue()
  const { getRating } = useRatings()
  const { inProgress, startWatching } = useWatchHistory()
  const { getLocalVersions, getFileUrl } = useLocalLibrary()
  const { play } = usePlayer()
  const navigate = useNavigate()
  const ref = useRef(null)

  const { setMetadata, getMetadata } = useMetadata()
  const [subModal, setSubModal] = useState(null) // 'artwork' | 'rating' | 'playlist' | 'editinfo'
  const [versionsOpen, setVersionsOpen] = useState(false)

  // Click outside to close
  useEffect(() => {
    if (!menu.visible) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) hide() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menu.visible])

  if (!menu.visible || !menu.item) return null

  const { item } = menu
  const type  = item.type || item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const title = item.title || item.name || 'Unknown'
  const poster = item.poster || IMG(item.poster_path, 'w92')
  const saved  = isSaved(item.id, type)
  const queued = isQueued(item.id, type)
  const rating = getRating(item.id, type)
  const year   = (item.release_date || item.first_air_date || '').slice(0, 4)
  // Unmatched local file — id is 'local_xxx', no TMDB detail page
  const isUnmatched = String(item.id || '').startsWith('local_') || item._matched === false

  // Position: keep menu in viewport
  const vw = window.innerWidth, vh = window.innerHeight
  const menuW = 240, menuH = 340
  const x = menu.x + menuW > vw ? vw - menuW - 8 : menu.x
  const y = menu.y + menuH > vh ? vh - menuH - 8 : menu.y

  function action(fn) { fn(); hide() }

  const libraryItem = { id: item.id, type, title, poster }

  // Local versions (movies only in context menu — TV needs episode selection)
  const localVersions = type === 'movie' ? getLocalVersions(item.id, 'movie') : []

  async function playLocalVersion(file) {
    try {
      const url = await getFileUrl(file.filename)
      play({ url, title, poster, subtitleTracks: [] })
      startWatching(libraryItem)
      hide()
    } catch (e) {
      alert(e.message)
    }
  }

  async function playUnmatchedFile() {
    if (!item._filename) return
    try {
      const url = await getFileUrl(item._filename)
      play({ url, title, poster: item.poster || null, subtitleTracks: [] })
      hide()
    } catch (e) {
      alert('Could not open file: ' + e.message)
    }
  }

  if (subModal === 'artwork') return (
    <ArtworkPicker item={item} type={type} slot="poster" onClose={() => { setSubModal(null); hide() }} />
  )
  if (subModal === 'rating') return (
    <RatingPicker item={item} type={type} onClose={() => { setSubModal(null); hide() }} />
  )
  if (subModal === 'playlist') return (
    <PlaylistModal item={libraryItem} onClose={() => { setSubModal(null); hide() }} />
  )
  if (subModal === 'fileinfo') return (
    <FileInfoModal versions={localVersions} title={title} onClose={() => { setSubModal(null); hide() }} />
  )
  if (subModal === 'editinfo') return (
    <EditInfoModal item={item} type={type} existingMeta={getMetadata(item.id, type)} onSave={(fields) => { setMetadata(item.id, type, fields); setSubModal(null); hide() }} onClose={() => { setSubModal(null); hide() }} />
  )

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', zIndex: 9000, top: y, left: x,
        width: menuW,
        background: 'rgba(15,15,20,0.96)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        boxShadow: '0 16px 60px rgba(0,0,0,0.8)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Header — mini poster + title */}
      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', padding: '0.7rem 0.85rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {poster && (
          <img src={poster} alt="" style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
            {year}{year && type ? ' · ' : ''}{type === 'tv' ? 'Series' : 'Movie'}
            {rating ? ` · ⭐ ${rating}/10` : ''}
          </p>
        </div>
      </div>

      {/* Menu items */}
      <div style={{ padding: '0.35rem 0' }}>

        <MenuSection label="Playback" />
        {isUnmatched
          ? <MenuItem icon={<FiPlay />} label="Play File" accent onClick={playUnmatchedFile} />
          : <MenuItem icon={<FiPlay />} label="Play Now" accent onClick={() => action(() => navigate(`/detail/${type}/${item.id}`))} />
        }

        {/* Local versions — movie cards only, matched items */}
        {!isUnmatched && localVersions.length > 0 && (
          <>
            <MenuItem
              icon={<FiHardDrive />}
              label={`Play Local (${localVersions[0].qualityLabel || 'Local'})`}
              onClick={() => playLocalVersion(localVersions[0])}
            />
            <MenuItem
              icon={<FiFolder />}
              label="Show File Info…"
              onClick={() => setSubModal('fileinfo')}
            />
            {localVersions.length > 1 && (
              <>
                <MenuItem
                  icon={<FiLayers />}
                  label={`Play Version… (${localVersions.length})`}
                  onClick={() => setVersionsOpen(o => !o)}
                  suffix={<FiChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5, transform: versionsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />}
                />
                {versionsOpen && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {localVersions.map((v, i) => (
                      <button
                        key={v.id}
                        onClick={() => playLocalVersion(v)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.45rem 0.85rem 0.45rem 2rem',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                          background: 'transparent', color: 'rgba(255,255,255,0.75)',
                          fontSize: '0.8rem', transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,163,74,0.15)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <FiHardDrive size={11} style={{ color: '#16a34a', flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.qualityLabel || v.filename}
                        </span>
                        {i === 0 && <span style={{ fontSize: '0.6rem', background: '#16a34a', color: '#fff', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>BEST</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!isUnmatched && (
          <MenuItem
            icon={<FiList />}
            label={queued ? 'Remove from Queue' : 'Add to Queue'}
            onClick={() => action(() => queued ? removeFromQueue(item.id, type) : addToQueue(libraryItem))}
            active={queued}
          />
        )}

        <Divider />
        <MenuSection label="My Library" />
        {!isUnmatched && (
          <>
            <MenuItem
              icon={<FiBookmark />}
              label={saved ? `Remove from My ${type === 'tv' ? 'Shows' : 'Movies'}` : `Add to My ${type === 'tv' ? 'Shows' : 'Movies'}`}
              onClick={() => action(() => toggleSave(libraryItem))}
              active={saved}
            />
            <MenuItem
              icon={<FiStar />}
              label={rating ? `My Rating: ${rating}/10` : 'Rate This…'}
              onClick={() => setSubModal('rating')}
              active={!!rating}
            />
            <MenuItem
              icon={<FiCheck />}
              label="Mark as Watched"
              onClick={() => action(() => startWatching({ ...libraryItem, durationSec: 1, progressSec: 1 }))}
            />
          </>
        )}

        <Divider />
        <MenuSection label="Organize" />
        {!isUnmatched && <MenuItem icon={<FiPlusSquare />} label="Add to Playlist…" onClick={() => setSubModal('playlist')} />}
        <MenuItem icon={<FiImage />} label="Change Artwork…" onClick={() => setSubModal('artwork')} />
        <MenuItem icon={<FiEdit2 />} label="Edit Info…" onClick={() => setSubModal('editinfo')} />

        {!isUnmatched && (
          <>
            <Divider />
            <MenuItem icon={<FiInfo />} label="More Info" onClick={() => action(() => navigate(`/detail/${type}/${item.id}`))} muted />
          </>
        )}

      </div>
    </div>
  )
}

function MenuSection({ label }) {
  return <p style={{ margin: '0.2rem 0 0.1rem', padding: '0 0.85rem', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{label}</p>
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0.3rem 0' }} />
}

function FileInfoModal({ versions, title, onClose }) {
  const [copied, setCopied] = useState(null)

  function copy(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, width: '100%', maxWidth: 520,
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiFolder size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>File Info — {title}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Note about path */}
        <div style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          ⚠ Browsers don't expose full file paths for security reasons. The info below is what VaultTV can see.
        </div>

        {/* File list */}
        <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 400, overflowY: 'auto' }} onWheel={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()}>
          {versions.map((v, i) => {
            // Reconstruct a best-guess path from what we have
            const parts = [v.showFolder, v.filename].filter(Boolean)
            const displayPath = parts.join(' / ')

            return (
              <div key={v.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
                {/* Version badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {i === 0 && <span style={{ fontSize: '0.62rem', background: '#16a34a', color: '#fff', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>BEST</span>}
                  {v.qualityLabel && <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600 }}>{v.qualityLabel}</span>}
                </div>

                {/* Rows */}
                {[
                  { label: 'Show Folder', value: v.showFolder || '—' },
                  { label: 'Filename',    value: v.filename },
                  { label: 'Source',      value: v.sourceType === 'movie' ? 'Movies' : 'TV Shows' },
                  { label: 'Path (approx)', value: displayPath, copy: true },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 90, flexShrink: 0, paddingTop: 2 }}>{row.label}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', wordBreak: 'break-all', flex: 1, lineHeight: 1.5 }}>{row.value}</span>
                    {row.copy && (
                      <button
                        onClick={() => copy(row.value, `${v.id}-path`)}
                        title="Copy"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: copied === `${v.id}-path` ? '#4ade80' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', flexShrink: 0 }}
                      >
                        <FiCopy size={11} /> {copied === `${v.id}-path` ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>
                ))}

                {/* Copy filename button */}
                <button
                  onClick={() => copy(v.filename, `${v.id}-fn`)}
                  style={{ marginTop: '0.35rem', background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: copied === `${v.id}-fn` ? '#4ade80' : 'var(--text-secondary)', cursor: 'pointer', padding: '3px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <FiCopy size={11} /> {copied === `${v.id}-fn` ? 'Copied!' : 'Copy Filename'}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>Close</button>
        </div>
      </div>
    </div>
  )
}

function EditInfoModal({ item, type, existingMeta, onSave, onClose }) {
  const originalTitle = item.title || item.name || ''
  const originalYear  = (item.release_date || item.first_air_date || '').slice(0, 4)
  const originalImdb  = item.external_ids?.imdb_id || ''

  const [titleVal, setTitleVal] = useState(existingMeta?.title ?? originalTitle)
  const [yearVal,  setYearVal]  = useState(existingMeta?.year  ?? originalYear)
  const [imdbVal,  setImdbVal]  = useState(existingMeta?.imdb_id ?? originalImdb)

  function handleSave() {
    onSave({
      title:   titleVal.trim() !== originalTitle ? titleVal.trim() : '',
      year:    yearVal.trim()  !== originalYear  ? yearVal.trim()  : '',
      imdb_id: imdbVal.trim(),
    })
  }

  const inputStyle = {
    width: '100%', padding: '0.5rem 0.75rem',
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.9rem',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block', fontWeight: 600 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 24px 80px rgba(0,0,0,0.8)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiEdit2 size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Edit Info</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <FiX size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Override how this title is identified when fetching streams. Leave a field blank to use the original value.
          </p>

          <div>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={titleVal} onChange={e => setTitleVal(e.target.value)} placeholder={originalTitle} />
          </div>

          <div>
            <label style={labelStyle}>Year</label>
            <input style={{ ...inputStyle, width: 120 }} value={yearVal} onChange={e => setYearVal(e.target.value)} placeholder={originalYear} maxLength={4} />
          </div>

          <div>
            <label style={labelStyle}>IMDB ID <span style={{ fontWeight: 400, opacity: 0.6 }}>(e.g. tt0123456)</span></label>
            <input style={inputStyle} value={imdbVal} onChange={e => setImdbVal(e.target.value)} placeholder="tt…" />
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Setting the IMDB ID ensures addons like Torrentio match the correct title.
            </p>
          </div>
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>Cancel</button>
          <button onClick={handleSave} className="btn-primary" style={{ fontSize: '0.85rem', padding: '0.4rem 1.25rem' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

function MenuItem({ icon, label, onClick, accent, active, muted, suffix }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.5rem 0.85rem', border: 'none', cursor: 'pointer',
        background: hovered ? 'rgba(124,58,237,0.25)' : 'transparent',
        color: accent || active ? 'var(--accent)' : muted ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)',
        fontSize: '0.84rem', textAlign: 'left', transition: 'background 0.1s',
        borderRadius: 0,
      }}
    >
      <span style={{ flexShrink: 0, opacity: muted ? 0.5 : 1 }}>{icon}</span>
      {label}
      {active && !accent && !suffix && <FiCheck size={12} style={{ marginLeft: 'auto', color: 'var(--accent)', flexShrink: 0 }} />}
      {suffix}
    </button>
  )
}
