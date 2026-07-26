import { useMemo, useRef, useState } from 'react'

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

function firstLetterOf(title) {
  const c = (title || '').trim()[0]?.toUpperCase()
  return c && /[A-Z]/.test(c) ? c : '#'
}

/**
 * Plex-style A-Z jump scroller, fixed to the right edge. Dimmed at rest,
 * full opacity while the user is actively hovering/dragging it. Sits at a
 * lower z-index than LibraryPanel/ProfilePanel's overlay (800) so those
 * slide-in panels always cover it.
 */
export default function AlphabetScroller({ items }) {
  const [active, setActive] = useState(false)
  const barRef = useRef(null)

  const available = useMemo(() => {
    const set = new Set()
    items.forEach(i => set.add(firstLetterOf(i.title)))
    return set
  }, [items])

  if (items.length < 20) return null

  function jumpTo(letter) {
    const el = document.querySelector(`[data-first-letter="${letter}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handlePointer(clientY) {
    const rect = barRef.current.getBoundingClientRect()
    const idx = Math.min(LETTERS.length - 1, Math.max(0, Math.floor((clientY - rect.top) / (rect.height / LETTERS.length))))
    const letter = LETTERS[idx]
    if (available.has(letter)) jumpTo(letter)
  }

  return (
    <div
      ref={barRef}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onMouseDown={e => { setActive(true); handlePointer(e.clientY) }}
      onMouseMove={e => { if (e.buttons === 1) handlePointer(e.clientY) }}
      onMouseUp={() => setActive(false)}
      onTouchStart={e => { setActive(true); handlePointer(e.touches[0].clientY) }}
      onTouchMove={e => { e.preventDefault(); handlePointer(e.touches[0].clientY) }}
      onTouchEnd={() => setActive(false)}
      style={{
        position: 'fixed', right: 6, top: '50%', transform: 'translateY(-50%)',
        zIndex: 150, // below LibraryPanel/ProfilePanel overlay (800) and Sidebar drawer (700)
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 1, padding: '0.5rem 0.25rem', borderRadius: 12,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        opacity: active ? 1 : 0.35,
        transition: 'opacity 0.2s',
        touchAction: 'none', userSelect: 'none', cursor: 'pointer',
      }}
    >
      {LETTERS.map(letter => (
        <span
          key={letter}
          onClick={() => jumpTo(letter)}
          style={{
            fontSize: '0.62rem', fontWeight: 700, lineHeight: 1.5,
            padding: '0 4px', borderRadius: 3,
            color: available.has(letter) ? 'var(--text-primary)' : 'var(--text-secondary)',
            opacity: available.has(letter) ? 1 : 0.4,
          }}
        >
          {letter}
        </span>
      ))}
    </div>
  )
}
