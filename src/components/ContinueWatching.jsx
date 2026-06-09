import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { usePlayer } from '../context/PlayerContext'
import { FiPlay, FiX } from 'react-icons/fi'
import { IMG, getDetail } from '../lib/tmdb'

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

export default function ContinueWatching() {
  const { inProgress, removeFromHistory, updateProgress } = useWatchHistory()
  const { play } = usePlayer()
  const navigate = useNavigate()

  function handlePlay(item) {
    const s = item.lastStream
    if (s?.url) {
      play({
        url: s.url,
        title: item.title,
        poster: item.poster || null,
        subtitleTracks: s.subtitleTracks || [],
        imdbId: s.imdbId,
        mediaType: s.mediaType || item.type,
        season: s.season,
        episode: s.episode,
        streamLangs: s.streamLangs || [],
        rawStreamUrl: s.rawStreamUrl || null,
        transcodeVideo: s.transcodeVideo || false,
        startTime: (item.progress > 0.03 && item.progress < 0.92) ? (item.progressSec || 0) : 0,
        onProgress: (t, d) => updateProgress(item.id, item.type, t, d, item.title, item.poster),
      })
    } else {
      navigate(`/detail/${item.type}/${item.id}`)
    }
  }

  if (!inProgress.length) return null

  return (
    <section style={{ marginBottom: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.75rem', marginBottom: '0.75rem' }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
        <h2 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Continue Your Adventure<span style={{ color: 'var(--accent)' }}>...</span>
        </h2>
      </div>

      {/* Horizontal shelf */}
      <div className="shelf-scroll" style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', padding: '0.25rem 1.75rem 1rem' }}>
        {inProgress.map(item => (
          <ContinueCard
            key={`${item.id}-${item.type}`}
            item={item}
            onPlay={() => handlePlay(item)}
            onDismiss={() => removeFromHistory(item.id, item.type)}
            onGoToDetail={() => navigate(`/detail/${item.type}/${item.id}`)}
          />
        ))}
      </div>
    </section>
  )
}

function ContinueCard({ item, onPlay, onDismiss, onGoToDetail }) {
  const [poster, setPoster] = useState(
    item.poster || (item.poster_path ? IMG(item.poster_path, 'w342') : null)
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuIdx, setMenuIdx] = useState(0)
  const longPressTimer = useRef(null)
  const menuIdxRef = useRef(0)

  // Keep ref in sync for use inside event listener closure
  useEffect(() => { menuIdxRef.current = menuIdx }, [menuIdx])

  const MENU_OPTIONS = [
    { label: '▶  Play', action: onPlay },
    { label: '⬡  Go to detail page', action: onGoToDetail },
    { label: '✕  Remove from list', action: onDismiss },
  ]

  // If poster is missing from the stored entry, fetch it from TMDB
  useEffect(() => {
    if (poster || !item.id || !item.type) return
    getDetail(item.type, item.id)
      .then(d => { if (d?.poster_path) setPoster(IMG(d.poster_path, 'w342')) })
      .catch(() => {})
  }, [item.id, item.type]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── FireTV context menu key trap ───────────────────────────────
  useEffect(() => {
    if (!menuOpen || !IS_FIRETV) return

    // Intercept back button so it closes the menu instead of navigating away
    const prevBack = window.__vaulttvBack
    window.__vaulttvBack = () => {
      setMenuOpen(false)
      window.vaulttvBridge?.backHandled()
    }

    function onKey(e) {
      const k = e.keyCode
      const isUp     = k === 38 || k === 226
      const isDown   = k === 40 || k === 227
      const isSelect = k === 13 || k === 23
      const isLeft   = k === 37 || k === 225
      const isRight  = k === 39 || k === 228

      // All directional + select keys are consumed while menu is open
      if (!isUp && !isDown && !isSelect && !isLeft && !isRight) return
      e.preventDefault()
      e.stopImmediatePropagation()

      if (isLeft || isRight) {
        setMenuOpen(false)
        return
      }
      if (isUp)   { setMenuIdx(i => Math.max(0, i - 1)); return }
      if (isDown) { setMenuIdx(i => Math.min(MENU_OPTIONS.length - 1, i + 1)); return }
      if (isSelect) {
        MENU_OPTIONS[menuIdxRef.current].action()
        setMenuOpen(false)
      }
    }

    window.addEventListener('keydown', onKey, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.__vaulttvBack = prevBack
    }
  }, [menuOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Long-press detection (FireTV SELECT held ≥ 600ms) ─────────
  function handleKeyDown(e) {
    if (!IS_FIRETV) return
    if (e.keyCode === 13 || e.keyCode === 23) {
      e.stopPropagation()
      longPressTimer.current = setTimeout(() => {
        setMenuOpen(true)
        setMenuIdx(0)
      }, 600)
    }
  }

  function handleKeyUp(e) {
    if (!IS_FIRETV) return
    if (e.keyCode === 13 || e.keyCode === 23) {
      clearTimeout(longPressTimer.current)
    }
  }

  const pct      = Math.round((item.progress || 0) * 100)
  const timeLeft = item.durationSec > 0 && item.progressSec > 0
    ? formatTime(item.durationSec - item.progressSec) + ' left'
    : null

  return (
    <div style={{ flexShrink: 0, width: 160, position: 'relative' }}>

      {/* X dismiss button — hidden on FireTV (use long-press instead) */}
      {!IS_FIRETV && (
        <button
          onClick={e => { e.stopPropagation(); onDismiss() }}
          title="Remove"
          style={{ position: 'absolute', top: 6, left: 6, zIndex: 10, background: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
        >
          <FiX size={12} />
        </button>
      )}

      {/* Card */}
      <div
        tabIndex={IS_FIRETV ? 0 : undefined}
        onClick={onPlay}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        style={{ borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-card)', cursor: 'pointer', position: 'relative', outline: 'none' }}
        className="card-hover"
      >
        {/* Poster */}
        {poster
          ? <img src={poster} alt={item.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>No Image</div>
        }

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
        </div>

        {/* Info */}
        <div style={{ padding: '0.45rem 0.6rem 0.55rem' }}>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            {timeLeft
              ? <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{timeLeft}</span>
              : <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{item.type === 'tv' ? 'Series' : 'Movie'}</span>
            }
            <FiPlay size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          </div>
        </div>
      </div>

      {/* ── FireTV context menu popup ── */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setMenuOpen(false)}
          />
          {/* Menu */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            background: 'rgba(12,12,20,0.97)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
            minWidth: 260, overflow: 'hidden',
          }}>
            {/* Title */}
            <div style={{ padding: '0.85rem 1rem 0.6rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </p>
            </div>
            {/* Options */}
            {MENU_OPTIONS.map((opt, i) => (
              <button
                key={i}
                onClick={() => { opt.action(); setMenuOpen(false) }}
                style={{
                  width: '100%', display: 'block', textAlign: 'left',
                  padding: '0.75rem 1rem',
                  background: menuIdx === i ? 'rgba(124,58,237,0.3)' : 'transparent',
                  border: 'none',
                  borderLeft: menuIdx === i ? '3px solid var(--accent)' : '3px solid transparent',
                  color: menuIdx === i ? '#fff' : 'rgba(255,255,255,0.65)',
                  fontSize: '0.88rem', fontWeight: menuIdx === i ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                {opt.label}
              </button>
            ))}
            <p style={{ margin: 0, padding: '0.5rem 1rem 0.65rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              ← → or Back to close
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function formatTime(sec) {
  if (!sec || sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
