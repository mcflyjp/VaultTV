import { useState, useRef, useEffect } from 'react'
import { useDashboard } from '../context/DashboardContext'
import { useAddons } from '../context/AddonsContext'
import { useTrakt } from '../context/TraktContext'
import { FiEye, FiEyeOff, FiX, FiRotateCcw, FiPlus, FiMenu, FiRadio } from 'react-icons/fi'

export default function DashboardEditor({ onClose }) {
  const { sections, toggleVisible, reorder, addAddonSection, removeSection, reset } = useDashboard()
  const { addons } = useAddons()
  const { connected: traktConnected, lists: traktLists } = useTrakt()
  const [dragFrom, setDragFrom]   = useState(null)
  const [dragOver, setDragOver]   = useState(null)
  const touchFrom  = useRef(null)
  const touchY     = useRef(null)

  // Safety net: if the browser drops the dragend event (tab switch, ESC, etc.)
  // clear the stuck highlight state on the next any-mouse-move or mouseup
  useEffect(() => {
    function cleanup() { setDragFrom(null); setDragOver(null) }
    document.addEventListener('dragend', cleanup)
    document.addEventListener('mouseup', cleanup)
    return () => {
      document.removeEventListener('dragend', cleanup)
      document.removeEventListener('mouseup', cleanup)
    }
  }, [])

  // ── Desktop drag ──
  function onDragStart(e, idx) {
    setDragFrom(idx)
    e.dataTransfer.effectAllowed = 'move'
    // ghost image
    e.dataTransfer.setDragImage(e.currentTarget, 20, 20)
  }
  function onDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(idx)
  }
  function onDrop(e, idx) {
    e.preventDefault()
    if (dragFrom !== null) reorder(dragFrom, idx)
    setDragFrom(null)
    setDragOver(null)
  }
  function onDragLeave(e) {
    // Only clear if leaving the row entirely (not entering a child element)
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null)
  }
  function onDragEnd() { setDragFrom(null); setDragOver(null) }

  // ── Touch drag (mobile/TV) ──
  function onTouchStart(e, idx) {
    touchFrom.current = idx
    touchY.current    = e.touches[0].clientY
  }
  function onTouchMove(e) {
    e.preventDefault() // stop scroll during drag
    touchY.current = e.touches[0].clientY
  }
  function onTouchEnd(e) {
    if (touchFrom.current === null) return
    const el   = document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
    const row  = el?.closest('[data-row-idx]')
    const toIdx = row ? Number(row.dataset.rowIdx) : null
    if (toIdx !== null && toIdx !== touchFrom.current) reorder(touchFrom.current, toIdx)
    touchFrom.current = null
  }

  // ── Addon catalog sections to add ──
  // Driven by catalogs stored in the addon at import time — no hardcoding needed
  const addonSections = []
  for (const addon of addons) {
    if (!addon.manifestUrl || !addon.catalogs?.length) continue
    for (const cat of addon.catalogs) {
      const sectionId = `addon_${addon.id}_${cat.type}_${cat.id}`
      if (sections.find(s => s.id === sectionId)) continue
      addonSections.push({
        sectionId,
        label: cat.name || cat.id,
        addonName: addon.name,
        addonId: addon.id,
        manifestUrl: addon.manifestUrl,
        catalogType: cat.type,
        catalogId: cat.id,
      })
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth: 540,
        maxHeight: '85vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Customize Dashboard</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Drag to reorder · toggle eye to show/hide</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={reset} title="Reset to defaults" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FiRotateCcw size={13} /> Reset
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.35rem', display: 'flex' }}>
              <FiX size={20} />
            </button>
          </div>
        </div>

        {/* Section list — onWheel stops scroll from bleeding through to the page behind */}
        <div
          style={{ overflowY: 'auto', flex: 1, padding: '0.5rem' }}
          onWheel={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
        >

          {sections.map((s, idx) => (
            <div
              key={s.id}
              data-row-idx={idx}
              draggable
              onDragStart={e => onDragStart(e, idx)}
              onDragOver={e => onDragOver(e, idx)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              onTouchStart={e => onTouchStart(e, idx)}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.65rem 0.75rem', borderRadius: 8, marginBottom: 4,
                background: dragOver === idx ? 'var(--bg-card)' : 'transparent',
                border: dragOver === idx ? '1px solid var(--accent)' : '1px solid transparent',
                opacity: dragFrom === idx ? 0.4 : 1,
                cursor: 'grab', transition: 'background 0.1s, border 0.1s',
                userSelect: 'none',
              }}
            >
              {/* Drag handle */}
              <FiMenu size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0, cursor: 'grab' }} />

              {/* Title */}
              <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500, color: s.visible ? 'var(--text-primary)' : 'var(--text-secondary)', textDecoration: s.visible ? 'none' : 'line-through' }}>
                {s.title}
                {s.type === 'addon' && <span style={{ fontSize: '0.7rem', color: 'var(--accent)', marginLeft: 6, background: 'rgba(124,58,237,0.15)', padding: '1px 6px', borderRadius: 10 }}>Add-on</span>}
              {s.type === 'trakt' && <span style={{ fontSize: '0.7rem', color: '#ef4444', marginLeft: 6, background: 'rgba(239,68,68,0.15)', padding: '1px 6px', borderRadius: 10 }}>Trakt</span>}
              </span>

              {/* Visibility toggle */}
              <button
                onClick={() => toggleVisible(s.id)}
                title={s.visible ? 'Hide section' : 'Show section'}
                style={{ background: 'none', border: 'none', color: s.visible ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}
              >
                {s.visible ? <FiEye size={16} /> : <FiEyeOff size={16} />}
              </button>

              {/* Remove (addon + trakt sections) */}
              {(s.type === 'addon' || s.type === 'trakt') && (
                <button onClick={() => removeSection(s.id)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}>
                  <FiX size={15} />
                </button>
              )}
            </div>
          ))}

          {/* Add Trakt lists */}
          {traktConnected && (() => {
            const allTraktLists = [{ id: 'watchlist', name: 'Watchlist' }, ...traktLists]
            const available = allTraktLists.filter(l => !sections.find(s => s.id === `trakt_${l.id}`))
            if (!available.length) return null
            return (
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <p style={{ margin: '0 0 0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <FiRadio size={11} /> Add from Trakt
                </p>
                {available.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', borderRadius: 8, marginBottom: 4 }}>
                    <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{l.name}</span>
                    <button
                      onClick={() => addAddonSection({
                        id: `trakt_${l.id}`, title: l.name, type: 'trakt', traktListId: l.id,
                      })}
                      style={{ background: '#ef4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '0.3rem 0.7rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <FiPlus size={12} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Add addon sections */}
          {addonSections.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Add from Add-ons</p>
              {addonSections.map(a => (
                <div key={a.sectionId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', borderRadius: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{a.label}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.6, marginLeft: 6 }}>{a.addonName}</span>
                  </div>
                  <button
                    onClick={() => addAddonSection({
                      id: a.sectionId, title: a.label, type: 'addon',
                      manifestUrl: a.manifestUrl, catalogType: a.catalogType, catalogId: a.catalogId,
                    })}
                    style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '0.3rem 0.7rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <FiPlus size={12} /> Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-accent" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
