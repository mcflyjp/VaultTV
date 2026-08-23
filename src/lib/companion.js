/**
 * VaultTV Companion Server client
 *
 * The companion server runs locally (node companion/server.js) and watches
 * your media folders for new/removed files. When it detects a change it
 * emits an SSE event that VaultTV picks up to auto-trigger a rescan.
 *
 * All requests go to 127.0.0.1 only — nothing leaves your machine.
 */

export const COMPANION_PORT = 8080

function getCompanionBase() {
  // When served by VaultTV Server, all routes are on the same origin — no port needed.
  if (window.__VAULTTV_SERVER) return window.location.origin
  const stored = (localStorage.getItem('vt-companion-host') || '').trim()
  if (stored) {
    // Full URL (tunnel URL or http://ip:port) — use as-is
    if (stored.startsWith('http://') || stored.startsWith('https://')) {
      return stored.replace(/\/$/, '')
    }
    // Bare IP or hostname — append default port
    return `http://${stored}:${COMPANION_PORT}`
  }
  return `http://${window.location.hostname || 'localhost'}:${COMPANION_PORT}`
}
// Recompute on every call so Settings changes take effect without a reload
Object.defineProperty(window, '__companionBase', { get: getCompanionBase, configurable: true })
const BASE = { toString() { return getCompanionBase() } }

/**
 * Fetch the server's configured remote-access (Cloudflare Tunnel) URL.
 * Goes through the actual companion base + auth token, unlike the old
 * relative /internal/status fetch this replaced — that one only worked when
 * already browsing the server's own origin. Resolves to '' if unreachable.
 */
export async function fetchRemoteAccess() {
  try {
    const r = await fetch(`${BASE}/api/remote-access`, { credentials: 'include', headers: authHeaders() })
    if (!r.ok) return ''
    return (await r.json()).tunnelUrl || ''
  } catch {
    return ''
  }
}

/**
 * The server's LAN base URL, cached after first lookup.
 *
 * Only used for casting. The phone itself must stay on the HTTPS tunnel (its
 * WebView blocks http:// media from an https:// page), but the Cast device is
 * native and has no such restriction — so pointing the TV at the LAN address
 * keeps the stream local instead of round-tripping through Cloudflare.
 */
let _lanUrl = null
export async function getLanBaseUrl() {
  if (_lanUrl !== null) return _lanUrl
  try {
    const r = await fetch(`${BASE}/api/remote-access`, { credentials: 'include', headers: authHeaders() })
    _lanUrl = r.ok ? ((await r.json()).lanUrl || '') : ''
  } catch { _lanUrl = '' }
  return _lanUrl
}

/** Swap a companion URL's origin for the LAN one, when we know it. */
export function toLanUrl(url, lanBase) {
  if (!url || !lanBase) return url
  try {
    const u = new URL(url), l = new URL(lanBase)
    u.protocol = l.protocol; u.hostname = l.hostname; u.port = l.port
    return u.toString()
  } catch { return url }
}

/** Check if companion is reachable. Resolves to true/false. */
export async function pingCompanion() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    try {
      const r = await fetch(`${BASE}/ping`, { signal: ctrl.signal })
      return r.ok
    } finally { clearTimeout(timer) }
  } catch {
    return false
  }
}

/** List folders the companion is watching */
export async function listWatchedFolders() {
  const r = await fetch(`${BASE}/folders`, { credentials: 'include', headers: authHeaders() })
  if (!r.ok) throw new Error('Companion request failed')
  return r.json()
}

/**
 * Tell the companion to start watching a folder.
 * @param {{ id: string, folderPath: string, type: 'movie'|'tv', name: string }} opts
 */
export async function addWatchedFolder({ id, folderPath, type, name }) {
  const r = await fetch(`${BASE}/folders`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id, folderPath, type, name }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to add folder to companion')
  }
  return r.json()
}

/** Tell the companion to stop watching a folder */
export async function removeWatchedFolder(id) {
  await fetch(`${BASE}/folders/${id}`, { method: 'DELETE', credentials: 'include', headers: authHeaders() })
}

/**
 * Ask the companion to scan a folder and return the full file list.
 * Each entry: { name, path, rootFolder }
 */
