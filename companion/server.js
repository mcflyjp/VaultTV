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
const https    = require('https')
const http     = require('http')
const zlib     = require('zlib')
const { spawn } = require('child_process')

// ── Config ────────────────────────────────────────────────────────────
const USER_CONFIG_FILE   = path.join(__dirname, 'config.json')
const STATE_FILE         = path.join(__dirname, 'watched-folders.json')
const LIBRARY_FILE       = path.join(__dirname, 'library.json')

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
// Allow all origins — this server only ever binds to 127.0.0.1 so it is
// inaccessible from the network. Any local page (localhost, 127.0.0.1,
// file://, Electron, etc.) should be able to reach it.
const CORS_OPTS = { origin: true, credentials: false }

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
app.use(cors(CORS_OPTS))
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

// ── Stream probe endpoint ──────────────────────────────────────────────
// Runs ffprobe on a remote URL and returns the audio codec name.
// Used by VaultTV to auto-detect AC3/DTS before playback starts.
//
// Usage: GET /probe?url=<encoded_source_url>

app.get('/probe', (req, res) => {
  const sourceUrl = req.query.url
  if (!sourceUrl) return res.status(400).json({ error: 'url required' })

  let parsed
  try { parsed = new URL(sourceUrl) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https sources supported' })
  }

  // ffprobe: read just stream headers (no decoding), output JSON
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-read_intervals', '%+#5', // read first 5 packets then stop (gets both v+a headers)
    sourceUrl,
  ]

  const ff = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  ff.stdout.on('data', d => { stdout += d.toString() })

  ff.on('close', () => {
    try {
      const info    = JSON.parse(stdout)
      const streams = info.streams || []
      const audio   = streams.find(s => s.codec_type === 'audio')
      const video   = streams.find(s => s.codec_type === 'video')
      const audioCodec = audio?.codec_name || null
      const videoCodec = video?.codec_name || null
      console.log(`[probe] ${sourceUrl.slice(0, 60)}… → video: ${videoCodec}, audio: ${audioCodec}`)
      res.json({ audioCodec, videoCodec })
    } catch {
      res.json({ audioCodec: null, videoCodec: null })
    }
  })

  ff.on('error', err => {
    if (err.code === 'ENOENT') {
      res.status(500).json({ error: 'ffprobe not found — install ffmpeg' })
    } else {
      res.status(500).json({ error: err.message })
    }
  })
})

// ── Audio transcode endpoint ───────────────────────────────────────────
// Pipes any HTTP(S) video stream through ffmpeg, re-encoding audio to AAC
// while copying video as-is. Fixes AC3/DTS/EAC3 audio which browsers can't
// decode. Output is fragmented MP4 so it can be streamed without seeking.
//
// Usage: GET /transcode?url=<encoded_source_url>
// Optional: ?t=<start_seconds>  — seek before transcoding (faster than player seek)

app.get('/transcode', (req, res) => {
  const sourceUrl = req.query.url
  if (!sourceUrl) return res.status(400).json({ error: 'url query parameter required' })

  // Only allow http/https sources (no file:// etc.)
  let parsed
  try { parsed = new URL(sourceUrl) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https sources are supported' })
  }

  const startSec       = parseFloat(req.query.t)  || 0
  const transcodeVideo = req.query.tv === '1'  // true when source is HEVC/H.265

  // Build ffmpeg args
  // -c:v copy / libx264  — copy H.264; re-encode HEVC→H.264 when tv=1
  // -c:a aac             — re-encode audio to AAC (browser-compatible)
  // -b:a 192k            — good quality audio bitrate
  // -movflags ...        — fragmented MP4 suitable for streaming to pipe
  const args = []
  if (startSec > 0) args.push('-ss', String(startSec))
  args.push('-i', sourceUrl)

  if (transcodeVideo) {
    // HEVC/H.265 → H.264 (ultrafast = real-time on modern CPUs)
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23')
    console.log(`[transcode] video: HEVC→H.264 (ultrafast)`)
  } else {
    args.push('-c:v', 'copy')
  }

  args.push(
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4',
    'pipe:1',
  )

  console.log(`[transcode] ${sourceUrl.slice(0, 80)}…`)

  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Cache-Control', 'no-cache')
  // No Content-Length — we're streaming

  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })

  ff.stdout.pipe(res)

  ff.stderr.on('data', data => {
    // ffmpeg writes progress to stderr — only log errors (lines with 'Error' or non-progress)
    const line = data.toString()
    if (line.includes('Error') || line.includes('Invalid')) {
      console.error('[transcode] ffmpeg:', line.trim())
    }
  })

  ff.on('close', code => {
    if (code !== 0) console.warn(`[transcode] ffmpeg exited with code ${code}`)
    if (!res.writableEnded) res.end()
  })

  ff.on('error', err => {
    if (err.code === 'ENOENT') {
      console.error('[transcode] ffmpeg not found — install ffmpeg and add it to PATH')
      if (!res.headersSent) res.status(500).json({ error: 'ffmpeg not installed on this machine' })
    } else {
      console.error('[transcode] spawn error:', err.message)
      if (!res.writableEnded) res.end()
    }
  })

  // If client disconnects, kill ffmpeg immediately (saves CPU)
  req.on('close', () => {
    if (!ff.killed) ff.kill('SIGKILL')
  })
})

