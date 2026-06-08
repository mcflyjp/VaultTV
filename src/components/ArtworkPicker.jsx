/**
 * ArtworkPicker — Plex-style modal for choosing custom poster or backdrop artwork.
 *
 * Props:
 *   item      — the media item object ({ id, title, name, ... })
 *   type      — 'movie' | 'tv'
 *   slot      — 'poster' | 'backdrop'  (default: 'poster')
 *   onClose   — called when user closes or applies
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useArtwork } from '../context/ArtworkContext'
import { IMG } from '../lib/tmdb'
import { FiX, FiCheck, FiImage, FiLayout, FiUpload } from 'react-icons/fi'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || ''

async function fetchImages(type, id) {
  const stremioType = type === 'tv' ? 'tv' : 'movie'
  const res = await fetch(
    `https://api.themoviedb.org/3/${stremioType}/${id}/images?api_key=${TMDB_KEY}&include_image_language=en,null`
  )
  const data = await res.json()
  return {
    posters:   data.posters   || [],
    backdrops: data.backdrops || [],
  }
}

export default function ArtworkPicker({ item, type, slot: initialSlot = 'poster', onClose }) {
  const { setArtwork, getArtwork, clearArtwork } = useArtwork()

  // 'poster' or 'backdrop' — can be toggled inside the modal
  const [slot,      setSlot]      = useState(initialSlot)
  // 'tmdb' or 'custom' — default to 'custom' for unmatched local files
  const [tab,       setTab]       = useState(initialSlot === 'poster' && !item.id?.toString().startsWith('local_') ? 'tmdb' : 'custom')
  const [customUrl, setCustomUrl] = useState('')
  const [dragging,  setDragging]  = useState(false)
  const [dropError, setDropError] = useState('')
  const fileInputRef = useRef(null)
  const modalRef     = useRef(null)

  const current = getArtwork(item.id, type, slot)
  const isPoster = slot === 'poster'
  // Unmatched local files don't have a numeric TMDB ID — skip TMDB image fetch
  const hasTmdbId = item.id && /^\d+$/.test(String(item.id))

  const { data: images = { posters: [], backdrops: [] }, isLoading } = useQuery({
    queryKey: ['images', type, item.id],
    queryFn:  () => fetchImages(type, item.id),
    enabled:  hasTmdbId,
  })

  const candidates = isPoster ? images.posters : images.backdrops

  function pick(url) {
    setArtwork(item.id, type, url, slot)
    onClose()
  }

  function applyCustom() {
    if (customUrl.trim()) {
      setArtwork(item.id, type, customUrl.trim(), slot)
      onClose()
    }
  }

  function reset() {
    clearArtwork(item.id, type, slot)
    onClose()
  }

  // Convert a local image File → data: URL and apply it as artwork
  function applyFile(file) {
    setDropError('')
    if (!file || !file.type.startsWith('image/')) {
      setDropError('Not an image file. Drop a JPG, PNG, or WebP.')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      setArtwork(item.id, type, e.target.result, slot)
      onClose()
    }
    reader.onerror = () => setDropError('Could not read file.')
    reader.readAsDataURL(file)
  }

  const onDragOver = useCallback(e => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback(e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }, [])
  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) { applyFile(file); return }
    // Also accept dropped image URLs (e.g. drag from browser)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url?.startsWith('http')) { setCustomUrl(url) }
  }, [slot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Ctrl+V — paste image from clipboard
  useEffect(() => {
    function onPaste(e) {
      const items = Array.from(e.clipboardData?.items || [])
      const imageItem = items.find(i => i.type.startsWith('image/'))
      if (imageItem) {
        // Image in clipboard — always intercept, even if URL input is focused
        e.preventDefault()
        applyFile(imageItem.getAsFile())
      }
      // No image → let the browser handle text paste normally (e.g. into the URL input)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [slot]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = item.title || item.name || 'Untitled'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
      onContextMenu={e => e.preventDefault()}
    >
      <div
        ref={modalRef}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        onContextMenu={e => e.stopPropagation()}
        style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%',
        maxWidth: isPoster ? 580 : 780,
        maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 100px rgba(0,0,0,0.8)', overflow: 'hidden',
        transition: 'max-width 0.2s',
      }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Change Artwork</h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{title}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <FiX size={18} />
          </button>
        </div>

        {/* ── Slot switcher (Poster vs Backdrop) ─────────────────────── */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <SlotBtn
            icon={<FiImage size={14} />}
            label="Poster"
            sub="2:3 portrait"
            active={isPoster}
            onClick={() => { setSlot('poster'); setCustomUrl('') }}
          />
          <SlotBtn
            icon={<FiLayout size={14} />}
            label="Backdrop / Banner"
            sub="16:9 wide"
            active={!isPoster}
            onClick={() => { setSlot('backdrop'); setCustomUrl('') }}
          />
        </div>

        {/* ── Source tabs (TMDB / Custom URL) ───────────────────────── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {(hasTmdbId ? [['tmdb', 'TMDB Library'], ['custom', 'Custom URL']] : [['custom', 'Custom URL']]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex: 1, padding: '0.6rem', border: 'none', background: 'transparent',
                color: tab === id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: tab === id ? 700 : 400,
                borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }} onWheel={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()}>

          {/* Current override banner */}
          {current && (
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--accent)' }}>
              <img
                src={current}
                alt=""
                style={{
                  width: isPoster ? 32 : 64, height: isPoster ? 48 : 36,
                  objectFit: 'cover', borderRadius: 4, flexShrink: 0,
                }}
              />
              <p style={{ margin: 0, fontSize: '0.82rem', flex: 1, color: 'var(--text-primary)' }}>
                Custom {isPoster ? 'poster' : 'backdrop'} active
              </p>
              <button
                onClick={reset}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
              >
                Reset to Default
              </button>
            </div>
          )}

          {/* TMDB library tab */}
          {tab === 'tmdb' && (
            <>
              {isLoading && (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
                  Loading images from TMDB…
                </p>
              )}
              {!isLoading && candidates.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
                  No {isPoster ? 'posters' : 'backdrops'} found on TMDB for this title.
                </p>
              )}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isPoster
                  ? 'repeat(auto-fill, minmax(110px, 1fr))'
                  : 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '0.6rem',
              }}>
                {candidates.slice(0, 30).map((img, i) => {
                  const url = IMG(img.file_path, isPoster ? 'w342' : 'w780')
                  const isActive = current === url
                  return (
                    <div
                      key={i}
                      onClick={() => pick(url)}
                      title={`Vote: ${img.vote_average?.toFixed(1) || '—'}  ·  ${img.width}×${img.height}`}
                      style={{
                        position: 'relative', cursor: 'pointer',
                        borderRadius: 8, overflow: 'hidden',
                        border: isActive ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.06)',
                        transition: 'border 0.15s, transform 0.1s',
                        aspectRatio: isPoster ? '2/3' : '16/9',
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                      {/* vote score */}
                      {img.vote_average > 0 && (
                        <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.75)', color: '#fbbf24', fontSize: '0.62rem', fontWeight: 700, padding: '2px 5px', borderRadius: 4 }}>
                          ★ {img.vote_average.toFixed(1)}
                        </div>
                      )}
                      {isActive && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(124,58,237,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FiCheck size={28} color="#fff" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Custom URL / drag-drop tab */}
          {tab === 'custom' && (
            <div>
              {/* Drop zone */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--accent)' : 'rgba(255,255,255,0.18)'}`,
                  borderRadius: 12,
                  padding: '2rem 1.25rem',
                  marginBottom: '1.25rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragging ? 'rgba(124,58,237,0.12)' : 'var(--bg-card)',
                  transition: 'border-color 0.15s, background 0.15s',
                  userSelect: 'none',
                }}
              >
                <FiUpload size={28} style={{ color: dragging ? 'var(--accent)' : 'rgba(255,255,255,0.3)', marginBottom: '0.6rem' }} />
                <p style={{ margin: '0 0 0.3rem', fontWeight: 600, fontSize: '0.9rem', color: dragging ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {dragging ? 'Drop to apply' : 'Drag & drop an image here'}
                </p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  or <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>browse files</span> · JPG, PNG, WebP
                </p>
                {dropError && (
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#f87171' }}>{dropError}</p>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && applyFile(e.target.files[0])}
              />

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                or paste a URL
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              {/* URL input */}
              <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
                <input
                  value={customUrl}
                  onChange={e => { setCustomUrl(e.target.value); setDropError('') }}
                  onKeyDown={e => e.key === 'Enter' && applyCustom()}
                  placeholder={isPoster ? 'https://example.com/poster.jpg' : 'https://example.com/backdrop.jpg'}
                  style={{
                    flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                    padding: '0.6rem 0.75rem', fontSize: '0.85rem',
                  }}
                />
                <button className="btn-accent" onClick={applyCustom} disabled={!customUrl.trim()}>
                  Apply
                </button>
              </div>
              {customUrl && (
                <img
                  src={customUrl}
                  alt="Preview"
                  onError={e => e.target.style.display = 'none'}
                  style={{
                    width: isPoster ? 120 : '100%',
                    maxHeight: isPoster ? 180 : 260,
                    borderRadius: 8, objectFit: 'cover',
                    border: '1px solid var(--border)', display: 'block',
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SlotBtn({ icon, label, sub, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)', cursor: 'pointer',
        border: active ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
        background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        transition: 'all 0.15s', textAlign: 'left',
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}>{icon}</span>
      <div>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.83rem' }}>{label}</p>
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{sub}</p>
      </div>
    </button>
  )
}