export async function scanFolder(id) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const r = await fetch(`${BASE}/folders/${id}/scan`, { signal: ctrl.signal, credentials: 'include', headers: authHeaders() })
    if (!r.ok) throw new Error(`Companion scan failed: ${r.status}`)
    return r.json() // { id, count, files: [{ name, path, rootFolder }] }
  } finally { clearTimeout(timer) }
}

/**
 * Fetch the shared library (sources + files) saved by the host machine.
 * Returns { sources, files } or null if not yet saved.
 */
export async function fetchLibrary() {
  const ctrl = new AbortController()
  // Unlike other companion calls, this one's payload scales with library
  // size (multi-MB JSON once a couple thousand files are scanned) — 5s was
  // fine on LAN but silently aborted on slower/higher-latency connections
  // (phone over a tunnel, etc.), which looked exactly like "new files never
  // show up on my phone" with no visible error anywhere.
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const r = await fetch(`${BASE}/library`, { signal: ctrl.signal, credentials: 'include', headers: authHeaders() })
    if (!r.ok) throw new Error(`Library fetch failed: ${r.status}`)
    return r.json()
  } finally { clearTimeout(timer) }
}

/**
 * Persist the library to the companion so other devices can read it.
 * @param {{ sources: any[], files: any[] }} data
 */
export async function saveLibrary(data) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    await fetch(`${BASE}/library`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
      signal: ctrl.signal,
    })
  } finally { clearTimeout(timer) }
}

// ── ROM library (RetroArch) — server/index.js (Media Server) only for now ────

/**
 * Parse a roms response as JSON, but give a clear error instead of a cryptic
 * "Unexpected token '<'" crash when the response is actually HTML — which
 * happens if the request got redirected to the login page (session cookie
 * missing/expired) or fell through to the SPA catch-all (route doesn't exist
 * on whatever build is actually running).
 */
async function romsJson(r, fallbackMsg) {
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    if (r.redirected && /__login/.test(r.url)) {
      throw new Error('Not logged in to Media Server — open it in a browser and sign in, then retry')
    }
    throw new Error(`${fallbackMsg} (Media Server didn't return JSON — it may need restarting after an update)`)
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || fallbackMsg)
  }
  return r.json()
}

/** List configured ROM folders */
export async function listRomFolders() {
  const r = await fetch(`${BASE}/roms/folders`, { credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Failed to list ROM folders')
}

/** Add a ROM folder to scan. @param {{id, folderPath, name}} opts */
export async function addRomFolder({ id, folderPath, name }) {
  const r = await fetch(`${BASE}/roms/folders`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id, folderPath, name }),
  })
  return romsJson(r, 'Failed to add ROM folder')
}

/** Remove a ROM folder */
export async function removeRomFolder(id) {
  await fetch(`${BASE}/roms/folders/${id}`, { method: 'DELETE', credentials: 'include', headers: authHeaders() })
}

/** Scan a ROM folder — returns { id, games, count }. Each game: { name, filename, path, ext, platform, boxArt } */
export async function scanRomFolder(id) {
  const r = await fetch(`${BASE}/roms/folders/${id}/scan`, { credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'ROM scan failed')
}

/** Get the configured RetroArch executable path. Returns { path, exists } */
export async function getRetroarchPath() {
  const r = await fetch(`${BASE}/roms/retroarch`, { credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Failed to get RetroArch path')
}

/** Set the RetroArch executable path (any local or mapped-network-drive path) */
export async function setRetroarchPath(exePath) {
  const r = await fetch(`${BASE}/roms/retroarch`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ path: exePath }),
  })
  return romsJson(r, 'Failed to set RetroArch path')
}

/** Check common local install paths for RetroArch. Returns { found: string|null } */
export async function detectRetroarch() {
  const r = await fetch(`${BASE}/roms/retroarch/detect`, { credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Detect failed')
}

/** Launch a game via RetroArch. @param {{romPath: string, ext: string}} opts */
export async function launchGame({ romPath, ext }) {
  const r = await fetch(`${BASE}/roms/launch`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ romPath, ext }),
  })
  return romsJson(r, 'Failed to launch game')
}

