const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || ''

/**
 * Fetch a Stremio addon catalog and return TMDB-enriched items.
 * addonBaseUrl: the manifestUrl with /manifest.json stripped
 * catalogType:  e.g. "static(clp)", "trakt(clp)"
 * catalogId:    e.g. "movies", "dads_movies"
 */
export async function fetchAddonCatalog(addonBaseUrl, catalogType, catalogId) {
  // Keep query params (e.g. ?jwtToken=...) — just swap the path segment
  let url
  try {
    const u = new URL(addonBaseUrl)
    // Do NOT encodeURIComponent here — addon servers route on the literal path
    // e.g. /catalog/static(clp)/movies.json, not /catalog/static%28clp%29/movies.json
    u.pathname = u.pathname.replace(/\/manifest\.json$/, '') + `/catalog/${catalogType}/${catalogId}.json`
    url = u.toString()
  } catch {
    const base = addonBaseUrl.replace(/\/manifest\.json$/, '')
    url = `${base}/catalog/${encodeURIComponent(catalogType)}/${catalogId}.json`
  }

  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Addon catalog ${res.status}`)
  const data = await res.json()

  const metas = data.metas || []
  if (!metas.length) return []

  // Metas have imdbId (tt...) — enrich with TMDB in parallel (max 20)
  const enriched = await Promise.all(
    metas.slice(0, 20).map(async meta => {
      try {
        const imdbId = meta.imdb_id || meta.id
        if (!imdbId?.startsWith('tt')) return null
        const r = await fetch(
          `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`
        )
        const found = await r.json()
        const item  = found.movie_results?.[0] || found.tv_results?.[0]
        if (!item) return null
        return {
          ...item,
          media_type: found.movie_results?.[0] ? 'movie' : 'tv',
        }
      } catch { return null }
    })
  )

  return enriched.filter(Boolean)
}
