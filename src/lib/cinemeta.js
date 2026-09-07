/**
 * Cinemeta IMDb lookup
 *
 * Fallback resolution of an IMDb id for titles where TMDB's
 * external_ids.imdb_id is empty, which is a real and recurring gap in TMDB's
 * data, Danger Force being one example. Stremio resolves these through
 * Cinemeta's own catalogue search, so VaultTV does the same rather than fall
 * back to a tmdb: id that stream add-ons do not recognise.
 */

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
