/**
 * electron-builder configuration
 * Produces installers for Windows (.exe), macOS (.dmg), Linux (.AppImage)
 */

module.exports = {
  appId:       'app.vaulttv.desktop',
  productName: 'VaultTV',
  copyright:   'Copyright © 2025 VaultTV',

  // Use the already-installed Electron from node_modules — avoids re-downloading.
  electronDist: 'node_modules/electron/dist',

  // Package app as loose files instead of .asar archive.
  // Avoids the Windows Defender EBUSY lock on .asar files during build.
  asar: false,

  directories: {
    output: 'C:\\VaultTVBuild',
    buildResources: 'public',
  },

  files: [
    'dist/**/*',          // built React app
    'electron/**/*.cjs',  // main + preload (CommonJS, avoids ESM conflict)
    'package.json',
  ],

  // Point Electron at the built React app
  extraMetadata: {
    main: 'electron/main.cjs',
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