// ── Subtitle proxy endpoint ───────────────────────────────────────────
// Fetches subtitles from OpenSubtitles.org (no API key required) and
// returns them as a WebVTT file the player can load directly as a <track>.
//
// Usage:
//   GET /subtitles?imdb_id=tt1234567&lang=en&type=movie
//   GET /subtitles?imdb_id=tt1234567:1:3&lang=en&type=series  (episode)
//   GET /subtitles?query=Inception&year=2010&lang=en           (title search)
//
// Returns: text/vtt  — or 404/500 JSON on failure

/** Follow redirects and return { status, body (Buffer), headers } */
function httpGet(url, reqHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib     = url.startsWith('https') ? https : http
    const options = { headers: { 'User-Agent': 'VaultTV v1.0', ...reqHeaders } }
    const req = lib.get(url, options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, reqHeaders).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('request timeout')) })
  })
}

/** Convert SRT text → WebVTT (add header, replace comma decimals) */
function srtToVtt(srt) {
  const fixed = srt
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')  // 00:00:01,234 → 00:00:01.234
  return 'WEBVTT\n\n' + fixed.trim() + '\n'
}

app.get('/subtitles', async (req, res) => {
  try {
    const { imdb_id, lang = 'en', query, year } = req.query
    if (!imdb_id && !query) return res.status(400).json({ error: 'imdb_id or query required' })

    const OS_AGENT = 'VaultTV v1.0'

    // ── Build OpenSubtitles.org search URL ────────────────────────────
    let searchUrl
    if (imdb_id) {
      // Strip "tt" prefix; handle episode IDs like "tt1234567:1:3"
      const [rawId, season, episode] = imdb_id.split(':')
      const bareId = rawId.replace(/^tt/i, '')
      let path = `/search/imdbid-${bareId}/sublanguageid-${lang}`
      if (season && episode) path += `/season-${season}/episode-${episode}`
      searchUrl = `https://rest.opensubtitles.org${path}`
    } else {
      // Title search
      const q = encodeURIComponent(query).replace(/%20/g, '+')
      searchUrl = `https://rest.opensubtitles.org/search/query-${q}${year ? `/year-${year}` : ''}/sublanguageid-${lang}`
    }

    // ── Search ────────────────────────────────────────────────────────
    const searchResp = await httpGet(searchUrl, { 'X-User-Agent': OS_AGENT })
    if (searchResp.status !== 200) {
      return res.status(404).json({ error: 'OpenSubtitles returned ' + searchResp.status })
    }

    let results
    try { results = JSON.parse(searchResp.body.toString()) } catch {
      return res.status(500).json({ error: 'Invalid JSON from OpenSubtitles' })
    }
    if (!Array.isArray(results) || !results.length) {
      return res.status(404).json({ error: 'No subtitles found' })
    }

    // Sort by download count — highest = best quality / most popular
    results.sort((a, b) => parseInt(b.SubDownloadsCnt || 0) - parseInt(a.SubDownloadsCnt || 0))
    const best = results[0]
    if (!best.SubDownloadLink) return res.status(404).json({ error: 'No download link in result' })

    // ── Download gzip'd SRT ────────────────────────────────────────────
    const dlResp = await httpGet(best.SubDownloadLink, { 'X-User-Agent': OS_AGENT })
    if (dlResp.status !== 200) {
      return res.status(502).json({ error: 'Subtitle download failed: HTTP ' + dlResp.status })
    }

    // Decompress — OpenSubtitles wraps SRTs in gzip
    const isGzip = dlResp.headers['content-encoding'] === 'gzip'
                || best.SubDownloadLink.includes('.gz')
                || (dlResp.body[0] === 0x1f && dlResp.body[1] === 0x8b) // gzip magic bytes
    let srtBuffer
    if (isGzip) {
      srtBuffer = await new Promise((resolve, reject) =>
        zlib.gunzip(dlResp.body, (err, buf) => err ? reject(err) : resolve(buf))
      )
    } else {
      srtBuffer = dlResp.body
    }

    const srt = srtBuffer.toString('utf8')
    const vtt = srtToVtt(srt)

    console.log(`[subtitles] ${best.LanguageName} · ${imdb_id || query} · ${parseInt(best.SubDownloadsCnt || 0).toLocaleString()} downloads`)

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(vtt)
  } catch (e) {
    console.error('[subtitles] Error:', e.message)
    if (!res.headersSent) res.status(500).json({ error: e.message })
  }
})

// ── Library data endpoints ─────────────────────────────────────────────
// Stores the scanned library (sources + files) so any browser on the LAN
// can read the same data without needing its own File System Access scan.

app.get('/library', (req, res) => {
  try {
    if (fs.existsSync(LIBRARY_FILE)) {
      const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'))
      res.json(data)
    } else {
      res.json({ sources: [], files: [] })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.put('/library', (req, res) => {
  try {
    const { sources, files } = req.body || {}
    if (!Array.isArray(sources) || !Array.isArray(files)) {
      return res.status(400).json({ error: 'body must be { sources: [], files: [] }' })
    }
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify({ sources, files }, null, 2), 'utf8')
    console.log(`[library] Saved ${sources.length} sources, ${files.length} files`)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
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

const server = app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os')
  const nets = networkInterfaces()
  const lanIp = Object.values(nets).flat().find(n => n.family === 'IPv4' && !n.internal)?.address || 'unknown'
  console.log(`\n🎬 VaultTV Companion running`)
  console.log(`   Local:   http://127.0.0.1:${PORT}`)
  console.log(`   Network: http://${lanIp}:${PORT}`)
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
