import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTrending, getPopular, getTopRated } from '../lib/tmdb'
import { fetchAddonCatalog } from '../lib/addonCatalog'
import { getListItems, traktItemsToPartial } from '../lib/trakt'
import { useParental } from '../context/ParentalContext'
import { useDashboard } from '../context/DashboardContext'
import { useTrakt } from '../context/TraktContext'
import HeroBanner from '../components/HeroBanner'
import MediaShelf from '../components/MediaShelf'
import MediaGrid from '../components/MediaGrid'
import DashboardEditor from '../components/DashboardEditor'
import { FiFilm, FiTv, FiStar, FiTrendingUp, FiEdit2, FiChevronDown } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import ContinueWatching from '../components/ContinueWatching'

const CATEGORIES = [
  { id: 'home',   label: 'Home',     icon: <FiTrendingUp size={15} /> },
  { id: 'movies', label: 'Movies',   icon: <FiFilm size={15} /> },
  { id: 'tv',     label: 'TV Shows', icon: <FiTv size={15} /> },
  { id: 'anime',  label: 'Anime',    icon: <FiStar size={15} /> },
]

const SORT_OPTIONS = [
  { id: 'popular',   label: 'Popular' },
  { id: 'top_rated', label: 'Top Rated' },
]

const GENRES_MOVIE = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','Horror','Mystery','Romance','Sci-Fi','Thriller']
const GENRES_TV    = ['Action','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','Horror','Mystery','Reality','Sci-Fi','Thriller']

export default function Home() {
  const [activeTab, setActiveTab] = useState('home')
  const [sortBy, setSortBy]       = useState('popular')
  const [genre, setGenre]         = useState('')
  const [genreOpen, setGenreOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const { isAllowed } = useParental()
  const { sections }  = useDashboard()
  const navigate = useNavigate()

  const filter = (items = []) => items.filter(i => isAllowed(i.certification))

  // TMDB queries for built-in sections
  const { data: trending }  = useQuery({ queryKey: ['trending'],     queryFn: () => getTrending() })
  const { data: popMovies } = useQuery({ queryKey: ['pop_movies'],   queryFn: () => getPopular('movie') })
  const { data: popTV }     = useQuery({ queryKey: ['pop_tv'],       queryFn: () => getPopular('tv') })
  const { data: topMovies } = useQuery({ queryKey: ['top_movies'],   queryFn: () => getTopRated('movie') })
  const { data: topTV }     = useQuery({ queryKey: ['top_tv'],       queryFn: () => getTopRated('tv') })

  // Movies/TV browse
  const { data: moviesData } = useQuery({ queryKey: ['movies', sortBy], queryFn: () => sortBy === 'top_rated' ? getTopRated('movie') : getPopular('movie'), enabled: activeTab === 'movies' })
  const { data: tvData }     = useQuery({ queryKey: ['tv', sortBy],     queryFn: () => sortBy === 'top_rated' ? getTopRated('tv') : getPopular('tv'),       enabled: activeTab === 'tv' })

  const TMDB_DATA = {
    trending:   filter(trending?.results  || []),
    pop_movies: filter(popMovies?.results || []),
    pop_tv:     filter(popTV?.results     || []),
    top_movies: filter(topMovies?.results || []),
    top_tv:     filter(topTV?.results     || []),
  }

  const trendingItems = TMDB_DATA.trending
  const hero = trendingItems[0]

  const genres = activeTab === 'movies' ? GENRES_MOVIE : GENRES_TV
  const browseItems = filter(
    (activeTab === 'movies' ? moviesData?.results : tvData?.results) || []
  )

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ── Category tabs ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.25rem',
        padding: '1rem 1.75rem 0',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-primary)',
      }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveTab(cat.id); setGenre('') }}
            tabIndex={0}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.6rem 1.1rem', background: 'transparent', border: 'none', cursor: 'pointer',
              color: activeTab === cat.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === cat.id ? 700 : 500, fontSize: '0.9rem',
              borderBottom: activeTab === cat.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s', borderRadius: 0, whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: activeTab === cat.id ? 'var(--accent)' : 'inherit' }}>{cat.icon}</span>
            {cat.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', paddingBottom: 1 }}>

          {/* Sort + Genre (Movies/TV) */}
          {(activeTab === 'movies' || activeTab === 'tv') && (
            <>
              {SORT_OPTIONS.map(s => (
                <button key={s.id} onClick={() => setSortBy(s.id)} style={{
                  padding: '0.35rem 0.8rem', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem',
                  border: '1px solid var(--border)',
                  background: sortBy === s.id ? 'var(--accent)' : 'var(--bg-card)',
                  color: sortBy === s.id ? '#fff' : 'var(--text-secondary)',
                  fontWeight: sortBy === s.id ? 600 : 400, transition: 'all 0.15s',
                }}>{s.label}</button>
              ))}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setGenreOpen(o => !o)} style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.35rem 0.8rem', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem',
                  border: '1px solid var(--border)', background: genre ? 'var(--accent)' : 'var(--bg-card)',
                  color: genre ? '#fff' : 'var(--text-secondary)',
                }}>
                  {genre || 'Genre'} <FiChevronDown size={12} />
                </button>
                {genreOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '0.5rem',
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem',
                    width: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}>
                    <button onClick={() => { setGenre(''); setGenreOpen(false) }} style={{ gridColumn: '1/-1', padding: '0.4rem 0.5rem', background: !genre ? 'var(--bg-card)' : 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4, textAlign: 'left', fontSize: '0.8rem' }}>All Genres</button>
                    {genres.map(g => (
                      <button key={g} onClick={() => { setGenre(g); setGenreOpen(false) }} style={{
                        padding: '0.4rem 0.5rem', background: genre === g ? 'var(--accent)' : 'transparent',
                        border: 'none', color: genre === g ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer', borderRadius: 4, textAlign: 'left', fontSize: '0.8rem',
                      }}>{g}</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Customize button (Home tab only) */}
          {activeTab === 'home' && (
            <button
              onClick={() => setEditorOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.35rem 0.85rem', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem',
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-secondary)', transition: 'all 0.15s',
              }}
            >
              <FiEdit2 size={12} /> Customize
            </button>
          )}
        </div>
      </div>

      {/* ── HOME tab ── */}
      {activeTab === 'home' && (
        <div>
          <HeroBanner item={hero} />
          <ContinueWatching />
          {sections
            .filter(s => s.visible)
            .map(s => (
              <SectionShelf key={s.id} section={s} tmdbData={TMDB_DATA} />
            ))
          }
        </div>
      )}

      {/* ── MOVIES / TV tabs ── */}
      {(activeTab === 'movies' || activeTab === 'tv') && (
        <div style={{ padding: '1.5rem 1.75rem' }}>
          <MediaGrid items={browseItems} />
        </div>
      )}

      {/* ── ANIME tab ── */}
      {activeTab === 'anime' && (
        <div style={{ padding: '2rem 1.75rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Anime streams come from your Anime Kitsu add-on.</p>
          <button className="btn-accent" style={{ marginTop: '1rem' }} onClick={() => navigate('/search?q=anime')}>Browse Anime</button>
        </div>
      )}

      {/* Dashboard editor modal */}
      {editorOpen && <DashboardEditor onClose={() => setEditorOpen(false)} />}
    </div>
  )
}

