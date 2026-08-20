/**
 * VaultTV Electron main process
 */

const {
  app, BrowserWindow, shell,
  ipcMain, dialog, utilityProcess, globalShortcut,
} = require('electron')
const path  = require('path')
const fs    = require('fs')
const { spawn } = require('child_process')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Must be set before any userData-path-dependent call (requestSingleInstanceLock,
// getPath('userData'), etc). Without this, this app and the separate VaultTV Media
// Server tray app both inherit "vaulttv" from package.json's shared "name" field,
// collide on the same userData folder + singleton lock, and whichever one is NOT
// already running silently quits on launch with no window and no error.
app.setName('VaultTV')

// Auto-updater — only active in the packaged app (not dev builds)
let autoUpdater = null
if (!isDev) {
  try { autoUpdater = require('electron-updater').autoUpdater } catch {}
}

// Enable platform HEVC decoder on Windows (Windows Media Foundation).
// Must be called before app 'ready' event.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')

// Remove Chromium's autoplay restriction so video.play() works without
// requiring it to be called synchronously inside a user-gesture handler.
// Without this, any async work before play() (e.g. codec probing) causes
// play() to reject with NotAllowedError and the video never starts.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// ── Single instance + deep-link (custom protocol) ────────────────────
// vaulttv:// is registered so the OS can redirect the Supabase Google
// OAuth callback back into this window after the user approves in the
// system browser.  On Windows, a deep link triggers a second instance;
// requestSingleInstanceLock() quits that instance immediately and hands
// the URL to the already-running one via second-instance.
app.setAsDefaultProtocolClient('vaulttv')
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

let mainWindow      = null
let companionProc   = null   // UtilityProcess for the companion server

// Windows deep-link: second instance carries vaulttv:// URL in argv
app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find(a => a.startsWith('vaulttv://'))
  if (deepLink) handleDeepLink(deepLink)
  if (mainWindow) { mainWindow.show(); mainWindow.focus() }
})

// macOS deep-link
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

function handleDeepLink(url) {
  if (!url || !mainWindow) return
  mainWindow.webContents.send('auth-callback', url)
  mainWindow.show()
  mainWindow.focus()
}

// ── Companion server auto-start ────────────────────────────────────────
// Only runs in the packaged app (not dev — user starts companion manually
// during development).  Uses Electron's utilityProcess so it inherits the
// bundled Node.js runtime — no separate Node install required.
function startCompanion() {
  if (!app.isPackaged) return

  const companionScript = path.join(app.getAppPath(), 'companion', 'server.js')
  if (!fs.existsSync(companionScript)) {
    console.log('[companion] server.js not found in packaged app — skipping auto-start')
    return
  }

  try {
    companionProc = utilityProcess.fork(companionScript, [], {
      cwd: path.join(app.getAppPath(), 'companion'),
    })
    companionProc.on('exit', code => {
      console.log(`[companion] exited (code ${code})`)
      companionProc = null
    })
    console.log('[companion] Auto-started successfully')
  } catch (e) {
    console.error('[companion] Failed to auto-start:', e.message)
  }
}

app.on('quit', () => {
  try { companionProc?.kill() } catch {}
})

// ── Icon resolution ───────────────────────────────────────────────────
// In dev, "public/" is right there in the source tree. In the packaged app it's
// NOT bundled inside resources/app (only dist/, electron/, companion/ are — see
// electron-builder.config.cjs's files[]) — instead it's copied to resources/icon.png
// via extraResources, so it must be read from process.resourcesPath, not __dirname.
function iconPath(name) {
  return isDev
    ? path.join(__dirname, '..', 'public', name)
    : path.join(process.resourcesPath, name)
}

// ── Window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1400,
    height:   900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      // sandbox:false — Electron 20+ enables sandbox by default which can
      // break require('electron') in some preload contexts.
      sandbox:     false,
      // webSecurity:false — allows file:// origin to fetch
      // http://127.0.0.1:7842 (companion) without Chromium blocking it as
      // mixed content, and lets Stremio add-on fetches bypass CORS.
      webSecurity: false,
    },
    icon: iconPath('icon.png'),
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // Route external HTTPS links to system browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Intercept top-level navigations (e.g. OAuth redirect via window.location.href)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith('file://') || url.includes('localhost') || url.includes('127.0.0.1')
    if (!isLocal) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Auto-updater ─────────────────────────────────────────────────────
