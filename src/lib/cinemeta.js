// Fallback IMDb ID resolution for titles where TMDB's external_ids.imdb_id
// is empty (a real, recurring TMDB data gap — e.g. Danger Force). Stremio
// itself resolves these via Cinemeta's own catalog search, so we do the same
// rather than falling back to a `tmdb:` id that stream addons don't recognize.
export async function findImdbIdByTitle(title, year, mediaType) {
  if (!title) return null
  const stremioType = mediaType === 'tv' ? 'series' : 'movie'
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/catalog/${stremioType}/top/search=${encodeURIComponent(title)}.json`)
    if (!res.ok) return null
    const data = await res.json()
    const metas = data.metas || []
    if (!metas.length) return null
    // Prefer an exact title match, and one whose release year matches when we have it
    const norm = s => (s || '').toLowerCase().trim()
    const exact = metas.filter(m => norm(m.name) === norm(title))
    const pool  = exact.length ? exact : metas
    const withYear = year && pool.find(m => (m.releaseInfo || '').startsWith(String(year)))
    return (withYear || pool[0])?.id || null
  } catch {
    return null
  }
}