/** Manually set (or clear, with url: '') box art for a game, overriding the scraper. */
export async function setGameArtwork({ platform, name, url }) {
  const r = await fetch(`${BASE}/roms/artwork`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ platform, name, url }),
  })
  return romsJson(r, 'Failed to save box art')
}

/** Scrape box art for every not-yet-cached game across all ROM folders. Returns { count } */
export async function scrapeAllArtwork() {
  const r = await fetch(`${BASE}/roms/artwork/scrape-all`, { method: 'POST', credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Failed to start scraping')
}

/** Force a fresh IGDB lookup for one game, bypassing the cache. `query` optionally
 *  overrides the search term sent to IGDB. Returns { boxArt } */
export async function rescanGameArtwork({ platform, name, query }) {
  const r = await fetch(`${BASE}/roms/artwork/rescan`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ platform, name, query }),
  })
  return romsJson(r, 'Failed to rescan box art')
}

/** Check whether IGDB credentials are configured (never returns the secret itself). */
export async function getIgdbKeyStatus() {
  const r = await fetch(`${BASE}/roms/igdb-key`, { credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Failed to check IGDB credential status') // { hasKey, quotaExceededAt }
}

/** Set the IGDB (Twitch dev app) Client ID + Secret — used server-side only to scrape box art. */
export async function setIgdbKeys(clientId, clientSecret) {
  const r = await fetch(`${BASE}/roms/igdb-key`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ clientId, clientSecret }),
  })
  return romsJson(r, 'Failed to save IGDB credentials')
}

// ── Reading library (comics + ebooks) — server/index.js (Media Server) only ──

/** List configured comic/book folders */
export async function listReadingFolders() {
  const r = await fetch(`${BASE}/reading/folders`, { credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Failed to list reading folders')
}

/** Add a comic/book folder to scan. @param {{id, folderPath, name}} opts */
export async function addReadingFolder({ id, folderPath, name, category }) {
  const r = await fetch(`${BASE}/reading/folders`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id, folderPath, name, category }),
  })
  return romsJson(r, 'Failed to add reading folder')
}

/** Remove a comic/book folder */
export async function removeReadingFolder(id) {
  await fetch(`${BASE}/reading/folders/${id}`, { method: 'DELETE', credentials: 'include', headers: authHeaders() })
}

/** Scan a comic/book folder — returns { id, items, count }. Each item: { name, filename, path, ext, kind } */
export async function scanReadingFolder(id) {
  const r = await fetch(`${BASE}/reading/folders/${id}/scan`, { credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Reading folder scan failed')
}

/**
 * Fetch a comic/book file's raw bytes as an ArrayBuffer, for client-side
 * parsing (jszip for CBZ, epub.js for EPUB, pdf.js for PDF). Auth can't be
 * passed via URL query to a plain <img>/<iframe> src, so this always goes
 * through fetch() with the same credentials/token as everything else.
 */
export async function fetchReadingFile(filePath) {
  const r = await fetch(`${BASE}/reading/file?path=${encodeURIComponent(filePath)}`, { credentials: 'include', headers: authHeaders() })
  if (!r.ok) throw new Error(`Failed to load file (${r.status})`)
  return r.arrayBuffer()
}

/** Manually set (or clear, with url: '') cover art for a comic/book, overriding the scraper. */
export async function setReadingArtwork({ kind, name, url }) {
  const r = await fetch(`${BASE}/reading/artwork`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ kind, name, url }),
  })
  return romsJson(r, 'Failed to save cover art')
}

/** Force a fresh cover-art lookup for one item, bypassing the cache. `year`/`issueNumber`
 *  correct what filename-parsing guessed and are saved server-side so future scrapes
 *  (including unattended ones) keep using them. Returns { cover } */
export async function rescanReadingArtwork({ kind, name, query, year, issueNumber }) {
  const r = await fetch(`${BASE}/reading/artwork/rescan`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ kind, name, query, year, issueNumber }),
  })
  return romsJson(r, 'Failed to rescan cover art')
}

