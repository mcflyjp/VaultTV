import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { search } from '../lib/tmdb'
import { useParental } from '../context/ParentalContext'
import MediaCard from '../components/MediaCard'
import { FiSearch } from 'react-icons/fi'

export default function Search() {
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  const { isAllowed } = useParental()

  const { data, isLoading } = useQuery({
    queryKey: ['search', q],
    queryFn: () => search(q),
    enabled: q.length > 1,
  })

  const results = (data?.results || []).filter(i =>
    i.media_type !== 'person' && isAllowed(i.certification)
  )

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 700 }}>
        {q ? `Results for "${q}"` : 'Search'}
      </h1>

      {isLoading && <p style={{ color: 'var(--text-secondary)' }}>Searching…</p>}

      {!isLoading && q && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>
          <FiSearch size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p>No results found for "{q}"</p>
        </div>
      )}

      {!q && (
        <p style={{ color: 'var(--text-secondary)' }}>Use the search bar above to find movies and shows.</p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '0.75rem',
        marginTop: '1.5rem',
      }}>
        {results.map(item => <MediaCard key={`${item.id}-${item.media_type}`} item={item} />)}
      </div>
    </div>
  )
}
