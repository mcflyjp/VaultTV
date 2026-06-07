import MediaCard from './MediaCard'
import { useLayout } from '../context/LayoutContext'

export default function MediaGrid({ items = [] }) {
  const { density } = useLayout()
  const cardWidth = density === 1 ? 200 : density === 3 ? 110 : 150

  if (!items.length) return (
    <p style={{ color: 'var(--text-secondary)', marginTop: '2rem', textAlign: 'center' }}>No results yet — try changing the sort or genre filter.</p>
  )

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: density === 1 ? '1rem' : density === 3 ? '0.45rem' : '0.65rem',
    }}>
      {items.map((item, idx) => (
        <MediaCard key={`${item.id}-${item.media_type || idx}`} item={item} width={cardWidth} />
      ))}
    </div>
  )
}