// Logged to a plain-text file (not just console, which nobody sees in a
// packaged app) so a stuck/looping update can actually be diagnosed —
// this was previously silent, which is exactly what made the "downloading
// forever, never installs" bug impossible to tell apart from "no update yet".
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
    // (extraMetadata.name = 'vaulttv-desktop'), NOT app.getName() — which
    // here returns the app.setName() override ('VaultTV') instead.
    const pkgName = require(path.join(__dirname, '..', 'package.json')).name
    const cacheDir = path.join(app.getPath('appData'), '..', 'Local', `${pkgName}-updater`)
    const pendingInfo = path.join(cacheDir, 'pending', 'update-info.json')
    if (!fs.existsSync(pendingInfo)) return
    const info = JSON.parse(fs.readFileSync(pendingInfo, 'utf8'))
    const pendingVersion = info?.version
    if (!pendingVersion) return
    const current = app.getVersion()
    // Simple numeric compare is fine here — versions are always x.y.z
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

  autoUpdater.autoDownload    = true   // download silently in background
  autoUpdater.autoInstallOnAppQuit = true  // install when user quits normally

  autoUpdater.on('checking-for-update', () => logUpdate('checking for update'))

  autoUpdater.on('update-not-available', info => logUpdate(`no update available (current ${info?.version || '?'})`))

  autoUpdater.on('update-available', info => {
    logUpdate(`update available: v${info.version}`)
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    })
  })

  autoUpdater.on('download-progress', p => {
    logUpdate(`downloading: ${p.percent.toFixed(1)}% (${(p.transferred / 1e6).toFixed(1)}MB / ${(p.total / 1e6).toFixed(1)}MB)`)
    mainWindow?.webContents.send('update-progress', { percent: p.percent })
  })

  autoUpdater.on('update-downloaded', info => {
    logUpdate(`download complete: v${info.version} — will install on quit`)
    mainWindow?.webContents.send('update-downloaded', { version: info.version })
  })

  autoUpdater.on('error', err => {
    logUpdate(`ERROR: ${err?.message}\n${err?.stack || ''}`)
    mainWindow?.webContents.send('update-error', { message: err?.message || 'Unknown update error' })
  })

  // Check on startup (5s delay so main window is visible first)
  setTimeout(() => autoUpdater.checkForUpdates().catch(e => logUpdate(`checkForUpdates threw: ${e.message}`)), 5000)
}

// IPC: renderer can trigger install-and-relaunch
ipcMain.on('update-install', () => {
  autoUpdater?.quitAndInstall(false, true)
})

// IPC: open the update log file so it can actually be inspected when something's stuck
ipcMain.on('open-update-log', () => {
  shell.openPath(UPDATE_LOG_FILE).catch(() => {})
})

// ── App lifecycle ────────────────────────────────────────────────────
app.whenReady().then(() => {
  startCompanion()
  createWindow()
  initAutoUpdater()

  // F11 — toggle app fullscreen
  globalShortcut.register('F11', () => {
    if (!mainWindow) return
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    mainWindow.webContents.send('fullscreen-changed', next)
  })

  // ESC exits fullscreen (standard UX expectation)
  globalShortcut.register('Escape', () => {
    if (mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false)
      mainWindow.webContents.send('fullscreen-changed', false)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Closing the window fully quits the app — there is no tray icon to keep it
// alive in the background (unlike VaultTV Media Server, which is meant to run
// headless). Previously this was empty (window hidden, process stayed resident
// with a tray icon), which meant closing the window didn't actually exit —
// users had to force-quit via Task Manager to fully stop VaultTV.
app.on('window-all-closed', () => app.quit())

// ── IPC: window controls ─────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())

// Open a URL in the system default browser (called by renderer for OAuth
// and for Settings external links)
ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url)
  }
})

// ── IPC: fullscreen ──────────────────────────────────────────────────
ipcMain.on('toggle-fullscreen', () => {
  if (!mainWindow) return
  const next = !mainWindow.isFullScreen()
  mainWindow.setFullScreen(next)
  mainWindow.webContents.send('fullscreen-changed', next)
})

ipcMain.handle('is-fullscreen', () => mainWindow?.isFullScreen() ?? false)

// Also fire the event on native fullscreen change (e.g. Windows key+↑)
// so the React UI stays in sync with the actual window state.
app.on('browser-window-created', (_e, win) => {
  win.on('enter-full-screen', () => win.webContents.send('fullscreen-changed', true))
  win.on('leave-full-screen',  () => win.webContents.send('fullscreen-changed', false))
})

