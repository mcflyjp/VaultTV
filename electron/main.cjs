/**
 * VaultTV Electron main process
 * Wraps the React app in a native desktop window.
 */

const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain } = require('electron')
const path  = require('path')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Enable platform HEVC decoder on Windows (uses Windows Media Foundation).
// This allows the app to play H.265/HEVC video natively without transcoding.
// Must be called before app 'ready' event.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')

let mainWindow = null
let tray       = null

// ── Window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    // frame: false is intentionally omitted on Windows — combining it with
    // titleBarStyle:'hidden' + titleBarOverlay causes mouse click events to
    // stop reaching web content (hover still works, clicks are silently dropped).
    // titleBarStyle:'hidden' alone hides the native title bar while keeping the
    // frame, allowing titleBarOverlay to render native min/max/close buttons.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color:       '#0a0a12',
      symbolColor: '#ffffff',
      height: 36,
    },
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      // Allow loading local companion server (http://127.0.0.1:7842)
      webSecurity: true,
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

  // Open external links in the system browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
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
    // Uncomment next line to quit on last window close instead:
    // app.quit()
  }
})

// ── IPC: window controls (sent from renderer via preload) ─────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.hide())  // hide to tray
