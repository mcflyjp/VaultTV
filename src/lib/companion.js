/**
 * VaultTV Companion Server client
 *
 * The companion server runs locally (node companion/server.js) and watches
 * your media folders for new/removed files. When it detects a change it
 * emits an SSE event that VaultTV picks up to auto-trigger a rescan.
 *
 * All requests go to 127.0.0.1 only — nothing leaves your machine.
 */

const COMPANION_PORT = 8080

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

/** Check if companion is reachable. Resolves to true/false. */
export async function pingCompanion() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    try {
      const r = await fetch(`${BASE}/`, { signal: ctrl.signal })
      return r.ok
    } finally { clearTimeout(timer) }
  } catch {
    return false
  }
}

/** List folders the companion is watching */
export async function listWatchedFolders() {
  const r = await fetch(`${BASE}/folders`)
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
    headers: { 'Content-Type': 'application/json' },
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
  await fetch(`${BASE}/folders/${id}`, { method: 'DELETE' })
}

/**
 * Ask the companion to scan a folder and return the full file list.
 * Each entry: { name, path, rootFolder }
 */
export async function scanFolder(id) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const r = await fetch(`${BASE}/folders/${id}/scan`, { signal: ctrl.signal })
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
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const r = await fetch(`${BASE}/library`, { signal: ctrl.signal })
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: ctrl.signal,
    })
  } finally { clearTimeout(timer) }
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
      const r = await fetch(`${BASE}/probe?url=${encodeURIComponent(sourceUrl)}`, { signal: ctrl.signal })
      if (!r.ok) return null
      const data = await r.json()
      return { audioCodec: data.audioCodec || null, videoCodec: data.videoCodec || null }
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
export function transcodeUrl(sourceUrl, startSec = 0, transcodeVideo = false, audioLang = '') {
  const params = new URLSearchParams({ url: sourceUrl })
  if (startSec > 0) params.set('t', String(Math.floor(startSec)))
  if (transcodeVideo) params.set('tv', '1')
  if (audioLang) params.set('al', audioLang)
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
