/**
 * VaultTV Media Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-hosted streaming server. Serves the VaultTV web app + all media APIs
 * from a single port so any device on your network (or internet, if you
 * port-forward) can access your library via a browser.
 *
 * First run:  node index.js   then open http://localhost:8080
 * The setup wizard will guide you through creating an admin password.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express      = require('express')
const cors         = require('cors')
const cookieParser = require('cookie-parser')
const jwt          = require('jsonwebtoken')
const bcrypt       = require('bcryptjs')
const chokidar     = require('chokidar')
const path         = require('path')
const fs           = require('fs')
const https        = require('https')
const http         = require('http')
const zlib         = require('zlib')
const { spawn }    = require('child_process')
const os           = require('os')

// ── Paths ─────────────────────────────────────────────────────────────────────
const SERVER_DIR  = __dirname
const CONFIG_FILE = path.join(SERVER_DIR, 'config.json')
const DIST_DIR    = path.join(SERVER_DIR, '..', 'dist')

// Persistent data lives in %APPDATA%\VaultTV (or ~/.config/VaultTV on Linux/Mac)
const DATA_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'VaultTV'
)
fs.mkdirSync(DATA_DIR, { recursive: true })

const STATE_FILE    = path.join(DATA_DIR, 'watched-folders.json')
const LIBRARY_FILE  = path.join(DATA_DIR, 'library.json')
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json')
const AUTH_FILE     = path.join(DATA_DIR, 'auth.json')

// ── Config ────────────────────────────────────────────────────────────────────
let config = {
  port:        8080,
  tmdbKey:     '',
  jwtSecret:   generateSecret(),
  sessionDays: 30,
  folders:     [],
}

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    config = { ...config, ...loaded }
    console.log('[config] Loaded config.json')
  } catch (e) {
    console.warn('[config] Could not parse config.json:', e.message)
  }
} else {
  // Write a default config on first run
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
  console.log('[config] Created default config.json')
}

// Merge config folders into watched list (config always wins on path/type/name)
let watchedFolders = loadJson(STATE_FILE, [])
for (const cf of (config.folders || [])) {
  if (!cf.id || !cf.path) continue
  const ex = watchedFolders.find(w => w.id === cf.id)
  if (ex) { ex.folderPath = cf.path; ex.type = cf.type || ex.type; ex.name = cf.name || ex.name }
  else watchedFolders.push({ id: cf.id, folderPath: cf.path, type: cf.type || 'movie', name: cf.name || path.basename(cf.path) })
}
saveJson(STATE_FILE, watchedFolders)

const PORT       = config.port       || 8080
const JWT_SECRET = config.jwtSecret  || generateSecret()
const SESSION_MS = (config.sessionDays || 30) * 86400 * 1000

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'])
const MIME_TYPES = {
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv', '.webm': 'video/webm', '.ts': 'video/mp2t',
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function loadAuth()  { return loadJson(AUTH_FILE, { passwordHash: null }) }
function saveAuth(d) { saveJson(AUTH_FILE, d) }
function isSetupDone() { return !!loadAuth().passwordHash }

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${config.sessionDays || 30}d` })
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET) }
  catch { return null }
}

function requireAuth(req, res, next) {
  const token = req.cookies?.vt_session
  if (!token || !verifyToken(token)) {
    // API routes return 401 JSON; page routes redirect to login
    if (req.path.startsWith('/auth') || req.accepts('html')) {
      return res.redirect('/__login')
    }
    return res.status(401).json({ error: 'Not authenticated' })
  }
  next()
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '50mb' }))
app.use(cookieParser())

// ── Auth routes (no auth required) ───────────────────────────────────────────

// Setup check — used by login page to know if setup is needed
app.get('/auth/status', (req, res) => {
  const token = req.cookies?.vt_session
  res.json({
    setupDone:       isSetupDone(),
    authenticated:   !!(token && verifyToken(token)),
    serverName:      config.serverName || 'VaultTV Server',
  })
})

// First-run password setup
app.post('/auth/setup', async (req, res) => {
  if (isSetupDone()) return res.status(400).json({ error: 'Already set up' })
  const { password } = req.body || {}
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  const hash = await bcrypt.hash(password, 12)
  saveAuth({ passwordHash: hash })
  const token = signToken({ role: 'admin' })
  res.cookie('vt_session', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_MS })
  console.log('[auth] Admin password set — server is ready')
  res.json({ ok: true })
})

// Login
app.post('/auth/login', async (req, res) => {
  const { password } = req.body || {}
  const auth = loadAuth()
  if (!auth.passwordHash) return res.status(403).json({ error: 'Server not set up yet' })
  const ok = await bcrypt.compare(password || '', auth.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Incorrect password' })
  const token = signToken({ role: 'admin' })
  res.cookie('vt_session', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_MS })
  console.log('[auth] Login successful')
  res.json({ ok: true })
})

// Logout
app.post('/auth/logout', (req, res) => {
  res.clearCookie('vt_session')
  res.json({ ok: true })
})

// ── Setup page (served before auth) ──────────────────────────────────────────
app.get('/__setup', (req, res) => {
  if (isSetupDone()) return res.redirect('/__login')
  res.send(setupPage())
})

// ── Login page (served before auth) ──────────────────────────────────────────
app.get('/__login', (req, res) => {
  if (!isSetupDone()) return res.redirect('/__setup')
  const token = req.cookies?.vt_session
  if (token && verifyToken(token)) return res.redirect('/')
  res.send(loginPage())
})

// ── Everything below requires auth ────────────────────────────────────────────
app.use((req, res, next) => {
  // Skip auth for setup/login pages and auth API routes
  if (req.path.startsWith('/__') || req.path.startsWith('/auth/')) return next()
  requireAuth(req, res, next)
})

// Health check (authenticated)
app.get('/api/health', (req, res) => {
  res.json({
    ok:      true,
    name:    'VaultTV Server',
    version: '1.0.0',
    watching: watchedFolders.length,
    uptime:  Math.floor(process.uptime()),
    tmdbKey: !!config.tmdbKey,
  })
})

// TMDB key endpoint — the React app fetches this on startup so the key
// never needs to be baked into the built JS
app.get('/api/tmdb-key', (req, res) => {
  res.json({ key: config.tmdbKey || '' })
})

// ── SSE: live folder-change events ───────────────────────────────────────────
const sseClients   = new Set()
const pendingChanges = {}

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write('event: connected\ndata: {}\n\n')
  const hb = setInterval(() => res.write(':heartbeat\n\n'), 25000)
  sseClients.add(res)
  req.on('close', () => { clearInterval(hb); sseClients.delete(res) })
})

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try { client.write(payload) } catch { sseClients.delete(client) }
  }
}

// ── Watched folders ───────────────────────────────────────────────────────────
const watchers = {}

app.get('/folders', (req, res) => {
  res.json(watchedFolders.map(f => ({ ...f, exists: fs.existsSync(f.folderPath) })))
})

app.post('/folders', (req, res) => {
  const { id, folderPath, type, name } = req.body || {}
  if (!id || !folderPath || !type) return res.status(400).json({ error: 'id, folderPath, and type are required' })
  if (!['movie', 'tv'].includes(type)) return res.status(400).json({ error: 'type must be "movie" or "tv"' })
  if (!fs.existsSync(folderPath)) return res.status(404).json({ error: `Folder not found: ${folderPath}` })
  stopWatcher(id)
  watchedFolders = watchedFolders.filter(f => f.id !== id)
  const entry = { id, folderPath, type, name: name || path.basename(folderPath) }
  watchedFolders.push(entry)
  saveJson(STATE_FILE, watchedFolders)
  startWatcher(entry)
  res.status(201).json(entry)
})

app.delete('/folders/:id', (req, res) => {
  stopWatcher(req.params.id)
  watchedFolders = watchedFolders.filter(f => f.id !== req.params.id)
  saveJson(STATE_FILE, watchedFolders)
  res.json({ ok: true })
})

app.get('/folders/:id/scan', (req, res) => {
  const folder = watchedFolders.find(f => f.id === req.params.id)
  if (!folder) return res.status(404).json({ error: 'Not found' })
  try { res.json({ id: folder.id, files: scanDir(folder.folderPath), count: 0 }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

function startWatcher(folder) {
  if (watchers[folder.id]) return
  const w = chokidar.watch(folder.folderPath, {
    persistent: true, ignoreInitial: true, depth: 5,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
  })
  w.on('add',    fp => handleChange(folder, 'add',    fp))
   .on('unlink', fp => handleChange(folder, 'remove', fp))
   .on('error',  err => console.error(`[watch] Error in ${folder.id}:`, err))
  watchers[folder.id] = w
  console.log(`[watch] Watching: ${folder.folderPath}`)
}

function stopWatcher(id) {
  if (watchers[id]) { watchers[id].close(); delete watchers[id] }
}

function handleChange(folder, action, filePath) {
  if (!VIDEO_EXTS.has(path.extname(filePath).toLowerCase())) return
  const filename = path.basename(filePath)
  clearTimeout(pendingChanges[folder.id])
  pendingChanges[folder.id] = setTimeout(() => {
    delete pendingChanges[folder.id]
    broadcast('folder-changed', { sourceId: folder.id, sourceName: folder.name, type: folder.type, action, filename, timestamp: Date.now() })
  }, 2000)
}

function scanDir(dir, depth = 0, results = [], rootFolder = null) {
  if (depth > 8) return results
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return results }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) scanDir(full, depth + 1, results, depth === 0 ? e.name : rootFolder)
    else if (e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase())) {
      results.push({ name: e.name, path: full, rootFolder: rootFolder || null })
    }
  }
  return results
}

// ── Library ───────────────────────────────────────────────────────────────────
app.get('/library', (req, res) => {
  try {
    res.json(fs.existsSync(LIBRARY_FILE) ? JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8')) : { sources: [], files: [] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/library', (req, res) => {
  const { sources, files } = req.body || {}
  if (!Array.isArray(sources) || !Array.isArray(files)) return res.status(400).json({ error: 'body must be { sources: [], files: [] }' })
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify({ sources, files }, null, 2), 'utf8')
  res.json({ ok: true })
})

// ── Progress sync ─────────────────────────────────────────────────────────────
app.get('/progress', (req, res) => {
  const data = loadJson(PROGRESS_FILE, {})
  res.json(Object.values(data))
})

app.patch('/progress', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'body must be an array' })
  const data = loadJson(PROGRESS_FILE, {})
  let changed = 0
  for (const entry of req.body) {
    if (!entry.id || !entry.type) continue
    const key = `${entry.type}:${entry.id}`
    if (!data[key] || (entry.timestamp || 0) >= (data[key].timestamp || 0)) {
      data[key] = entry; changed++
    }
  }
  if (changed) saveJson(PROGRESS_FILE, data)
  res.json({ ok: true, updated: changed })
})

app.delete('/progress/:key', (req, res) => {
  const data = loadJson(PROGRESS_FILE, {})
  if (data[req.params.key]) { delete data[req.params.key]; saveJson(PROGRESS_FILE, data) }
  res.json({ ok: true })
})

// ── Video streaming ───────────────────────────────────────────────────────────
app.get('/stream', (req, res) => {
  const filePath = req.query.path
  if (!filePath) return res.status(400).json({ error: 'path required' })
  const allowed = watchedFolders.some(f => filePath.startsWith(f.folderPath))
  if (!allowed) return res.status(403).json({ error: 'Path is not inside a watched folder' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' })

  const stat     = fs.statSync(filePath)
  const total    = stat.size
  const mimeType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'video/mp4'
  const range    = req.headers.range

  if (range) {
    const [rawStart, rawEnd] = range.replace(/bytes=/, '').split('-')
    const start = parseInt(rawStart, 10)
    const end   = rawEnd ? parseInt(rawEnd, 10) : Math.min(start + 10 * 1024 * 1024 - 1, total - 1)
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': mimeType,
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': mimeType, 'Accept-Ranges': 'bytes' })
    fs.createReadStream(filePath).pipe(res)
  }
})

// ── Probe ─────────────────────────────────────────────────────────────────────
app.get('/probe', (req, res) => {
  const sourceUrl = req.query.url
  if (!sourceUrl) return res.status(400).json({ error: 'url required' })
  const ff = spawn('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_streams',
    '-read_intervals', '%+#5', sourceUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  ff.stdout.on('data', d => { out += d })
  ff.on('close', () => {
    try {
      const { streams = [] } = JSON.parse(out)
      res.json({
        audioCodec: streams.find(s => s.codec_type === 'audio')?.codec_name || null,
        videoCodec: streams.find(s => s.codec_type === 'video')?.codec_name || null,
      })
    } catch { res.json({ audioCodec: null, videoCodec: null }) }
  })
  ff.on('error', err => res.status(err.code === 'ENOENT' ? 500 : 500).json({ error: err.message }))
})

// ── Transcode ─────────────────────────────────────────────────────────────────
app.get('/transcode', (req, res) => {
  const { url: sourceUrl, t, tv, al } = req.query
  if (!sourceUrl) return res.status(400).json({ error: 'url required' })
  try { new URL(sourceUrl) } catch { return res.status(400).json({ error: 'Invalid URL' }) }

  const startSec       = parseFloat(t)  || 0
  const transcodeVideo = tv === '1'
  const audioLang      = (al || '').toLowerCase().trim()

  const args = ['-threads', '2']
  if (startSec > 0) args.push('-ss', String(startSec))
  args.push('-i', sourceUrl)
  if (transcodeVideo) {
    args.push('-map', '0:v:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-threads', '2')
  } else {
    args.push('-map', '0:v:0', '-c:v', 'copy')
  }
  args.push('-map', audioLang ? `0:a:m:language:${audioLang}` : '0:a:0')
  args.push('-c:a', 'aac', '-b:a', '128k', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1')

  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Cache-Control', 'no-cache')
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  ff.stdout.pipe(res)
  ff.stderr.on('data', d => { const l = d.toString(); if (l.includes('Error') || l.includes('Invalid')) console.error('[transcode]', l.trim()) })
  ff.on('close', code => { if (code !== 0) console.warn(`[transcode] exit ${code}`); if (!res.writableEnded) res.end() })
  ff.on('error', err => { console.error('[transcode] spawn:', err.message); if (!res.writableEnded) res.end() })
  req.on('close', () => { if (!ff.killed) ff.kill('SIGKILL') })
})

// ── Subtitles ─────────────────────────────────────────────────────────────────
app.get('/subtitles', async (req, res) => {
  try {
    const { imdb_id, lang = 'en', query, year } = req.query
    if (!imdb_id && !query) return res.status(400).json({ error: 'imdb_id or query required' })

    const hasRealImdbId = imdb_id && /^tt\d+/i.test(imdb_id.split(':')[0])
    let searchUrl
    if (hasRealImdbId) {
      const [rawId, season, episode] = imdb_id.split(':')
      const bareId = rawId.replace(/^tt/i, '')
      let p = `/search/imdbid-${bareId}/sublanguageid-${lang}`
      if (season && episode) p += `/season-${season}/episode-${episode}`
      searchUrl = `https://rest.opensubtitles.org${p}`
    } else if (query) {
      searchUrl = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(query).replace(/%20/g, '+')}${year ? `/year-${year}` : ''}/sublanguageid-${lang}`
    } else {
      return res.status(400).json({ error: 'Valid imdb_id or query required' })
    }

    const searchResp = await httpGet(searchUrl, { 'X-User-Agent': 'VaultTV v1.0' })
    if (searchResp.status !== 200) return res.status(404).json({ error: 'OpenSubtitles error' })

    const results = JSON.parse(searchResp.body.toString())
    if (!Array.isArray(results) || !results.length) return res.status(404).json({ error: 'No subtitles found' })

    results.sort((a, b) => parseInt(b.SubDownloadsCnt || 0) - parseInt(a.SubDownloadsCnt || 0))
    const best = results[0]
    if (!best.SubDownloadLink) return res.status(404).json({ error: 'No download link' })

    const dlResp = await httpGet(best.SubDownloadLink, { 'X-User-Agent': 'VaultTV v1.0' })
    const isGzip = dlResp.headers['content-encoding'] === 'gzip' || (dlResp.body[0] === 0x1f && dlResp.body[1] === 0x8b)
    const srtBuffer = isGzip
      ? await new Promise((ok, fail) => zlib.gunzip(dlResp.body, (e, b) => e ? fail(e) : ok(b)))
      : dlResp.body

    const vtt = 'WEBVTT\n\n' + srtBuffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2').trim() + '\n'

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(vtt)
  } catch (e) {
    console.error('[subtitles]', e.message)
    if (!res.headersSent) res.status(500).json({ error: e.message })
  }
})

// ── Admin settings page ───────────────────────────────────────────────────────
app.get('/__admin', (req, res) => {
  if (!isSetupDone()) return res.redirect('/__setup')
  const token = req.cookies?.vt_session
  if (!token || !verifyToken(token)) return res.redirect('/__login')
  res.send(adminPage())
})

// Save general settings (serverName, tmdbKey, sessionDays)
app.post('/__admin/settings', (req, res) => {
  if (!isSetupDone() || !verifyToken(req.cookies?.vt_session)) return res.status(401).json({ error: 'Not authenticated' })
  const { serverName, tmdbKey, sessionDays } = req.body || {}
  const updated = { ...config }
  if (serverName !== undefined) updated.serverName = serverName.trim()
  if (tmdbKey    !== undefined) updated.tmdbKey    = tmdbKey.trim()
  if (sessionDays !== undefined && parseInt(sessionDays) > 0) updated.sessionDays = parseInt(sessionDays)
  config = updated
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8') }
  catch (e) { return res.status(500).json({ error: e.message }) }
  res.json({ ok: true })
})

// Add a folder
app.post('/__admin/folders', (req, res) => {
  if (!isSetupDone() || !verifyToken(req.cookies?.vt_session)) return res.status(401).json({ error: 'Not authenticated' })
  const { folderPath, type, name } = req.body || {}
  if (!folderPath || !type) return res.status(400).json({ error: 'folderPath and type required' })
  if (!['movie', 'tv'].includes(type)) return res.status(400).json({ error: 'type must be movie or tv' })
  if (!fs.existsSync(folderPath)) return res.status(404).json({ error: `Path not found: ${folderPath}` })
  const id = name ? name.toLowerCase().replace(/\s+/g, '_') : path.basename(folderPath).toLowerCase().replace(/\s+/g, '_')
  const entry = { id, folderPath, type, name: name || path.basename(folderPath) }
  watchedFolders = watchedFolders.filter(f => f.id !== id)
  watchedFolders.push(entry)
  saveJson(STATE_FILE, watchedFolders)
  config.folders = watchedFolders.map(f => ({ id: f.id, path: f.folderPath, type: f.type, name: f.name }))
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8') } catch {}
  startWatcher(entry)
  res.json({ ok: true, folder: entry })
})

// Remove a folder
app.delete('/__admin/folders/:id', (req, res) => {
  if (!isSetupDone() || !verifyToken(req.cookies?.vt_session)) return res.status(401).json({ error: 'Not authenticated' })
  stopWatcher(req.params.id)
  watchedFolders = watchedFolders.filter(f => f.id !== req.params.id)
  saveJson(STATE_FILE, watchedFolders)
  config.folders = watchedFolders.map(f => ({ id: f.id, path: f.folderPath, type: f.type, name: f.name }))
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8') } catch {}
  res.json({ ok: true })
})

// Change password
app.post('/__admin/password', async (req, res) => {
  if (!isSetupDone() || !verifyToken(req.cookies?.vt_session)) return res.status(401).json({ error: 'Not authenticated' })
  const { current, newPassword } = req.body || {}
  const auth = loadAuth()
  const ok = await bcrypt.compare(current || '', auth.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' })
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })
  const hash = await bcrypt.hash(newPassword, 12)
  saveAuth({ passwordHash: hash })
  res.json({ ok: true })
})

// ── Serve the React web app ───────────────────────────────────────────────────
// Redirect root to setup/login if needed, then serve the built dist/

app.get('/', (req, res) => {
  if (!isSetupDone()) return res.redirect('/__setup')
  const token = req.cookies?.vt_session
  if (!token || !verifyToken(token)) return res.redirect('/__login')
  serveApp(res)
})

function serveApp(res) {
  const indexPath = path.join(DIST_DIR, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return res.status(503).send(buildRequiredPage())
  }
  let html = fs.readFileSync(indexPath, 'utf8')
  // Inject TMDB key and server URL so the React app can use them
  // without needing VITE_TMDB_KEY baked into the build
  const inject = `<script>
    window.__VAULTTV_SERVER = true;
    window.__TMDB_KEY = ${JSON.stringify(config.tmdbKey || '')};
    window.__COMPANION_ONLINE = true;
  </script>`
  html = html.replace('</head>', inject + '\n</head>')
  res.setHeader('Content-Type', 'text/html')
  res.send(html)
}

// Static assets (JS, CSS, images) — served without auth (needed by login page too)
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false }))
}

// SPA fallback — React Router handles client-side routing
app.get('*', (req, res) => {
  // Skip API-style paths
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path.startsWith('/__')) return res.status(404).json({ error: 'Not found' })
  if (!isSetupDone()) return res.redirect('/__setup')
  const token = req.cookies?.vt_session
  if (!token || !verifyToken(token)) return res.redirect('/__login')
  serveApp(res)
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadJson(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (e) { console.warn(`[json] Could not load ${path.basename(file)}:`, e.message) }
  return fallback
}

function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8') }
  catch (e) { console.warn(`[json] Could not save ${path.basename(file)}:`, e.message) }
}

function generateSecret() {
  try { return require('crypto').randomBytes(32).toString('hex') }
  catch { return 'vaulttv-change-this-secret-' + Date.now() }
}

function httpGet(url, reqHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { headers: { 'User-Agent': 'VaultTV v1.0', ...reqHeaders } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, reqHeaders).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ── HTML pages ────────────────────────────────────────────────────────────────
function pageShell(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — VaultTV</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#13131a;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:2.5rem 2rem;width:100%;max-width:400px;margin:1rem}
  h1{font-size:1.4rem;font-weight:800;margin-bottom:.3rem}
  .sub{color:rgba(255,255,255,.45);font-size:.85rem;margin-bottom:1.75rem}
  label{display:block;font-size:.82rem;font-weight:600;color:rgba(255,255,255,.65);margin-bottom:.35rem}
  input{width:100%;padding:.65rem .9rem;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff;font-size:.92rem;outline:none;margin-bottom:1rem;transition:border-color .2s}
  input:focus{border-color:#7c3aed}
  button{width:100%;padding:.75rem;background:#7c3aed;border:none;border-radius:8px;color:#fff;font-size:.92rem;font-weight:700;cursor:pointer;transition:background .2s}
  button:hover{background:#6d28d9}
  button:disabled{opacity:.5;cursor:default}
  .err{color:#f87171;font-size:.82rem;margin-top:.5rem;display:none}
  .logo{font-size:1.8rem;font-weight:900;letter-spacing:-.03em;margin-bottom:1.5rem;color:#fff}
  .logo span{color:#7c3aed}
</style>
</head>
<body>${body}</body>
</html>`
}

function loginPage() {
  return pageShell('Sign In', `
<div class="card">
  <div class="logo">Vault<span>TV</span></div>
  <h1>Sign in</h1>
  <p class="sub">Enter your server password to continue.</p>
  <form id="f">
    <label>Password</label>
    <input type="password" id="pw" autofocus autocomplete="current-password" placeholder="Your server password">
    <button type="submit" id="btn">Sign in</button>
    <p class="err" id="err">Incorrect password.</p>
  </form>
  <script>
    const f=document.getElementById('f'),btn=document.getElementById('btn'),err=document.getElementById('err')
    f.addEventListener('submit',async e=>{
      e.preventDefault(); btn.disabled=true; btn.textContent='Signing in…'; err.style.display='none'
      const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('pw').value})})
      if(r.ok){window.location='/'}else{err.style.display='block';btn.disabled=false;btn.textContent='Sign in'}
    })
  </script>
</div>`)
}

function setupPage() {
  return pageShell('Setup', `
<div class="card">
  <div class="logo">Vault<span>TV</span></div>
  <h1>Welcome to VaultTV Server</h1>
  <p class="sub">Create an admin password to secure your server. You'll need this to sign in from any device.</p>
  <form id="f">
    <label>Admin password</label>
    <input type="password" id="pw" autofocus autocomplete="new-password" placeholder="At least 8 characters">
    <label>Confirm password</label>
    <input type="password" id="pw2" autocomplete="new-password" placeholder="Repeat password">
    <button type="submit" id="btn">Set up VaultTV Server</button>
    <p class="err" id="err">Passwords don't match or too short.</p>
  </form>
  <script>
    const f=document.getElementById('f'),btn=document.getElementById('btn'),err=document.getElementById('err')
    f.addEventListener('submit',async e=>{
      e.preventDefault()
      const pw=document.getElementById('pw').value,pw2=document.getElementById('pw2').value
      if(pw!==pw2||pw.length<8){err.style.display='block';return}
      btn.disabled=true;btn.textContent='Setting up…';err.style.display='none'
      const r=await fetch('/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})})
      if(r.ok){window.location='/'}else{err.style.display='block';btn.disabled=false;btn.textContent='Set up VaultTV Server'}
    })
  </script>
</div>`)
}

function adminPage() {
  const folders = watchedFolders.map(f => ({
    id: f.id, path: f.folderPath, type: f.type, name: f.name,
    exists: fs.existsSync(f.folderPath),
  }))
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Settings — VaultTV Server</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e5e5ea;min-height:100vh}
  header{background:#13131a;border-bottom:1px solid rgba(255,255,255,.08);padding:1rem 2rem;display:flex;align-items:center;gap:1rem;position:sticky;top:0;z-index:10}
  .logo{font-size:1.3rem;font-weight:900;color:#fff;text-decoration:none}.logo span{color:#7c3aed}
  header nav{margin-left:auto;display:flex;gap:.75rem}
  header nav a{color:rgba(255,255,255,.5);text-decoration:none;font-size:.85rem;padding:.4rem .8rem;border-radius:6px;transition:all .2s}
  header nav a:hover{background:rgba(255,255,255,.07);color:#fff}
  .container{max-width:860px;margin:0 auto;padding:2rem 1.5rem}
  h2{font-size:1.5rem;font-weight:800;margin-bottom:.3rem}
  .page-sub{color:rgba(255,255,255,.4);font-size:.88rem;margin-bottom:2rem}
  .section{background:#13131a;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:1.5rem;margin-bottom:1.5rem}
  .section-title{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7c3aed;margin-bottom:1.1rem}
  .field{margin-bottom:1rem}
  .field:last-child{margin-bottom:0}
  label{display:block;font-size:.82rem;font-weight:600;color:rgba(255,255,255,.55);margin-bottom:.35rem}
  input[type=text],input[type=password],input[type=number],select{width:100%;padding:.6rem .85rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#fff;font-size:.9rem;outline:none;transition:border-color .2s}
  input:focus,select:focus{border-color:#7c3aed}
  select option{background:#1a1a24}
  .row{display:flex;gap:.75rem}
  .row input{flex:1}
  .row select{width:130px;flex:none}
  .btn{display:inline-flex;align-items:center;gap:.4rem;padding:.6rem 1.2rem;border:none;border-radius:8px;font-size:.88rem;font-weight:700;cursor:pointer;transition:all .2s}
  .btn-primary{background:#7c3aed;color:#fff}.btn-primary:hover{background:#6d28d9}
  .btn-danger{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.25)}.btn-danger:hover{background:rgba(239,68,68,.25)}
  .btn-sm{padding:.4rem .85rem;font-size:.8rem}
  .btn:disabled{opacity:.5;cursor:default}
  .folder-list{display:flex;flex-direction:column;gap:.6rem;margin-bottom:1rem}
  .folder-row{display:flex;align-items:center;gap:.75rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:.75rem 1rem}
  .folder-info{flex:1;min-width:0}
  .folder-name{font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .folder-path{font-size:.75rem;color:rgba(255,255,255,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.15rem}
  .folder-type{font-size:.7rem;font-weight:700;padding:.2rem .5rem;border-radius:4px;margin-left:.5rem;flex:none}
  .type-movie{background:rgba(124,58,237,.2);color:#a78bfa}
  .type-tv{background:rgba(16,185,129,.15);color:#34d399}
  .badge-missing{font-size:.7rem;padding:.15rem .5rem;border-radius:4px;background:rgba(239,68,68,.15);color:#f87171;margin-left:.5rem;flex:none}
  .toast{position:fixed;bottom:1.5rem;right:1.5rem;background:#1a1a2e;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:.75rem 1.25rem;font-size:.88rem;font-weight:600;display:none;z-index:100;box-shadow:0 8px 32px rgba(0,0,0,.5)}
  .toast.ok{border-color:#34d399;color:#34d399}
  .toast.err{border-color:#f87171;color:#f87171}
  .divider{height:1px;background:rgba(255,255,255,.07);margin:1rem 0}
  .stat-row{display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:1rem}
  .stat{background:rgba(255,255,255,.04);border-radius:10px;padding:.75rem 1rem;flex:1;min-width:120px}
  .stat-val{font-size:1.4rem;font-weight:800;color:#a78bfa}
  .stat-lbl{font-size:.75rem;color:rgba(255,255,255,.4);margin-top:.1rem}
</style>
</head>
<body>
<header>
  <a class="logo" href="/__admin">Vault<span>TV</span> <span style="font-size:.75rem;font-weight:500;color:rgba(255,255,255,.3);margin-left:.25rem">Server Settings</span></a>
  <nav>
    <a href="/">← Back to app</a>
    <a href="#" onclick="logout();return false">Sign out</a>
  </nav>
</header>
<div class="container">
  <h2>Server Settings</h2>
  <p class="page-sub">Manage your VaultTV Server — folders, API keys, and account settings.</p>

  <!-- Status -->
  <div class="section">
    <div class="section-title">Server Status</div>
    <div class="stat-row">
      <div class="stat"><div class="stat-val" id="s-folders">${folders.length}</div><div class="stat-lbl">Media folders</div></div>
      <div class="stat"><div class="stat-val" id="s-uptime">—</div><div class="stat-lbl">Uptime</div></div>
      <div class="stat"><div class="stat-val" style="color:${config.tmdbKey ? '#34d399' : '#f87171'}">${config.tmdbKey ? '✓' : '✗'}</div><div class="stat-lbl">TMDB key</div></div>
    </div>
  </div>

  <!-- Media Folders -->
  <div class="section">
    <div class="section-title">Media Folders</div>
    <div class="folder-list" id="folder-list">
      ${folders.length ? folders.map(f => folderRowHtml(f)).join('') : '<p style="color:rgba(255,255,255,.3);font-size:.88rem">No folders added yet.</p>'}
    </div>
    <div class="divider"></div>
    <div class="row" style="align-items:flex-end;margin-top:.75rem">
      <div class="field" style="flex:1;margin:0">
        <label>Folder path</label>
        <input type="text" id="new-path" placeholder="D:\\Movies">
      </div>
      <div class="field" style="margin:0">
        <label>Type</label>
        <select id="new-type"><option value="movie">Movies</option><option value="tv">TV Shows</option></select>
      </div>
      <div class="field" style="margin:0">
        <label>Name (optional)</label>
        <input type="text" id="new-name" placeholder="Movies" style="width:140px">
      </div>
      <button class="btn btn-primary" onclick="addFolder()">Add folder</button>
    </div>
  </div>

  <!-- General Settings -->
  <div class="section">
    <div class="section-title">General</div>
    <div class="field">
      <label>Server name</label>
      <input type="text" id="serverName" value="${escHtml(config.serverName || 'VaultTV Server')}" placeholder="VaultTV Server">
    </div>
    <div class="field">
      <label>TMDB API key</label>
      <input type="text" id="tmdbKey" value="${escHtml(config.tmdbKey || '')}" placeholder="Paste your TMDB v3 API key">
    </div>
    <div class="field">
      <label>Session length (days)</label>
      <input type="number" id="sessionDays" value="${config.sessionDays || 30}" min="1" max="365" style="width:120px">
    </div>
    <button class="btn btn-primary" onclick="saveSettings()">Save settings</button>
  </div>

  <!-- Change Password -->
  <div class="section">
    <div class="section-title">Change Password</div>
    <div class="field">
      <label>Current password</label>
      <input type="password" id="cur-pw" placeholder="Current password">
    </div>
    <div class="field">
      <label>New password</label>
      <input type="password" id="new-pw" placeholder="At least 8 characters">
    </div>
    <div class="field">
      <label>Confirm new password</label>
      <input type="password" id="new-pw2" placeholder="Repeat new password">
    </div>
    <button class="btn btn-primary" onclick="changePassword()">Change password</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  // Uptime
  fetch('/api/health').then(r=>r.json()).then(d=>{
    const s=d.uptime,h=Math.floor(s/3600),m=Math.floor((s%3600)/60)
    document.getElementById('s-uptime').textContent = h>0 ? h+'h '+m+'m' : m+'m'
  }).catch(()=>{})

  function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

  function toast(msg, ok=true){
    const t=document.getElementById('toast')
    t.textContent=msg; t.className='toast '+(ok?'ok':'err'); t.style.display='block'
    clearTimeout(t._t); t._t=setTimeout(()=>t.style.display='none', 3000)
  }

  async function api(method, url, body){
    const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
    return {ok:r.ok,data:await r.json()}
  }

  function folderRowHtml(f){
    return '<div class="folder-row" id="fr-'+f.id+'">'
      +'<div class="folder-info">'
      +'<div class="folder-name">'+escHtml(f.name)
      +'<span class="folder-type type-'+f.type+'">'+(f.type==='movie'?'Movies':'TV Shows')+'</span>'
      +(f.exists===false?'<span class="badge-missing">Not found</span>':'')
      +'</div>'
      +'<div class="folder-path">'+escHtml(f.path)+'</div>'
      +'</div>'
      +'<button class="btn btn-danger btn-sm" onclick="removeFolder('+JSON.stringify(f.id)+')">Remove</button>'
      +'</div>'
  }

  async function addFolder(){
    const p=document.getElementById('new-path').value.trim()
    const t=document.getElementById('new-type').value
    const n=document.getElementById('new-name').value.trim()
    if(!p){toast('Enter a folder path',false);return}
    const {ok,data}=await api('POST','/__admin/folders',{folderPath:p,type:t,name:n||undefined})
    if(ok){
      const list=document.getElementById('folder-list')
      if(list.querySelector('p'))list.innerHTML=''
      list.insertAdjacentHTML('beforeend',folderRowHtml({...data.folder,exists:true}))
      document.getElementById('new-path').value=''
      document.getElementById('new-name').value=''
      document.getElementById('s-folders').textContent=list.querySelectorAll('.folder-row').length
      toast('Folder added')
    } else { toast(data.error||'Failed to add folder',false) }
  }

  async function removeFolder(id){
    if(!confirm('Remove this folder from VaultTV Server?'))return
    const {ok,data}=await api('DELETE','/__admin/folders/'+id)
    if(ok){
      document.getElementById('fr-'+id)?.remove()
      const list=document.getElementById('folder-list')
      if(!list.querySelector('.folder-row'))list.innerHTML='<p style="color:rgba(255,255,255,.3);font-size:.88rem">No folders added yet.</p>'
      document.getElementById('s-folders').textContent=list.querySelectorAll('.folder-row').length
      toast('Folder removed')
    } else { toast(data.error||'Failed to remove',false) }
  }

  async function saveSettings(){
    const {ok,data}=await api('POST','/__admin/settings',{
      serverName:document.getElementById('serverName').value.trim(),
      tmdbKey:document.getElementById('tmdbKey').value.trim(),
      sessionDays:parseInt(document.getElementById('sessionDays').value)||30,
    })
    ok ? toast('Settings saved') : toast(data.error||'Failed to save',false)
  }

  async function changePassword(){
    const cur=document.getElementById('cur-pw').value
    const np=document.getElementById('new-pw').value
    const np2=document.getElementById('new-pw2').value
    if(np!==np2){toast('New passwords don\\'t match',false);return}
    if(np.length<8){toast('Password must be at least 8 characters',false);return}
    const {ok,data}=await api('POST','/__admin/password',{current:cur,newPassword:np})
    if(ok){
      toast('Password changed')
      document.getElementById('cur-pw').value=''
      document.getElementById('new-pw').value=''
      document.getElementById('new-pw2').value=''
    } else { toast(data.error||'Failed',false) }
  }

  async function logout(){
    await fetch('/auth/logout',{method:'POST'})
    window.location='/__login'
  }
</script>
</body>
</html>`

  function folderRowHtml(f) {
    return `<div class="folder-row" id="fr-${f.id}">
      <div class="folder-info">
        <div class="folder-name">${escHtml(f.name)}<span class="folder-type type-${f.type}">${f.type === 'movie' ? 'Movies' : 'TV Shows'}</span>${!f.exists ? '<span class="badge-missing">Not found</span>' : ''}</div>
        <div class="folder-path">${escHtml(f.path)}</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeFolder('${f.id}')">Remove</button>
    </div>`
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}

function buildRequiredPage() {
  return pageShell('Build Required', `
<div class="card">
  <div class="logo">Vault<span>TV</span></div>
  <h1>Build required</h1>
  <p class="sub">The VaultTV web app hasn't been built yet. Run the following command in the VaultTV project folder, then restart the server.</p>
  <pre style="background:rgba(0,0,0,.4);border-radius:8px;padding:1rem;font-size:.82rem;color:#a78bfa;overflow:auto;margin-top:1rem">npm run build</pre>
</div>`)
}

// ── Startup ───────────────────────────────────────────────────────────────────
for (const folder of watchedFolders) {
  if (fs.existsSync(folder.folderPath)) startWatcher(folder)
  else console.warn(`[watch] Folder not found, skipping: ${folder.folderPath}`)
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const nets  = os.networkInterfaces()
  const lanIp = Object.values(nets).flat().find(n => n.family === 'IPv4' && !n.internal)?.address || 'your-pc-ip'

  console.log('\n🎬 VaultTV Server running')
  console.log(`   Local:   http://localhost:${PORT}`)
  console.log(`   Network: http://${lanIp}:${PORT}`)
  if (!isSetupDone()) {
    console.log('\n   ⚡ First run — open the URL above and set your admin password.\n')
  } else {
    console.log(`   Watching ${watchedFolders.length} folder(s)`)
    console.log(`   TMDB key: ${config.tmdbKey ? 'configured ✓' : 'NOT SET — add tmdbKey to config.json'}`)
    console.log()
  }
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use. Check Task Manager for another node.exe instance.\n`)
  } else {
    console.error('Server error:', err.message)
  }
  process.exit(1)
})

process.on('SIGINT', () => {
  console.log('\n[shutdown] Stopping...')
  Object.keys(watchers).forEach(stopWatcher)
  process.exit(0)
})
