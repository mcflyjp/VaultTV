/**
 * Subtitle helpers — builds companion subtitle proxy URLs and
 * provides fetch utilities for auto-downloading VTT files.
 */

const COMPANION = 'http://127.0.0.1:7842'

/**
 * Build a URL to the companion's /subtitles proxy endpoint.
 * The companion fetches + converts the SRT from OpenSubtitles, so the
 * returned URL can be used directly as a <track src="..."> in the player.
 *
 * Returns null if neither imdbId nor title is provided.
 *
 * @param {object} opts
 * @param {string}  [opts.imdbId]   - IMDB ID like "tt1234567"
 * @param {string}  [opts.title]    - Fallback: movie/show title for text search
 * @param {string}  [opts.year]     - Release year (improves title search)
 * @param {string}  [opts.lang]     - ISO 639-1 language code (default 'en')
 * @param {string}  [opts.mediaType]- 'movie' | 'tv' (default 'movie')
 * @param {number}  [opts.season]   - Season number for TV episodes
 * @param {number}  [opts.episode]  - Episode number for TV episodes
 * @returns {string|null}
 */
export function companionSubUrl({ imdbId, title, year, lang = 'en', mediaType = 'movie', season, episode }) {
  if (!imdbId && !title) return null

  const params = new URLSearchParams({ lang })

  if (imdbId) {
    const id = (season != null && episode != null)
      ? `${imdbId}:${season}:${episode}`
      : imdbId
    params.set('imdb_id', id)
  } else {
    params.set('query', title)
    if (year) params.set('year', year)
  }

  return `${COMPANION}/subtitles?${params.toString()}`
}

/**
 * Fetch a VTT subtitle file from the companion proxy.
 * Resolves with a blob: URL on success; resolves with null on failure
 * (companion offline, no subs found, etc.).
 *
 * @returns {Promise<string|null>}
 */
export async function fetchCompanionSub(opts) {
  const url = companionSubUrl(opts)
  if (!url) return null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout?.(12000) })
    if (!r.ok) return null
    const text = await r.text()
    if (!text.startsWith('WEBVTT')) return null
    const blob = new Blob([text], { type: 'text/vtt' })
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}
