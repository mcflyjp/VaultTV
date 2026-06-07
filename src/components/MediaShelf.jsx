import { useRef } from 'react'
import MediaCard from './MediaCard'
import { useLayout } from '../context/LayoutContext'

export default function MediaShelf({ title, items = [] }) {
  const { density } = useLayout()
  const rowRef = useRef(null)
  if (!items.length) return null

  // D-pad left/right navigation within a shelf row
  function handleKeyDown(e, idx, cards) {
    if (e.key === 'ArrowRight') { e.preventDefault(); cards[Math.min(idx + 1, cards.length - 1)]?.focus() }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); cards[Math.max(idx - 1, 0)]?.focus() }
  }

  const cardWidth = density === 1 ? 200 : density === 3 ? 110 : 150

  return (
    <section style={{ marginBottom: '2rem' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.75rem', marginBottom: '0.75rem' }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
        <h2 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</h2>
      </div>

      {/* Horizontal shelf */}
      <div
        ref={rowRef}
        className="shelf-scroll"
        style={{
          display: 'flex',
          gap: density === 1 ? '1rem' : density === 3 ? '0.45rem' : '0.65rem',
          overflowX: 'auto',
          padding: '0.25rem 1.75rem 1rem',
        }}
      >
        {items.slice(0, 20).map((item, idx) => {
          const cards = rowRef.current?.querySelectorAll('[data-card]') || []
          return (
            <MediaCard
              key={`${item.id}-${item.media_type || idx}`}
              item={item}
              width={cardWidth}
              onKeyDown={e => handleKeyDown(e, idx, Array.from(cards))}
            />
          )
        })}
      </div>
    </section>
  )
}