/** Scrape cover art for every not-yet-cached item across all reading folders. Returns { count } */
export async function scrapeAllReadingArtwork() {
  const r = await fetch(`${BASE}/reading/artwork/scrape-all`, { method: 'POST', credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Failed to start scraping')
}

/** Check whether an (optional) ComicVine API key is configured. */
export async function getComicVineKeyStatus() {
  const r = await fetch(`${BASE}/reading/comicvine-key`, { credentials: 'include', headers: authHeaders() })
  return romsJson(r, 'Failed to check ComicVine key status') // { hasKey, quotaExceededAt }
}

/** Set (or clear, with '') the optional ComicVine API key — improves comic cover accuracy. */
export async function setComicVineKey(key) {
  const r = await fetch(`${BASE}/reading/comicvine-key`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ key }),
  })
  return romsJson(r, 'Failed to save ComicVine key')
}

/**
 * Return the URL to stream a local file via the companion server.
 * The companion serves the file with HTTP range support for seeking.
 * @param {string} filePath  Absolute OS path to the video file
 */
export function streamUrl(filePath) {
  return `${BASE}/stream?path=${encodeURIComponent(filePath)}`
}

export function streamByFilenameUrl(filename) {
  return `${BASE}/stream/by-filename?filename=${encodeURIComponent(filename)}`
}

/**
 * Probe a stream URL via the companion's ffprobe endpoint.
 * Returns the audio codec name (e.g. "ac3", "eac3", "dts", "aac") or null
 * if the probe fails or companion is offline.
 * @param {string} sourceUrl
 */
export async function probeAudioCodec(sourceUrl) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    try {
      // Needs auth like every other /api-ish route. Without these it silently
      // followed the /__login redirect, got HTML, failed to parse as JSON and
      // returned null — indistinguishable from "companion offline", so the
      // caller just skipped transcoding entirely and played nothing.
      const r = await fetch(`${BASE}/probe?url=${encodeURIComponent(sourceUrl)}`, {
        signal: ctrl.signal, credentials: 'include', headers: authHeaders(),
      })
      if (!r.ok) return null
      const data = await r.json()
      return {
        audioCodec: data.audioCodec || null,
        videoCodec: data.videoCodec || null,
        audioTracks: Array.isArray(data.audioTracks) ? data.audioTracks : [],
      }
    } finally { clearTimeout(timer) }
  } catch {
    return null
  }
}

/** Audio codecs browsers cannot decode */
const UNSUPPORTED_AUDIO = new Set(['ac3', 'eac3', 'dts', 'truehd', 'mlp'])
/** Video codecs browsers cannot decode */
const UNSUPPORTED_VIDEO = new Set(['hevc', 'h265', 'hvc1', 'av01'])

/**
 * Returns whether a codec pair needs companion transcoding.
 * @param {{ audioCodec: string|null, videoCodec: string|null }} codecs
 */
export function needsTranscode({ audioCodec, videoCodec } = {}) {
  const badAudio = audioCodec ? UNSUPPORTED_AUDIO.has(audioCodec.toLowerCase()) : false
  const badVideo = videoCodec ? UNSUPPORTED_VIDEO.has(videoCodec.toLowerCase()) : false
  return { needed: badAudio || badVideo, transcodeVideo: badVideo }
}

/**
 * Return a URL that transcodes a remote stream through the companion's
 * ffmpeg pipeline — re-encodes audio to AAC and optionally video to H.264.
 * Fixes AC3/DTS/EAC3 audio and HEVC video that browsers cannot decode.
 *
 * @param {string} sourceUrl      Original stream URL (http/https)
 * @param {number} [startSec]     Optional seek offset in seconds
 * @param {boolean} [transcodeVideo]  True to re-encode video (HEVC→H.264)
 */
/** Strips any /transcode wrapper, returning the original source URL. */
function unwrapTranscode(url) {
  let u = url
  for (let i = 0; i < 4; i++) {
    try {
      const parsed = new URL(u, location.href)
      if (!parsed.pathname.endsWith('/transcode')) return u
      const inner = parsed.searchParams.get('url')
      if (!inner) return u
      u = inner
    } catch { return u }
  }
  return u
}

/**
 * Picks the audio stream index to transcode.
 *
 * Prefers a track tagged with the requested language, but an untagged track is
 * a candidate rather than a rejection: most single-audio rips carry no language
 * metadata at all, and treating those as "not a match" is what made ffmpeg
 * abort with an empty stream map and no playable output.
 */
