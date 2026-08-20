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

  const isVaultflix = theme === 'vaultflix'
  const isVaultPlus = theme === 'vaultplus'
  const isCinematic = isVaultflix || isVaultPlus   // both use backdrop 16:9 cards

  // Vault+ uses blue "Explore All" tint; Vaultflix uses teal
  const exploreColor = isVaultPlus ? '#1a8fff' : '#54b9c5'

  // D-pad left/right navigation within a shelf row
  function handleKeyDown(e, idx, cards) {
    if (e.key === 'ArrowRight') { e.preventDefault(); cards[Math.min(idx + 1, cards.length - 1)]?.focus() }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); cards[Math.max(idx - 1, 0)]?.focus() }
  }

  // Cinematic themes: wider 16:9 backdrop cards
  const cardWidth = isCinematic
    ? (density === 1 ? 300 : density === 3 ? 180 : 240)
    : (density === 1 ? 200 : density === 3 ? 110 : 150)

  return (
    <section style={{ marginBottom: isCinematic ? '1.5rem' : '2rem' }}>
      {/* Section header */}
      {isCinematic ? (
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
            fontSize: '0.75rem', fontWeight: 700, color: exploreColor,
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
        className={isCinematic ? 'shelf-scroll cinematic-shelf' : 'shelf-scroll'}
        style={{
          display: 'flex',
          gap: isCinematic ? '0.25rem' : (density === 1 ? '1rem' : density === 3 ? '0.45rem' : '0.65rem'),
          overflowX: 'auto',
          padding: isCinematic ? '0.25rem 3rem 0.5rem' : '0.25rem 1.75rem 1rem',
        }}
      >
        {items.slice(0, 20).map((item, idx) => {
          const cards = rowRef.current?.querySelectorAll('[data-card]') || []
          return (
            <MediaCard
              key={`${item.id}-${item.media_type || idx}`}
              item={item}
              width={cardWidth}
              useBackdrop={isCinematic}
              onKeyDown={e => handleKeyDown(e, idx, Array.from(cards))}
            />
          )
        })}
      </div>

      {/* Shelf ledge — poster-style rows only (backdrop rows are already a
          Netflix-style flat list, a ledge under 16:9 cards doesn't read as
          a shelf the same way vertical posters do). Purely decorative:
          a glossy glass plank the row appears to rest on, plus a soft
          blurred shadow puddle beneath it to sell the sense of depth. */}
      {!isCinematic && (
        <div style={{ padding: '0 1.75rem', marginTop: '-0.55rem' }} aria-hidden="true">
          <div style={{
            height: 15,
            borderRadius: 3,
            position: 'relative',
            background: `linear-gradient(180deg,
              rgba(255,255,255,0.16) 0%,
              color-mix(in srgb, var(--accent) 14%, rgba(255,255,255,0.05)) 14%,
              color-mix(in srgb, var(--accent) 10%, rgba(20,20,28,0.6)) 48%,
              rgba(0,0,0,0.8) 100%)`,
            boxShadow: '0 16px 20px -10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.5)',
            transform: 'perspective(260px) rotateX(42deg)',
            transformOrigin: 'top',
          }} />
          <div style={{
            height: 20, marginTop: -8,
            background: 'radial-gradient(ellipse 70% 100% at center, rgba(0,0,0,0.5), transparent 75%)',
            filter: 'blur(3px)',
          }} />
        </div>
      )}
    </section>
  )
}
