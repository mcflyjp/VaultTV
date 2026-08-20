/**
 * VaultTV Media Server — Electron tray app
 * Replaces tray.ps1 / launch-tray.vbs / start.bat with a proper packaged app.
 *
 * - Starts server/index.js via utilityProcess (Electron's bundled Node — no system Node needed)
 * - Native tray icon with full context menu
 * - app.setLoginItemSettings() for Start at Login (no registry hacks)
 * - Packages into VaultTV-Media-Server-Setup.exe via electron-builder
 */

'use strict'

const {
  app, Tray, Menu, nativeImage, shell,
  BrowserWindow, dialog, ipcMain,
  utilityProcess,
} = require('electron')
const path   = require('path')
const fs     = require('fs')
const http   = require('http')
const os     = require('os')

// Must be set before any userData-path-dependent call. Without this, this app and
// the separate main VaultTV desktop app both inherit "vaulttv" from package.json's
// shared "name" field, collide on the same userData folder + singleton lock, and
// whichever one is NOT already running silently quits with no window and no error.
app.setName('VaultTV Media Server')

// Auto-updater — only active in the packaged app (not dev, where there's no
// installer/update feed to check against)
let autoUpdater = null
if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.channel = 'media-server' // see server-builder.config.cjs for why
  } catch {}
}
let updateState = 'idle' // 'idle' | 'checking' | 'available' | 'downloaded' | 'not-available' | 'error'
let updateVersion = null
let updateProgressPct = null
let updateErrorMsg = null

// ── Single instance ───────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }

// ── Paths ─────────────────────────────────────────────────────────────────────
const IS_PACKAGED  = app.isPackaged
// __dirname resolves correctly in both dev (server/) and packaged (resources/app/server/)
const SERVER_DIR   = __dirname
const SERVER_ENTRY = path.join(SERVER_DIR, 'index.js')

// Config lives in %APPDATA%\VaultTV — the SAME stable, install-independent
// location every other piece of persistent state already uses (watched-folders,
// library, progress, auth, rom-folders). It must NOT live next to the exe: the
// installer doesn't reliably reuse the previous install directory on reinstall
// (it can silently install fresh to a different default path), which wiped this
// user's settings — port, TMDB key, folders, Supabase config, RetroArch path —
// on every single reinstall this session. APPDATA survives all of that.
const CONFIG_DIR  = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'VaultTV')
fs.mkdirSync(CONFIG_DIR, { recursive: true })
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// One-time migration: older installs kept config.json next to the exe. If the
// new APPDATA location is empty but an old install-folder copy exists, adopt it
// automatically instead of showing the first-run setup wizard again.
if (IS_PACKAGED && !fs.existsSync(CONFIG_FILE)) {
  const legacyConfigFile = path.join(path.dirname(process.execPath), 'config.json')
  if (fs.existsSync(legacyConfigFile)) {
    try {
      fs.copyFileSync(legacyConfigFile, CONFIG_FILE)
      console.log('[config] Migrated config.json from install folder to', CONFIG_DIR)
    } catch (e) {
      console.warn('[config] Migration from legacy location failed:', e.message)
    }
  }
}

// ── Read port from config ─────────────────────────────────────────────────────
function readPort() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).port || 8080 }
  catch { return 8080 }
}

let port          = readPort()
let serverUrl     = `http://localhost:${port}`
let serverProc    = null
let tray          = null
let setupWin      = null

// ── Tunnel URL — read-only here ────────────────────────────────────────────────
// Actually starting/managing the tunnel lives entirely in server/index.js
// (inside the forked server process) now — it supports the stable named-
// tunnel mode and is the single source of truth for config.tunnelUrl. This
// used to also spawn its own separate quick-tunnel process here in the main
// process; two independent cloudflareds raced to write config.json, and this
// dumber one (quick-tunnel only) usually won, clobbering a good named-tunnel
// URL with a throwaway random one every restart. Tray menu just reflects
// whatever the server actually set up.
function readTunnelUrl() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).tunnelUrl || null } catch { return null }
}

// ── Tray icon (16×16 purple circle with "VTV") ────────────────────────────────
function buildIcon() {
  // Prefer ICO on Windows (multi-resolution), PNG elsewhere
  const candidates = IS_PACKAGED
    ? [
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(process.resourcesPath, 'icon.png'),
      ]
    : [
        path.join(__dirname, '..', 'public', 'logo.ico'),
        path.join(__dirname, '..', 'public', 'logo.png'),
      ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return nativeImage.createFromPath(p)
  }
  return nativeImage.createEmpty()
}