/** Renders a single shelf — TMDB or addon catalog */
function SectionShelf({ section, tmdbData }) {
  if (section.type === 'tmdb') {
    const items = tmdbData[section.key] || []
    return <MediaShelf title={section.title} items={items} />
  }

  if (section.type === 'addon') {
    return <AddonShelf section={section} />
  }

  if (section.type === 'trakt') {
    return <TraktShelf section={section} />
  }

  return null
}

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || ''

function TraktShelf({ section }) {
  const { clientId, accessToken } = useTrakt()

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['trakt-shelf', section.id, accessToken],
    enabled: !!accessToken && !!clientId,
    staleTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const raw = await getListItems(clientId, accessToken, section.traktListId)
      const partial = traktItemsToPartial(raw).slice(0, 24)
      const detailed = await Promise.all(
        partial.map(item =>
          fetch(`https://api.themoviedb.org/3/${item.media_type}/${item.id}?api_key=${TMDB_KEY}&language=en-US`)
            .then(r => r.ok ? r.json() : null)
            .then(d => d ? { ...item, poster_path: d.poster_path, title: d.title || d.name || item.title } : item)
            .catch(() => item)
        )
      )
      return detailed.filter(i => i.poster_path)
    },
  })

  if (!accessToken) return null

  if (isLoading) return (
    <div style={{ padding: '0 1.75rem', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent)' }} />
        <span style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>{section.title}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loading…</span>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ padding: '0 1.75rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--border)' }} />
        <span style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>{section.title}</span>
      </div>
      <p style={{ margin: 0, fontSize: '0.76rem', color: '#f87171', paddingLeft: '0.9rem' }}>
        Could not load — {error.message}. Check Settings → Trakt.
      </p>
    </div>
  )

  if (!items.length) return null

  return <MediaShelf title={section.title} items={items} />
}

function AddonShelf({ section }) {
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['addon-catalog', section.id],
    queryFn: () => fetchAddonCatalog(section.manifestUrl, section.catalogType, section.catalogId),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  if (isLoading) return (
    <div style={{ padding: '0 1.75rem', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent)' }} />
        <span style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>{section.title}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loading…</span>
      </div>
    </div>
  )

  if (error) {
    const is500 = error.message?.includes('500')
    return (
      <div style={{ padding: '0 1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--border)' }} />
          <span style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>{section.title}</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.76rem', color: '#f87171', paddingLeft: '0.9rem' }}>
          {is500
            ? 'Add-on returned a server error (500). If this is a Trakt list, your Trakt token has likely expired — reconnect Trakt in Stremio, re-export settings, and re-import here.'
            : `Could not load — ${error.message}`}
        </p>
      </div>
    )
  }

  if (!items.length) return null

  return <MediaShelf title={section.title} items={items} />
}
