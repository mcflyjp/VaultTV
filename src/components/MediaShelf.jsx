import { useRef, useState } from 'react'
import MediaCard from './MediaCard'
import { useLayout } from '../context/LayoutContext'
import { useTheme } from '../context/ThemeContext'

export default function MediaShelf({ title, items = [] }) {
  const { density } = useLayout()
  const { theme } = useTheme()
  const rowRef = useRef(null)
  const [titleHovered, setTitleHovered] = useState(false)
  if (!items.length) return null

  const isNetflix = theme === 'netflix'

  // D-pad left/right navigation within a shelf row
  function handleKeyDown(e, idx, cards) {
    if (e.key === 'ArrowRight') { e.preventDefault(); cards[Math.min(idx + 1, cards.length - 1)]?.focus() }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); cards[Math.max(idx - 1, 0)]?.focus() }
  }

  // Netflix: wider cards at 16:9 ratio. 240px wide → ~135px tall — feels right.
  const cardWidth = isNetflix
    ? (density === 1 ? 300 : density === 3 ? 180 : 240)
    : (density === 1 ? 200 : density === 3 ? 110 : 150)

  return (
    <section style={{ marginBottom: isNetflix ? '1.5rem' : '2rem' }}>
      {/* Section header */}
      {isNetflix ? (
        // Netflix style: plain left-aligned text, no accent bar, no uppercase
        // "Explore All ›" appears on hover
        <div
          style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', padding: '0 3rem', marginBottom: '0.6rem', cursor: 'default' }}
          onMouseEnter={() => setTitleHovered(true)}
          onMouseLeave={() => setTitleHovered(false)}
        >
          <h2 className="shelf-heading" style={{
            margin: 0, fontSize: '1rem', fontWeight: 700,
            color: '#e5e5e5', letterSpacing: 'normal', textTransform: 'none',
          }}>{title}</h2>
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, color: '#54b9c5',
            opacity: titleHovered ? 1 : 0, transition: 'opacity 0.2s',
            whiteSpace: 'nowrap',
          }}>Explore All &rsaquo;</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.75rem', marginBottom: '0.75rem' }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
          <h2 className="shelf-heading" style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</h2>
        </div>
      )}

      {/* Horizontal shelf */}
      <div
        ref={rowRef}
        className={isNetflix ? 'shelf-scroll netflix-shelf' : 'shelf-scroll'}
        style={{
          display: 'flex',
          gap: isNetflix ? '0.25rem' : (density === 1 ? '1rem' : density === 3 ? '0.45rem' : '0.65rem'),
          overflowX: 'auto',
          padding: isNetflix ? '0.25rem 3rem 0.5rem' : '0.25rem 1.75rem 1rem',
        }}
      >
        {items.slice(0, 20).map((item, idx) => {
          const cards = rowRef.current?.querySelectorAll('[data-card]') || []
          return (
            <MediaCard
              key={`${item.id}-${item.media_type || idx}`}
              item={item}
              width={cardWidth}
              useBackdrop={isNetflix}
              onKeyDown={e => handleKeyDown(e, idx, Array.from(cards))}
            />
          )
        })}
      </div>
    </section>
  )
}