// ── Start the server ──────────────────────────────────────────────────────────
const SERVER_LOG_FILE = path.join(CONFIG_DIR, 'server-log.txt')
function startServer() {
  if (serverProc) return
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error('[tray] server/index.js not found at', SERVER_ENTRY)
    return
  }
  serverProc = utilityProcess.fork(SERVER_ENTRY, [], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      VAULTTV_CONFIG_DIR: CONFIG_DIR,  // %APPDATA%\VaultTV — stable across reinstalls
      NODE_ENV: 'production',
    },
    stdio: 'pipe', // capture stdout/stderr instead of letting them vanish — see server-log.txt below
  })
  // The server's own console.log/error/warn (transcode failures, ffmpeg spawn
  // errors, etc.) previously went nowhere — utilityProcess.fork() output is
  // dropped unless explicitly piped. Appended, not overwritten, so a history
  // survives across restarts; capped by truncating from the front once large.
  function logServerLine(stream, chunk) {
    const line = chunk.toString().split('\n').filter(Boolean).map(l => `[${new Date().toISOString()}] [${stream}] ${l}`).join('\n') + '\n'
    try {
      if (fs.existsSync(SERVER_LOG_FILE) && fs.statSync(SERVER_LOG_FILE).size > 2_000_000) {
        const tail = fs.readFileSync(SERVER_LOG_FILE, 'utf8').slice(-1_000_000)
        fs.writeFileSync(SERVER_LOG_FILE, tail)
      }
      fs.appendFileSync(SERVER_LOG_FILE, line)
    } catch {}
  }
  serverProc.stdout?.on('data', d => logServerLine('out', d))
  serverProc.stderr?.on('data', d => logServerLine('err', d))
  serverProc.on('exit', (code) => {
    console.log('[tray] server exited with code', code)
    logServerLine('tray', `server exited with code ${code}`)
    serverProc = null
    updateMenu()
  })
  console.log('[tray] VaultTV Server started')
  // Give the server 2 seconds to bind, then refresh the menu
  setTimeout(updateMenu, 2000)
}

function stopServer() {
  if (serverProc) { serverProc.kill(); serverProc = null }
}

// ── Poll /internal/status for rescan state ────────────────────────────────────
let rescanRunning = false
function pollStatus() {
  const req = http.get(`${serverUrl}/internal/status`, { timeout: 2000 }, (res) => {
    let body = ''
    res.on('data', d => { body += d })
    res.on('end', () => {
      try {
        const data = JSON.parse(body)
        const wasRunning = rescanRunning
        rescanRunning = data.running === true
        if (wasRunning !== rescanRunning) updateMenu()
      } catch {}
    })
  })
  req.on('error', () => {})
  req.end()
}

// ── Auto-updater ───────────────────────────────────────────────────────────────
// Logged to a plain-text file, not just console (nobody sees a tray app's
// stdout) — this was previously silent, which is exactly what made a stuck
// download indistinguishable from "no update yet" or a real error.
const UPDATE_LOG_FILE = path.join(app.getPath('userData'), 'update-log.txt')
function logUpdate(line) {
  try { fs.appendFileSync(UPDATE_LOG_FILE, `[${new Date().toISOString()}] ${line}\n`) } catch {}
  console.log('[updater]', line)
}

