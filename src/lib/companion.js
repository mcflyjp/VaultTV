/**
 * VaultTV Companion Server client
 *
 * The companion server runs locally (node companion/server.js) and watches
 * your media folders for new/removed files. When it detects a change it
 * emits an SSE event that VaultTV picks up to auto-trigger a rescan.
 *
 * All requests go to 127.0.0.1 only — nothing leaves your machine.
 */

// Use the same hostname as the page so this works both on localhost and when
// accessed from another device on the LAN (e.g. http://192.168.1.232:5174
// will talk to the companion at http://192.168.1.232:7842 automatically).
const COMPANION_PORT = 7842
const BASE = `http://${window.location.hostname}:${COMPANION_PORT}`

/** Check if companion is reachable. Resolves to true/false. */
export async function pingCompanion() {
  try {
    const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(1500) })
    return r.ok
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
  const r = await fetch(`${BASE}/folders/${id}/scan`, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`Companion scan failed: ${r.status}`)
  return r.json() // { id, count, files: [{ name, path, rootFolder }] }
}

/**
 * Fetch the shared library (sources + files) saved by the host machine.
 * Returns { sources, files } or null if not yet saved.
 */
export async function fetchLibrary() {
  const r = await fetch(`${BASE}/library`, { signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error(`Library fetch failed: ${r.status}`)
  return r.json()
}

/**
 * Persist the library to the companion so other devices can read it.
 * @param {{ sources: any[], files: any[] }} data
 */
export async function saveLibrary(data) {
  await fetch(`${BASE}/library`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  })
}

/**
 * Return the URL to stream a local file via the companion server.
 * The companion serves the file with HTTP range support for seeking.
 * @param {string} filePath  Absolute OS path to the video file
 */
export function streamUrl(filePath) {
  return `${BASE}/stream?path=${encodeURIComponent(filePath)}`
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
