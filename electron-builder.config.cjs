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
    'dist/**/*',            // built React app
    'electron/**/*.cjs',    // main + preload (CommonJS, avoids ESM conflict)
    'companion/**/*',       // companion server + its own node_modules (auto-started in Electron)
    '!companion/start.bat', // exclude Windows helper (not needed inside packaged app)
    'package.json',
  ],

  // "icon:" below only sets the .exe's embedded Windows icon at build time — it does
  // NOT copy the file for the app to read at runtime. main.cjs loads the window/tray
  // icon from process.resourcesPath at runtime (see extraResources), not from
  // "public/" inside the app folder (public/ was never in files[] above, so that
  // path silently failed and both the window icon and tray icon were blank/default).
  extraResources: [
    { from: 'public/icon.png', to: 'icon.png' },
    { from: 'public/logo.ico', to: 'icon.ico' },
  ],

  // Point Electron at the built React app.
  // "name" MUST differ from server-builder.config.cjs's — Electron reads package.json's
  // "name" field at native bootstrap (before any JS runs) to resolve the userData path.
  // Both builds previously inherited the same root "vaulttv" name, so they shared a
  // userData folder + singleton lock: whichever app was NOT already running would see
  // requestSingleInstanceLock() fail and quit silently with no window, no error.
  extraMetadata: {
    name: 'vaulttv-desktop',
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

  // Publish releases to GitHub — electron-updater checks here for updates
  publish: {
    provider: 'github',
    owner:    'mcflyjp',
    repo:     'VaultTV',
  },
}