// electron-updater stages downloaded installers under
// %LOCALAPPDATA%\<name>-updater\pending before installing, and is *supposed*
// to clean that up itself once applied — but that cleanup only runs on a
// graceful quitAndInstall, not if the app was killed/crashed mid-cycle, which
// leaves a 150MB+ installer sitting there indefinitely. This clears it once
// per startup, but only when the pending download's own version is already
// <= the version currently running — i.e. it's confirmed already applied (or
// superseded), never a download still in progress toward a newer version.
function cleanupStaleUpdateCache() {
  try {
    // electron-updater keys its cache dir off package.json's "name" field
    // (extraMetadata.name = 'vaulttv-media-server'), NOT app.getName() —
    // which here returns the app.setName() override instead.
    const pkgName = require(path.join(__dirname, '..', 'package.json')).name
    const cacheDir = path.join(app.getPath('appData'), '..', 'Local', `${pkgName}-updater`)
    const pendingInfo = path.join(cacheDir, 'pending', 'update-info.json')
    if (!fs.existsSync(pendingInfo)) return
    const info = JSON.parse(fs.readFileSync(pendingInfo, 'utf8'))
    const pendingVersion = info?.version
    if (!pendingVersion) return
    const current = app.getVersion()
    const cmp = pendingVersion.localeCompare(current, undefined, { numeric: true })
    if (cmp <= 0) {
      fs.rmSync(cacheDir, { recursive: true, force: true })
      logUpdate(`cleared stale update cache (pending v${pendingVersion}, running v${current})`)
    }
  } catch (e) {
    logUpdate(`stale update cache cleanup failed: ${e.message}`)
  }
}

function initAutoUpdater() {
  if (!autoUpdater) return

  cleanupStaleUpdateCache()

  autoUpdater.autoDownload         = true  // download silently in background once found
  autoUpdater.autoInstallOnAppQuit = true  // install on next quit even if user never clicks Restart

  autoUpdater.on('checking-for-update', () => {
    logUpdate('checking for update')
    updateState = 'checking'
    updateMenu()
  })
  autoUpdater.on('update-available', (info) => {
    logUpdate(`update available: v${info.version}`)
    updateState   = 'available'
    updateVersion = info.version
    updateErrorMsg = null
    updateMenu()
    tray?.displayBalloon({
      title:    'VaultTV Server',
      content:  `Update v${info.version} found — downloading in the background…`,
      iconType: 'info',
    })
  })
  autoUpdater.on('update-not-available', (info) => {
    logUpdate(`no update available (current ${info?.version || '?'})`)
    updateState = 'not-available'
    updateMenu()
  })
  autoUpdater.on('download-progress', (p) => {
    updateProgressPct = p.percent
    logUpdate(`downloading: ${p.percent.toFixed(1)}% (${(p.transferred / 1e6).toFixed(1)}MB / ${(p.total / 1e6).toFixed(1)}MB)`)
    updateMenu()
  })
  autoUpdater.on('update-downloaded', (info) => {
    logUpdate(`download complete: v${info.version} — will install on quit`)
    updateState   = 'downloaded'
    updateVersion = info.version
    updateErrorMsg = null
    updateMenu()
    tray?.displayBalloon({
      title:    'VaultTV Server',
      content:  `Update v${info.version} ready — right-click the tray icon to restart and install.`,
      iconType: 'info',
    })
  })
  autoUpdater.on('error', (err) => {
    updateState = 'error'
    updateErrorMsg = err?.message || 'Unknown error'
    logUpdate(`ERROR: ${err?.message}\n${err?.stack || ''}`)
    updateMenu()
  })

  // Check on startup (10s delay so the server has time to bind first) and every 6 hours after
  setTimeout(() => autoUpdater.checkForUpdates().catch(e => logUpdate(`checkForUpdates threw: ${e.message}`)), 10_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(e => logUpdate(`checkForUpdates threw: ${e.message}`)), 6 * 60 * 60 * 1000)
}

function checkForUpdates() {
  if (!autoUpdater) {
    dialog.showMessageBox({
      type:    'info',
      title:   'Check for Updates',
      message: `VaultTV Server v${app.getVersion()}`,
      detail:  'Auto-update is unavailable in this build.',
      buttons: ['OK'],
    })
    return
  }
  autoUpdater.checkForUpdates().catch(() => {
    updateState = 'error'
    updateMenu()
  })
}

function installUpdate() {
  autoUpdater?.quitAndInstall(false, true)
}