// ── IPC: native folder picker ────────────────────────────────────────
// Used by LocalLibraryContext in Electron instead of File System Access API.
// Returns { path: string, name: string } or null if user cancelled.
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Media Folder',
    buttonLabel: 'Add Folder',
  })
  if (canceled || !filePaths.length) return null
  return { path: filePaths[0], name: path.basename(filePaths[0]) }
})

// ── Local RetroArch (this machine) ───────────────────────────────────
// The Media Server's RetroArch config (server/index.js) always launches
// RetroArch ON WHICHEVER MACHINE RUNS THE MEDIA SERVER — fine when the
// desktop app and Media Server are the same PC, but wrong on a second
// computer on the network, which has (or wants) its own local RetroArch
// install. This mirrors that same folder/detect/launch shape, but scoped
// to this machine and stored in this app's own userData, independent of
// whatever the Media Server has configured.
const LOCAL_RETROARCH_FILE = path.join(app.getPath('userData'), 'retroarch-local.json')

function readLocalRetroarchPath() {
  try { return JSON.parse(fs.readFileSync(LOCAL_RETROARCH_FILE, 'utf8')).path || '' } catch { return '' }
}
function writeLocalRetroarchPath(p) {
  fs.writeFileSync(LOCAL_RETROARCH_FILE, JSON.stringify({ path: p }))
}

// Duplicated from server/index.js's ROM_PLATFORMS/RETROARCH_COMMON_PATHS —
// same pattern already used for the Android bridge's platform map (no
// shared module between the two separate app builds).
const LOCAL_ROM_CORES = {
  '.nes':  'nestopia_libretro.dll',
  '.sfc':  'snes9x_libretro.dll',
  '.smc':  'snes9x_libretro.dll',
  '.n64':  'mupen64plus_next_libretro.dll',
  '.z64':  'mupen64plus_next_libretro.dll',
  '.v64':  'mupen64plus_next_libretro.dll',
  '.gb':   'gambatte_libretro.dll',
  '.gbc':  'gambatte_libretro.dll',
  '.gba':  'mgba_libretro.dll',
  '.md':   'genesis_plus_gx_libretro.dll',
  '.gen':  'genesis_plus_gx_libretro.dll',
  '.smd':  'genesis_plus_gx_libretro.dll',
  '.bin':  'genesis_plus_gx_libretro.dll',
  '.cue':  'pcsx_rearmed_libretro.dll',
  '.chd':  'pcsx_rearmed_libretro.dll',
  '.pbp':  'pcsx_rearmed_libretro.dll',
  '.a26':  'stella_libretro.dll',
}

const LOCAL_RETROARCH_COMMON_PATHS = [
  'C:\\RetroArch-Win64\\retroarch.exe',
  'C:\\RetroArch\\retroarch.exe',
  'C:\\Program Files\\RetroArch-Win64\\retroarch.exe',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\RetroArch\\retroarch.exe',
  'D:\\Program Files (x86)\\Steam\\steamapps\\common\\RetroArch\\retroarch.exe',
  'D:\\SteamLibrary\\steamapps\\common\\RetroArch\\retroarch.exe',
]

ipcMain.handle('get-local-retroarch', () => {
  const p = readLocalRetroarchPath()
  return { path: p, exists: p ? fs.existsSync(p) : false }
})

ipcMain.handle('set-local-retroarch', (_event, retroarchPath) => {
  writeLocalRetroarchPath(retroarchPath)
  return { ok: true }
})

ipcMain.handle('detect-local-retroarch', () => {
  const found = LOCAL_RETROARCH_COMMON_PATHS.find(p => fs.existsSync(p))
  return { found: found || null }
})

ipcMain.handle('launch-local-rom', (_event, { romPath, ext }) => {
  const retroarchPath = readLocalRetroarchPath()
  if (!retroarchPath) return { error: 'No local RetroArch path configured on this device' }
  if (!fs.existsSync(retroarchPath)) return { error: 'Configured local RetroArch executable not found' }
  if (!fs.existsSync(romPath)) return { error: `ROM file not found at ${romPath} — if it's on a network share, make sure this device has that same drive/path mapped` }
  const core = LOCAL_ROM_CORES[ext.toLowerCase()]
  if (!core) return { error: `Unsupported ROM extension: ${ext}` }
  const coreDir = path.join(path.dirname(retroarchPath), 'cores')
  const corePath = path.join(coreDir, core)
  if (!fs.existsSync(corePath)) return { error: `Core not found: ${core} (expected in ${coreDir}). Install it via RetroArch's Core Downloader.` }
  try {
    const child = spawn(retroarchPath, ['-L', corePath, romPath], { detached: true, stdio: 'ignore' })
    child.unref()
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
})
