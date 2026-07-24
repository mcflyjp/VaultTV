/**
 * electron-builder config for VaultTV Media Server
 * Produces: VaultTV-Media-Server-Setup.exe
 *
 * Build: npm run server:build
 */

module.exports = {
  appId:       'app.vaulttv.server',
  productName: 'VaultTV Media Server',
  copyright:   'Copyright © 2025 VaultTV',

  electronDist: 'node_modules/electron/dist',
  asar: false,

  directories: {
    output:         'C:\\VaultTVBuild',
    buildResources: 'public',
  },

  // Entry point is the server tray app.
  // "name" MUST differ from electron-builder.config.cjs's — see its comment for why.
  extraMetadata: {
    name: 'vaulttv-media-server',
    main: 'server/tray.cjs',
  },

  files: [
    // Server code + its own node_modules
    'server/**/*',
    '!server/config.json',         // never bundle user config
    '!server/config.example.json', // not needed at runtime
    '!server/start.bat',
    '!server/start-and-build.bat',
    '!server/add-to-startup.bat',
    '!server/launch-tray.vbs',
    '!server/start-hidden.ps1',
    '!server/tray.ps1',            // replaced by tray.cjs
    // Built React app — the server serves this to browsers
    'dist/**/*',
    // Root package.json (Electron needs it)
    'package.json',
  ],

  extraResources: [
    { from: 'public/logo.png',     to: 'icon.png' },
    { from: 'public/logo.ico',     to: 'icon.ico' },
    { from: 'bin/cloudflared.exe', to: 'cloudflared.exe' },
  ],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'public/logo.ico',
  },

  nsis: {
    oneClick:                        false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut:           true,
    createStartMenuShortcut:         true,
    shortcutName:                    'VaultTV Media Server',
    installerIcon:                   'public/logo.ico',
    uninstallerIcon:                 'public/logo.ico',
  },

  mac: {
    target:   'dmg',
    category: 'public.app-category.entertainment',
  },

  linux: {
    target:   'AppImage',
    category: 'AudioVideo',
  },

  // Publish releases to GitHub. channel: 'media-server' is required — this repo
  // also hosts the main VaultTV app's releases via electron-builder.config.cjs,
  // and electron-updater's GitHub provider defaults to a file literally named
  // "latest.yml" for every app. Without distinct channels, building one app
  // overwrites the other's update-check file (this happened during development —
  // rebuilding the server after the main app silently broke the main app's
  // update-available data). This channel produces "media-server.yml" instead.
  publish: {
    provider: 'github',
    owner:    'mcflyjp',
    repo:     'VaultTV',
    channel:  'media-server',
  },
}
