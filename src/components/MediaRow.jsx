import MediaCard from './MediaCard'

export default function MediaRow({ title, items = [] }) {
  if (!items.length) return null

  return (
    <section style={{ marginBottom: '2rem' }}>
      {/* Plex-style section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.75rem', marginBottom: '0.75rem' }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
        <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em', textTransform: 'uppercase' }}>{title}</h2>
      </div>

      {/* Horizontal scroll shelf */}
      <div style={{
        display: 'flex',
        gap: '0.65rem',
        overflowX: 'auto',
        padding: '0.25rem 1.75rem 0.75rem',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
        paddingBottom: '1rem', // room for hover scale
      }}>
        {items.slice(0, 20).map(item => (
          <MediaCard key={`${item.id}-${item.media_type || item.id}`} item={item} />
        ))}
      </div>
    </section>
  )
}
