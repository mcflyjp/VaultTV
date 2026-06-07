/**
 * VaultTV Companion Server
 * ──────────────────────────────────────────────────────────────────────
 * Watches local media folders for new/removed files and notifies VaultTV
 * via a simple REST + SSE (Server-Sent Events) interface.
 *
 * Configuration: edit config.json in this folder to set your media paths.
 * Stop at any time with Ctrl+C — VaultTV works fine without it,
 * you just won't get automatic rescan prompts.
 * ──────────────────────────────────────────────────────────────────────
 */

const express  = require('express')
const cors     = require('cors')
const chokidar = require('chokidar')
const path     = require('path')
const fs       = require('fs')

// ── Config ────────────────────────────────────────────────────────────
const USER_CONFIG_FILE   = path.join(__dirname, 'config.json')
const STATE_FILE         = path.join(__dirname, 'watched-folders.json')

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'])

// Load user config (config.json) — defines port + folder paths
let userConfig = { port: 7842, folders: [] }
try {
  if (fs.existsSync(USER_CONFIG_FILE)) {
    userConfig = JSON.parse(fs.readFileSync(USER_CONFIG_FILE, 'utf8'))
    console.log(`[config] Loaded config.json — ${userConfig.folders?.length || 0} folder(s) configured`)
  }
} catch (e) {
  console.warn('[config] Could not parse config.json:', e.message)
}

const PORT    = userConfig.port || 7842
const ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173']

// ── State ─────────────────────────────────────────────────────────────
/** @type {{ id: string, folderPath: string, type: 'movie'|'tv', name: string }[]} */
let watchedFolders = loadState()

// Merge config.json folders into the watched list (config always wins on path/type/name)
for (const cf of (userConfig.folders || [])) {
  if (!cf.id || !cf.path) continue
  const existing = watchedFolders.find(w => w.id === cf.id)
  if (existing) {
    existing.folderPath = cf.path
    existing.type       = cf.type || existing.type
    existing.name       = cf.name || existing.name
  } else {
    watchedFolders.push({ id: cf.id, folderPath: cf.path, type: cf.type || 'movie', name: cf.name || path.basename(cf.path) })
  }
}
saveState()
/** chokidar FSWatcher instances keyed by folder id */
const watchers = {}
/** SSE clients waiting for events */
const sseClients = new Set()
/** Pending change events (debounced) keyed by sourceId */
const pendingChanges = {}

// ── Express app ───────────────────────────────────────────────────────
const app = express()
app.use(cors({ origin: ORIGINS, credentials: false }))
app.use(express.json())

// Health check
app.get('/', (req, res) => {
  res.json({
    ok: true,
    name: 'VaultTV Companion',
    version: '1.0.0',
    watching: watchedFolders.length,
    uptime: Math.floor(process.uptime()),
  })
})

// ── SSE endpoint — VaultTV subscribes here for live change events ──────
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send a heartbeat immediately so the browser knows we're alive
  res.write('event: connected\ndata: {}\n\n')

  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n')
  }, 25000)

  sseClients.add(res)
  console.log(`[SSE] Client connected (${sseClients.size} total)`)

  req.on('close', () => {
    clearInterval(heartbeat)
    sseClients.delete(res)
    console.log(`[SSE] Client disconnected (${sseClients.size} remaining)`)
  })
})

/** Broadcast a JSON event to all SSE clients */
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try { client.write(payload) } catch { sseClients.delete(client) }
  }
}

// ── Folder management endpoints ────────────────────────────────────────

// List currently watched folders
app.get('/folders', (req, res) => {
  res.json(watchedFolders.map(f => ({
    ...f,
    exists: fs.existsSync(f.folderPath),
  })))
})

// Add a folder to watch
app.post('/folders', (req, res) => {
  const { id, folderPath, type, name } = req.body || {}
  if (!id || !folderPath || !type) {
    return res.status(400).json({ error: 'id, folderPath, and type are required' })
  }
  if (!['movie', 'tv'].includes(type)) {
    return res.status(400).json({ error: 'type must be "movie" or "tv"' })
  }
  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: `Folder not found: ${folderPath}` })
  }

  // Remove existing entry with same id if present
  stopWatcher(id)
  watchedFolders = watchedFolders.filter(f => f.id !== id)

  const entry = { id, folderPath, type, name: name || path.basename(folderPath) }
  watchedFolders.push(entry)
  saveState()
  startWatcher(entry)

  console.log(`[watch] Added: ${folderPath} (${type})`)
  res.status(201).json(entry)
})

// Remove a folder from watching
app.delete('/folders/:id', (req, res) => {
  const { id } = req.params
  stopWatcher(id)
  watchedFolders = watchedFolders.filter(f => f.id !== id)
  saveState()
  console.log(`[watch] Removed: ${id}`)
  res.json({ ok: true })
})

