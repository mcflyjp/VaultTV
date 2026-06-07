/**
 * Preload script — runs in renderer context with access to Node APIs.
 * Exposes a safe, narrow bridge to the main process via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls (used by custom title bar)
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Platform info
  platform: process.platform,
  isElectron: true,
})
