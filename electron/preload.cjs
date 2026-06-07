/**
 * VaultTV preload — runs in renderer context with Node API access.
 * Exposes a safe, narrow bridge to the main process via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Platform info
  platform:   process.platform,
  isElectron: true,

  // Open a URL in the system default browser (not Electron)
  // Used for OAuth flows and external Settings links.
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // OAuth deep-link callback — fires when vaulttv:// is invoked by the OS
  onAuthCallback: (cb) => ipcRenderer.on('auth-callback', (_event, url) => cb(url)),

  // Native folder picker — returns { path, name } or null if user cancelled.
  // Used by LocalLibraryContext instead of File System Access API in Electron.
  selectFolder: () => ipcRenderer.invoke('select-folder'),
})