// ── Build context menu ────────────────────────────────────────────────────────
function updateMenu() {
  if (!tray) return

  const loginSettings = app.getLoginItemSettings()
  const atLogin = loginSettings.openAtLogin

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open VaultTV',
      bold:  true,
      click: () => shell.openExternal(serverUrl),
    },
    {
      label:   readTunnelUrl() ? `Remote: ${readTunnelUrl()}` : 'Remote Access: connecting…',
      enabled: !!readTunnelUrl(),
      click:   () => { const u = readTunnelUrl(); if (u) shell.openExternal(u) },
    },
    { type: 'separator' },
    {
      label:   'Start at Login',
      type:    'checkbox',
      checked: atLogin,
      click:   (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked })
      },
    },
    { type: 'separator' },
    {
      label:   'Update Libraries',
      enabled: !rescanRunning && !!serverProc,
      click:   () => {
        http.request(`${serverUrl}/internal/rescan`, { method: 'POST', timeout: 3000 }, () => {
          rescanRunning = true
          updateMenu()
          tray.displayBalloon({ title: 'VaultTV Server', content: 'Library update started…', iconType: 'info' })
        }).on('error', () => {}).end()
      },
    },
    {
      label:   'Cancel Library Update',
      enabled: rescanRunning,
      click:   () => {
        http.request(`${serverUrl}/internal/cancel-rescan`, { method: 'POST', timeout: 3000 }, () => {}).on('error', () => {}).end()
      },
    },
    { type: 'separator' },
    {
      label:   updateState === 'downloaded' ? `Restart to Install v${updateVersion}`
             : updateState === 'available'  ? `Downloading v${updateVersion}${updateProgressPct != null ? ` — ${Math.round(updateProgressPct)}%` : '…'}`
             : updateState === 'error'      ? 'Update failed — click for log'
             : 'Check for Updates',
      enabled: updateState !== 'checking',
      click:   updateState === 'downloaded' ? installUpdate : updateState === 'error' ? () => shell.openPath(UPDATE_LOG_FILE) : checkForUpdates,
    },
    {
      label: 'Server Settings',
      click: openSetupWindow,
    },
    {
      label: 'View Server Log',
      click: () => shell.openPath(SERVER_LOG_FILE),
    },
    {
      label: 'How To',
      click: () => shell.openExternal(`${serverUrl}/#/guide`),
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        stopServer()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(menu)
  tray.setToolTip(rescanRunning
    ? 'VaultTV Server  |  Updating library…'
    : `VaultTV Server  |  ${serverUrl}`
  )
}

