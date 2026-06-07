/**
 * VaultTV Electron main process
 * Wraps the React app in a native desktop window.
 */

const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain } = require('electron')
const path  = require('path')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Enable platform HEVC decoder on Windows (uses Windows Media Foundation).
// Must be called before app 'ready' event.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')

// ── Single instance + deep-link (custom protocol) ────────────────────
// Register vaulttv:// as this app's URL scheme so the OS can redirect
// the Supabase Google OAuth callback back into this Electron window.
//
// On Windows, deep links arrive as a new process launch (argv[1] = the URL).
// requestSingleInstanceLock() ensures only one instance runs; the second
// instance (triggered by the OS for the deep link) quits immediately and
// hands its argv to the running instance via the second-instance event.
app.setAsDefaultProtocolClient('vaulttv')
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

let mainWindow = null
let tray       = null

// Windows deep-link: second-instance carries the vaulttv:// URL in argv
app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find(arg => arg.startsWith('vaulttv://'))
  if (deepLink) handleDeepLink(deepLink)
  // Bring the existing window to front
  if (mainWindow) { mainWindow.show(); mainWindow.focus() }
})

// macOS deep-link: open-url event
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

/**
 * Parse a vaulttv://auth/callback#... URL and forward the hash/query
 * params to the renderer so Supabase can hydrate the session.
 */
function handleDeepLink(url) {
  if (!url) return
  if (mainWindow) {
    mainWindow.webContents.send('auth-callback', url)
    mainWindow.show()
    mainWindow.focus()
  }
}

// ── Window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      // sandbox:false — Electron 20+ defaults sandbox:true which breaks
      // require('electron') in some preload contexts
      sandbox:     false,
      // webSecurity:false — allows file:// origin to fetch
      // http://127.0.0.1:7842 (companion server) without CORS/mixed-content block
      webSecurity: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false,  // show after ready-to-show to avoid flash
  })

  // Load the app
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

  // Prevent OAuth or any external link from opening INSIDE Electron —
  // send everything external to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Also intercept top-level navigations away from the app (e.g. OAuth redirects
  // that call window.location.href instead of opening a new tab).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith('file://') || url.includes('localhost') || url.includes('127.0.0.1')
    if (!isLocal) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Tray icon ─────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../public/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16 })
  tray = new Tray(icon)
  const menu = Menu.buildFromTemplate([
    { label: 'Open VaultTV', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: 'Quit',        click: () => app.quit() },
  ])
  tray.setToolTip('VaultTV')
  tray.setContextMenu(menu)
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
}

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createTray()

  // macOS: re-open window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Minimise to tray instead of quitting on window close (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep the tray icon alive; don't quit
    // app.quit()
  }
})

// ── IPC handlers ─────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.hide())  // hide to tray

// Open a URL in the system browser (called by renderer for OAuth)
ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url)
  }
})
