const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'])

// Subfolder names that contain extras, not the main feature
const SKIP_FOLDERS = new Set([
  'shorts', 'short', 'featurettes', 'featurette', 'samples', 'sample',
  'extras', 'extra', 'behind the scenes', 'behindthescenes',
  'deleted scenes', 'deletedscenes', 'interviews', 'interview',
  'scenes', 'trailers', 'trailer', 'specials', 'special',
  'bonus', 'bonus content', 'making of', 'makingof',
])

function shouldSkipFolder(name) {
  return SKIP_FOLDERS.has(name.toLowerCase().replace(/[-_.]/g, ' ').trim())
}

function shouldSkipFile(name) {
  const lower = name.toLowerCase()
  // Common sample file patterns
  return /[.\s_-]sample[.\s_-]|[.\s_-]sample\.|^sample[.\s_-]/i.test(lower)
}

/**
 * Parse quality metadata from a filename.
 * Returns { resolution, source, codec, score, label }
 * Higher score = better quality.
 */
export function parseQuality(filename) {
  const f = filename.toUpperCase()
  let score = 0, resolution = '', source = '', codec = ''

  // Resolution
  if (/2160P|4K|UHD/.test(f))  { resolution = '4K';    score += 4000 }
  else if (/1080P/.test(f))    { resolution = '1080p'; score += 1080 }
  else if (/720P/.test(f))     { resolution = '720p';  score += 720  }
  else if (/480P/.test(f))     { resolution = '480p';  score += 480  }
  else                         { resolution = 'SD';    score += 100  }

  // Source (streaming platform tags imply WEB quality)
  if (/BLURAY|BDRIP|BLU-RAY/.test(f))          { source = 'BluRay'; score += 300 }
  else if (/WEB-DL|WEBDL/.test(f))             { source = 'WEB-DL'; score += 220 }
  else if (/AMZN|DSNP|NF|HULU|ATVP|HBO/.test(f)){ source = 'WEB';  score += 200 }
  else if (/WEBRIP/.test(f))                   { source = 'WEBRip'; score += 180 }
  else if (/HDTV/.test(f))                     { source = 'HDTV';   score += 100 }
  else if (/DVDRIP|DVD/.test(f))               { source = 'DVDRip'; score += 50  }

  // Codec
  if (/AV1/.test(f))                           { codec = 'AV1';   score += 20 }
  else if (/X265|H\.265|HEVC/.test(f))         { codec = 'HEVC';  score += 15 }
  else if (/X264|H\.264|AVC/.test(f))          { codec = 'H.264'; score += 5  }

  const label = [resolution, source, codec].filter(Boolean).join(' ') || 'Unknown'
  return { resolution, source, codec, score, label }
}

/**
 * Walk a FileSystemDirectoryHandle recursively, return all video FileSystemFileHandles.
 * `rootFolderName` is the immediate child-folder of the user-selected root (depth=1).
 * For a TV library structured as:  Root / Show Name / Season 1 / ep.mkv
 * rootFolderName will be "Show Name", which we use as the TMDB search title
 * instead of the often-useless episode filename.
 */
export async function scanDirectory(dirHandle, depth = 0, rootFolderName = null) {
  if (depth > 8) return [] // increased from 5 to handle deeper nesting
  const files = []
  let entryCount = 0

  try {
    // Use .values() + handle.name — most reliable across Chrome versions
    for await (const handle of dirHandle.values()) {
      const name = handle.name
      entryCount++
      if (handle.kind === 'file') {
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
        if (VIDEO_EXTS.has(ext)) {
          if (shouldSkipFile(name)) {
            console.log(`[scanner] Skipping sample file: ${name}`)
          } else {
            files.push({ name, handle, dirHandle, rootFolderName })
          }
        }
      } else if (handle.kind === 'directory') {
        if (shouldSkipFolder(name)) {
          console.log(`[scanner] Skipping extras folder: ${name}`)
          continue
        }
        const childRoot = depth === 0 ? name : rootFolderName
        console.log(`[scanner] Entering subdir: ${name} (depth ${depth + 1}, rootFolder: ${childRoot})`)
        try {
          const sub = await scanDirectory(handle, depth + 1, childRoot)
          console.log(`[scanner] Subdir "${name}" → ${sub.length} files`)
          files.push(...sub)
        } catch (subErr) {
          console.warn(`[scanner] Could not read subdir "${name}":`, subErr.message)
        }
      }
    }
  } catch (err) {
    console.error(`[scanner] Failed to iterate dir at depth ${depth} (root: ${rootFolderName}):`, err)
  }

  if (depth === 0) {
    console.log(`[scanner] Root scan complete: ${entryCount} entries at root, ${files.length} video files total`)
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

/**
 * Score a TMDB result against the query title.
 * Returns a number 0–100; higher = better match.
 */
function titleScore(resultTitle, query) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  const a = norm(resultTitle)
  const b = norm(query)
  if (a === b) return 100
  // Word overlap: what fraction of query words appear in the result title
  const queryWords  = b.split(' ').filter(Boolean)
  const resultWords = new Set(a.split(' ').filter(Boolean))
  const overlap = queryWords.filter(w => resultWords.has(w)).length
  const precision = overlap / Math.max(queryWords.length, 1)
  // Penalise length difference — "Dexter" is shorter than "Dexter New Blood"
  const lenPenalty = Math.abs(a.length - b.length) / Math.max(a.length, b.length)
  return Math.round((precision * 0.7 + (1 - lenPenalty) * 0.3) * 99)
}

/** Pick the best match from a TMDB results array for the given query */
function bestResult(results, query) {
  if (!results.length) return null
  return results.reduce((best, r) => {
    const s = titleScore(r.title || r.name || '', query)
    return (!best || s > best._score) ? { ...r, _score: s } : best
  }, null)
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
    const best = bestResult(results, title)
    return best ? normalise(best, type) : null
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
