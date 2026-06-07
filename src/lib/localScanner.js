const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts', '.m2ts'])

/**
 * Walk a FileSystemDirectoryHandle recursively, return all video FileSystemFileHandles.
 * `rootFolderName` is the immediate child-folder of the user-selected root (depth=1).
 * For a TV library structured as:  Root / Show Name / Season 1 / ep.mkv
 * rootFolderName will be "Show Name", which we use as the TMDB search title
 * instead of the often-useless episode filename.
 */
export async function scanDirectory(dirHandle, depth = 0, rootFolderName = null) {
  if (depth > 5) return [] // don't go too deep
  const files = []
  for await (const [name, handle] of dirHandle) {
    if (handle.kind === 'file') {
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
      if (VIDEO_EXTS.has(ext)) files.push({ name, handle, dirHandle, rootFolderName })
    } else if (handle.kind === 'directory') {
      // Capture the show/movie folder name at depth 0 → depth 1 transition
      const childRoot = depth === 0 ? name : rootFolderName
      const sub = await scanDirectory(handle, depth + 1, childRoot)
      files.push(...sub)
    }
  }
  return files
}

/**
 * Parse a video filename into { title, year, season, episode }
 * Handles patterns like:
 *   Movie Title (2023).mkv
 *   Movie.Title.2023.1080p.mkv
 *   Show Name S01E05.mp4
 *   Show.Name.S02E03.720p.mkv
 */
export function parseFilename(filename) {
  // Strip extension
  let name = filename.slice(0, filename.lastIndexOf('.')) || filename

  // TV: detect SxxExx
  const tvMatch = name.match(/^(.+?)[.\s_-]+[Ss](\d{1,2})[Ee](\d{1,2})/i)
  if (tvMatch) {
    const rawTitle = tvMatch[1].replace(/[._]/g, ' ').trim()
    return {
      title:   cleanTitle(rawTitle),
      year:    null,
      season:  Number(tvMatch[2]),
      episode: Number(tvMatch[3]),
      isTV:    true,
    }
  }

  // Movie: detect (year) or .year.
  const yearParen = name.match(/^(.+?)\s*\((\d{4})\)/)
  if (yearParen) {
    return { title: cleanTitle(yearParen[1]), year: yearParen[2], isTV: false }
  }

  const yearDot = name.match(/^(.+?)[.\s](\d{4})[.\s]/)
  if (yearDot) {
    return { title: cleanTitle(yearDot[1]), year: yearDot[2], isTV: false }
  }

  // Fallback — use whole name, cleaned
  return { title: cleanTitle(name), year: null, isTV: false }
}

function cleanTitle(raw) {
  return raw
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Capitalise first letter of each word
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** Match a parsed filename against TMDB — returns best result or null.
 *  forceType: 'movie' | 'tv' — overrides filename-parsed guess */
export async function matchTmdb(parsed, tmdbKey, forceType) {
  const { title, year, isTV } = parsed
  const type = forceType || (isTV ? 'tv' : 'movie')
  const base = 'https://api.themoviedb.org/3'

  try {
    const params = new URLSearchParams({ api_key: tmdbKey, query: title, language: 'en-US' })
    if (year) params.set('year', year)
    const res = await fetch(`${base}/search/${type}?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    const results = data.results || []
    if (!results.length) {
      // Try multi-search as fallback
      const res2 = await fetch(`${base}/search/multi?${new URLSearchParams({ api_key: tmdbKey, query: title })}`)
      if (!res2.ok) return null
      const data2 = await res2.json()
      const r = (data2.results || []).find(r => r.media_type === 'movie' || r.media_type === 'tv')
      return r ? normalise(r, r.media_type) : null
    }
    return normalise(results[0], type)
  } catch {
    return null
  }
}

function normalise(r, type) {
  return {
    tmdbId:      r.id,
    title:       r.title || r.name || '',
    media_type:  type,
    poster_path: r.poster_path || null,
    year:        (r.release_date || r.first_air_date || '').slice(0, 4),
    overview:    r.overview || '',
    vote_average: r.vote_average || 0,
  }
}