export function pickAudioTrack(audioTracks, preferredLang = '') {
  if (!audioTracks?.length) return 0
  const want = (preferredLang || '').toLowerCase().slice(0, 2)
  if (want) {
    const tagged = audioTracks.find(t => t.lang && t.lang.startsWith(want))
    if (tagged) return tagged.index
  }
  const untagged = audioTracks.find(t => !t.lang)
  return untagged ? untagged.index : audioTracks[0].index
}

export function transcodeUrl(sourceUrl, startSec = 0, transcodeVideo = false, audioIndex = 0) {
  // Never wrap a transcode URL in another one — ffmpeg would be pointed at our
  // own fragmented output and fail with "Invalid data found". The server
  // unwraps defensively too; this stops it before the request is even made.
  const params = new URLSearchParams({ url: unwrapTranscode(sourceUrl) })
  if (startSec > 0) params.set('t', String(Math.floor(startSec)))
  if (transcodeVideo) params.set('tv', '1')
  if (audioIndex > 0) params.set('ai', String(audioIndex))
  // This URL is assigned straight to <video src>, which can't send an auth
  // header and won't carry a SameSite=Lax cookie cross-site — so the token
  // rides along in the query string (server/index.js requireAuth accepts it).
  const token = localStorage.getItem('vt-companion-token')
  if (token) params.set('token', token)
  return `${BASE}/transcode?${params}`
}

/**
 * Subscribe to file-system change events from the companion.
 *
 * @param {(event: { sourceId, sourceName, type, action, filename, timestamp }) => void} onChanged
 * @returns {() => void} unsubscribe function
 *
 * Usage:
 *   const unsub = subscribeToChanges(ev => rescanSource(ev.sourceId))
 *   // call unsub() to disconnect
 */
export function subscribeToChanges(onChanged) {
  let es
  let stopped = false
  let retryTimeout

  function connect() {
    if (stopped) return
    es = new EventSource(`${BASE}/events`)

    es.addEventListener('connected', () => {
      console.log('[companion] SSE connected')
    })

    es.addEventListener('folder-changed', e => {
      try {
        const data = JSON.parse(e.data)
        onChanged(data)
      } catch { /* ignore */ }
    })

    es.addEventListener('library-updated', e => {
      try {
        const data = JSON.parse(e.data)
        onChanged({ type: '__library_updated', ...data })
      } catch { /* ignore */ }
    })

    es.onerror = () => {
      es.close()
      if (!stopped) {
        // Retry after 10s (companion might have been stopped temporarily)
        retryTimeout = setTimeout(connect, 10_000)
      }
    }
  }

  connect()

  return function unsubscribe() {
    stopped = true
    clearTimeout(retryTimeout)
    es?.close()
  }
}

// ── Auth token helper ─────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem('vt-companion-token')
  return token ? { 'X-VaultTV-Token': token } : {}
}

// ── Progress sync ─────────────────────────────────────────────────────

/**
 * Fetch all watch-progress entries from the companion server.
 * Returns an array of history entries, or null if the companion is offline.
 */
export async function fetchProgress() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    try {
      const r = await fetch(`${BASE}/progress`, { headers: authHeaders(), signal: ctrl.signal })
      if (!r.ok) return null
      return r.json()   // array of { id, type, title, poster, progressSec, durationSec, progress, timestamp, lastStream? }
    } finally { clearTimeout(timer) }
  } catch {
    return null
  }
}

/**
 * Push an array of progress entries to the companion (merge by timestamp).
 * Fire-and-forget — errors are silently swallowed.
 * @param {Array} entries
 */
export async function pushProgress(entries) {
  if (!entries?.length) return
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
      await fetch(`${BASE}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(entries),
        signal: ctrl.signal,
      })
    } finally { clearTimeout(timer) }
  } catch { /* offline — ignore */ }
}

/**
 * Remove a single progress entry from the companion by its "<type>:<id>" key.
 * @param {number|string} id
 * @param {'movie'|'tv'} type
 */
export async function deleteProgress(id, type) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    try {
      await fetch(`${BASE}/progress/${type}:${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        signal: ctrl.signal,
      })
    } finally { clearTimeout(timer) }
  } catch { /* offline — ignore */ }
}
