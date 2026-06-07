/**
 * electron-builder configuration
 * Produces installers for Windows (.exe), macOS (.dmg), Linux (.AppImage)
 */

module.exports = {
  appId:       'app.vaulttv.desktop',
  productName: 'VaultTV',
  copyright:   'Copyright © 2025 VaultTV',

  // Use the already-installed Electron from node_modules — avoids re-downloading
  // and sidesteps the Windows Defender EBUSY lock on freshly-extracted .asar files.
  electronDist: 'node_modules/electron/dist',

  directories: {
    output: 'dist-electron',
    buildResources: 'public',
  },

  files: [
    'dist/**/*',         // built React app
    'electron/**/*',     // main + preload
    'package.json',
  ],

  // Point Electron at the built React app
  extraMetadata: {
    main: 'electron/main.js',
  },

  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
    icon: 'public/icon.png',
  },

  nsis: {
    oneClick:          false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'VaultTV',
  },

  mac: {
    target: 'dmg',
    icon:   'public/icon.png',
    category: 'public.app-category.entertainment',
  },

  linux: {
    target: 'AppImage',
    icon:   'public/icon.png',
    category: 'AudioVideo',
  },
}
