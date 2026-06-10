const BASE = 'https://api.themoviedb.org/3'
// When served by VaultTV Server, the key is injected into window.__TMDB_KEY
// so it never needs to be baked into the built JS (useful for sharing the build).
const KEY  = (typeof window !== 'undefined' && window.__TMDB_KEY) || import.meta.env.VITE_TMDB_KEY || ''

export const IMG = (path, size = 'w500') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null

async function tmdb(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('api_key', KEY)
  url.searchParams.set('language', 'en-US')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`)
  return res.json()
}

export const getTrending   = (type = 'all', window = 'week') => tmdb(`/trending/${type}/${window}`)
export const getPopular    = (type = 'movie') => tmdb(`/${type}/popular`)
export const getTopRated   = (type = 'movie') => tmdb(`/${type}/top_rated`)
export const search        = (query, page = 1) => tmdb('/search/multi', { query, page, include_adult: false })
export const getDetail     = (type, id) => tmdb(`/${type}/${id}`, { append_to_response: 'credits,videos,content_ratings,release_dates,external_ids' })
export const getSeason     = (id, season) => tmdb(`/tv/${id}/season/${season}`)
export const getSimilar    = (type, id) => tmdb(`/${type}/${id}/similar`)
export const getVideos     = (type, id) => tmdb(`/${type}/${id}/videos`)

export const YT_EMBED = 'https://www.youtube-nocookie.com/embed'

/** Pick the best background trailer key from a videos result */
export function pickTrailer(videos = []) {
  const rank = ['Trailer', 'Teaser', 'Clip', 'Featurette']
  for (const type of rank) {
    const v = videos.find(v => v.type === type && v.site === 'YouTube' && v.official !== false)
    if (v) return v.key
  }
  return videos.find(v => v.site === 'YouTube')?.key || null
}

/** Pick an ambient theme/score clip for a TV show */
export function pickTheme(videos = []) {
  const keywords = [
    'theme', 'score', 'soundtrack', 'main title', 'opening',
    'title sequence', 'opening credits', 'title card', 'intro',
    'opening theme', 'main theme', 'theme song',
  ]
  // Prefer videos explicitly typed as 'Opening Credits' by TMDB
  const openingCredits = videos.find(v =>
    v.site === 'YouTube' && v.type === 'Opening Credits'
  )
  if (openingCredits) return openingCredits.key

  return videos.find(v =>
    v.site === 'YouTube' &&
    v.type !== 'Trailer' &&   // never pick a trailer as a theme
    v.type !== 'Teaser'  &&   // never pick a teaser as a theme
    keywords.some(kw => v.name?.toLowerCase().includes(kw))
  )?.key || null
}

export function getCertification(detail, type) {
  if (!detail) return ''
  if (type === 'movie') {
    const us = detail.release_dates?.results?.find(r => r.iso_3166_1 === 'US')
    return us?.release_dates?.[0]?.certification || ''
  }
  const us = detail.content_ratings?.results?.find(r => r.iso_3166_1 === 'US')
  return us?.rating || ''
}