// ── Setup / config window ─────────────────────────────────────────────────────
function openSetupWindow() {
  if (setupWin && !setupWin.isDestroyed()) { setupWin.focus(); return }

  setupWin = new BrowserWindow({
    width:  520,
    height: 560,
    title:  'VaultTV Server Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#0a0a12',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  setupWin.setMenuBarVisibility(false)

  // Build a simple HTML config page
  const cfg = (() => {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } catch { return {} }
  })()

  const html = buildSetupHtml(cfg)
  setupWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  setupWin.on('closed', () => { setupWin = null })
}

function buildSetupHtml(cfg) {
  const safeCfg = JSON.stringify(cfg)
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>VaultTV Server Settings</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0a0a12; color: #e2e2e8; padding: 24px; }
  h1 { font-size: 1.1rem; font-weight: 700; margin-bottom: 1.5rem;
       display: flex; align-items: center; gap: 8px; color: #fff; }
  h1 span { color: #7c3aed }
  label { display: block; font-size: 0.82rem; color: #9ca3af; margin-bottom: 4px; margin-top: 14px }
  input { width: 100%; padding: 8px 10px; border-radius: 6px;
          border: 1px solid #2d2d3a; background: #13131f; color: #e2e2e8;
          font-size: 0.9rem; outline: none; }
  input:focus { border-color: #7c3aed }
  small { display: block; font-size: 0.75rem; color: #6b7280; margin-top: 3px }
  .actions { margin-top: 24px; display: flex; gap: 10px }
  button { padding: 9px 20px; border-radius: 6px; border: none; cursor: pointer;
           font-size: 0.88rem; font-weight: 600 }
  .save { background: #7c3aed; color: #fff }
  .save:hover { background: #6d28d9 }
  .cancel { background: #1e1e2e; color: #9ca3af; border: 1px solid #2d2d3a }
  .status { margin-top: 12px; font-size: 0.82rem; color: #4ade80; min-height: 18px }
  .sep { border: none; border-top: 1px solid #2d2d3a; margin: 20px 0 }
</style></head><body>
<h1><span>●</span> VaultTV Server Settings</h1>

<label>Port</label>
<input id="port" type="number" min="1024" max="65535">
<small>Port the server listens on. Default: 8080. Requires restart.</small>

<label>TMDB API Key</label>
<input id="tmdbKey" type="text" placeholder="Your TMDB API key">
<small>Required for movie/TV metadata and poster images. Get one free at themoviedb.org.</small>

<label>Server Name</label>
<input id="serverName" type="text" placeholder="My VaultTV Server">

<hr class="sep">

<label>Supabase URL <small style="display:inline;color:#4a5568">(optional — enables remote access)</small></label>
<input id="supabaseUrl" type="url" placeholder="https://xxx.supabase.co">

<label>Supabase Anon Key</label>
<input id="supabaseAnonKey" type="text" placeholder="eyJhbGci...">
<small>Paste from your Supabase project → Settings → API.</small>

<hr class="sep">

<label>API Token <small style="display:inline;color:#4a5568">(paste into the desktop app's Settings → Companion Server)</small></label>
<input id="serverToken" type="text" readonly onclick="this.select()" style="font-family:monospace;font-size:0.8rem;opacity:0.85">
<small>The desktop app talks to this server cross-origin, so it can't rely on your browser login cookie — paste this token in once and it authenticates every request instead.</small>

<div class="actions">
  <button class="save" onclick="save()">Save & Restart</button>
  <button class="cancel" onclick="window.close()">Cancel</button>
</div>
<div class="status" id="status"></div>

<script>
const { ipcRenderer } = require('electron')
const cfg = ${safeCfg}
document.getElementById('port').value = cfg.port || 8080
document.getElementById('tmdbKey').value = cfg.tmdbKey || ''
document.getElementById('serverName').value = cfg.serverName || ''
document.getElementById('supabaseUrl').value = cfg.supabaseUrl || ''
document.getElementById('supabaseAnonKey').value = cfg.supabaseAnonKey || ''
document.getElementById('serverToken').value = cfg.serverToken || ''

function save() {
  const out = {
    port:            parseInt(document.getElementById('port').value) || 8080,
    tmdbKey:         document.getElementById('tmdbKey').value.trim(),
    serverName:      document.getElementById('serverName').value.trim(),
    supabaseUrl:     document.getElementById('supabaseUrl').value.trim(),
    supabaseAnonKey: document.getElementById('supabaseAnonKey').value.trim(),
  }
  ipcRenderer.send('save-config', out)
  document.getElementById('status').textContent = 'Saved — restarting server…'
  setTimeout(() => window.close(), 1500)
}
</script>
</body></html>`
}

// ── IPC: save config from setup window ───────────────────────────────────────
ipcMain.on('save-config', (_event, cfg) => {
  try {
    const existing = (() => { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } catch { return {} } })()
    const merged = { ...existing, ...cfg }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8')
    // Restart the server so the new config takes effect
    stopServer()
    port      = merged.port || 8080
    serverUrl = `http://localhost:${port}`
    setTimeout(startServer, 500)
  } catch (e) {
    console.error('[tray] Failed to save config:', e.message)
  }
})

// ── App ready ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Don't show in taskbar — tray only
  app.setAppUserModelId('app.vaulttv.server')
  if (app.dock) app.dock.hide()  // macOS

  tray = new Tray(buildIcon())
  updateMenu()

  tray.on('double-click', () => shell.openExternal(serverUrl))

  // Show balloon on startup
  tray.displayBalloon({
    title:    'VaultTV Server',
    content:  `Running at ${serverUrl}`,
    iconType: 'info',
  })

  // First-run: open settings if no config exists yet
  const isFirstRun = !fs.existsSync(CONFIG_FILE)

  startServer()
  // Tunnel startup lives in server/index.js now (runs inside the forked
  // server process, supports the stable named-tunnel mode via ~/.cloudflared/
  // config.yml). This used to ALSO spawn its own separate quick-tunnel here
  // in the main process — two independent cloudflared processes racing to
  // write config.json, with this dumber one (quick-tunnel only, no named-
  // tunnel awareness) usually winning and clobbering a good named-tunnel URL
  // with a throwaway random one. See readTunnelUrl() below for how the tray
  // menu now reflects whatever server/index.js actually set up.
  initAutoUpdater()

  if (isFirstRun) {
    setTimeout(openSetupWindow, 1000)
  }

  // Poll rescan status every 3 seconds
  setInterval(pollStatus, 3000)
})

// Prevent the app from quitting when all windows are closed
app.on('window-all-closed', (e) => e.preventDefault())

app.on('before-quit', () => { stopServer() })
