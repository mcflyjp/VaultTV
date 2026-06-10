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