// Scan a folder on demand — returns list of video files
app.get('/folders/:id/scan', (req, res) => {
  const folder = watchedFolders.find(f => f.id === req.params.id)
  if (!folder) return res.status(404).json({ error: 'Not found' })
  try {
    const files = scanDir(folder.folderPath)
    res.json({ id: folder.id, files, count: files.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── File-system watching ───────────────────────────────────────────────

function startWatcher(folder) {
  if (watchers[folder.id]) return

  const watcher = chokidar.watch(folder.folderPath, {
    persistent: true,
    ignoreInitial: true,     // don't fire for existing files on startup
    depth: 5,
    awaitWriteFinish: {      // wait until large video files finish copying
      stabilityThreshold: 3000,
      pollInterval: 500,
    },
  })

  watcher
    .on('add',    filePath => handleChange(folder, 'add',    filePath))
    .on('unlink', filePath => handleChange(folder, 'remove', filePath))
    .on('error',  err      => console.error(`[watch] Error in ${folder.id}:`, err))

  watchers[folder.id] = watcher
  console.log(`[watch] Watching: ${folder.folderPath}`)
}

function stopWatcher(id) {
  if (watchers[id]) {
    watchers[id].close()
    delete watchers[id]
  }
}

function handleChange(folder, action, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (!VIDEO_EXTS.has(ext)) return

  const filename = path.basename(filePath)
  console.log(`[watch] ${action}: ${filename} (source: ${folder.id})`)

  // Debounce rapid changes — emit one "changed" event per source per 2s window
  clearTimeout(pendingChanges[folder.id])
  pendingChanges[folder.id] = setTimeout(() => {
    delete pendingChanges[folder.id]
    broadcast('folder-changed', {
      sourceId:   folder.id,
      sourceName: folder.name,
      type:       folder.type,
      action,
      filename,
      timestamp:  Date.now(),
    })
  }, 2000)
}

// ── Directory scanner (for /scan endpoint) ─────────────────────────────
/**
 * Recursively scan a directory for video files.
 * Returns array of { name, path, rootFolder } objects.
 * rootFolder = the immediate child folder of the root dir (used for TV show grouping).
 */
function scanDir(dir, depth = 0, results = [], rootFolder = null) {
  if (depth > 8) return results
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return results }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const childRoot = depth === 0 ? entry.name : rootFolder
      scanDir(full, depth + 1, results, childRoot)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (VIDEO_EXTS.has(ext)) {
        results.push({ name: entry.name, path: full, rootFolder: rootFolder || null })
      }
    }
  }
  return results
}

// ── Video streaming endpoint ───────────────────────────────────────────
// Serves local video files with HTTP range support so the browser player
// can seek freely — no File System Access API permissions needed.

const MIME_TYPES = {
  '.mp4':  'video/mp4',
  '.mkv':  'video/x-matroska',
  '.avi':  'video/x-msvideo',
  '.mov':  'video/quicktime',
  '.m4v':  'video/mp4',
  '.wmv':  'video/x-ms-wmv',
  '.flv':  'video/x-flv',
  '.webm': 'video/webm',
  '.ts':   'video/mp2t',
}

app.get('/stream', (req, res) => {
  const filePath = req.query.path
  if (!filePath) return res.status(400).json({ error: 'path query parameter required' })

  // Security: only serve files inside a watched folder
  const allowed = watchedFolders.some(f => filePath.startsWith(f.folderPath))
  if (!allowed) return res.status(403).json({ error: 'Path is not inside a watched folder' })

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' })

  const stat     = fs.statSync(filePath)
  const total    = stat.size
  const ext      = path.extname(filePath).toLowerCase()
  const mimeType = MIME_TYPES[ext] || 'video/mp4'

  const range = req.headers.range
  if (range) {
    const [rawStart, rawEnd] = range.replace(/bytes=/, '').split('-')
    const start = parseInt(rawStart, 10)
    // Default chunk: up to 10 MB (Chrome asks for smaller ranges; this is fine)
    const end   = rawEnd ? parseInt(rawEnd, 10) : Math.min(start + 10 * 1024 * 1024 - 1, total - 1)
    const chunkSize = end - start + 1

    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   mimeType,
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type':   mimeType,
      'Accept-Ranges':  'bytes',
    })
    fs.createReadStream(filePath).pipe(res)
  }
})

// ── State persistence (runtime additions via API) ──────────────────────
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    }
  } catch (e) {
    console.warn('[state] Could not load watched-folders.json:', e.message)
  }
  return []
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(watchedFolders, null, 2), 'utf8')
  } catch (e) {
    console.warn('[state] Could not save watched-folders.json:', e.message)
  }
}

// ── Arg helper ─────────────────────────────────────────────────────────
function getArg(args, flag) {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

// ── Startup ────────────────────────────────────────────────────────────
// Re-watch all folders that were saved from a previous run
for (const folder of watchedFolders) {
  if (fs.existsSync(folder.folderPath)) {
    startWatcher(folder)
  } else {
    console.warn(`[watch] Folder no longer exists, skipping: ${folder.folderPath}`)
  }
}

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🎬 VaultTV Companion running at http://127.0.0.1:${PORT}`)
  console.log(`   Watching ${watchedFolders.length} folder(s)`)
  console.log('   Press Ctrl+C to stop\n')
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use — another companion instance is probably still running.`)
    console.error('   Open Task Manager, find "node.exe", and end it. Then try again.\n')
  } else {
    console.error('Server error:', err.message)
  }
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[shutdown] Stopping all watchers...')
  for (const id of Object.keys(watchers)) stopWatcher(id)
  process.exit(0)
})
