/**
 * Game platform definitions
 *
 * The single source of truth for what a ROM is: which console it belongs to,
 * which file extensions it uses, and which libretro core plays it.
 *
 * Platform is resolved from the FOLDER a file sits in, falling back to its
 * extension. Extension alone cannot work: .iso is GameCube, PS2, Saturn and PSP
 * alike, and .bin is both Genesis and PlayStation. Folder names are reliable
 * because everyone organises ROMs by console, and the same convention is what
 * ES-DE, EmulationStation and RetroArch's own playlists key off.
 *
 * `aliases` therefore matter as much as the extensions: they are the folder
 * names real libraries use, including the long No-Intro style spellings such as
 * "Sega Mega Drive - Genesis".
 *
 * `core` null means VaultTV can catalogue the platform but RetroArch cannot
 * play it; `emulator` then names what does, so the UI can say so rather than
 * failing at launch.
 */

const PLATFORMS = [
  { id: 'nes', name: 'NES', core: 'nestopia_libretro.dll',
    exts: ['.nes', '.unf', '.fds'],
    aliases: ['nes', 'famicom', 'nintendo entertainment system', 'nintendo nintendo entertainment system'] },

  { id: 'snes', name: 'SNES', core: 'snes9x_libretro.dll',
    exts: ['.sfc', '.smc', '.swc', '.fig'],
    aliases: ['snes', 'super nintendo', 'super famicom', 'nintendo super nintendo entertainment system'] },

  { id: 'n64', name: 'N64', core: 'mupen64plus_next_libretro.dll',
    exts: ['.n64', '.z64', '.v64'],
    aliases: ['n64', 'nintendo 64', 'nintendo nintendo 64'] },

  { id: 'gb', name: 'Game Boy', core: 'gambatte_libretro.dll',
    exts: ['.gb'],
    aliases: ['gb', 'game boy', 'gameboy', 'nintendo game boy'] },

  { id: 'gbc', name: 'Game Boy Color', core: 'gambatte_libretro.dll',
    exts: ['.gbc'],
    aliases: ['gbc', 'game boy color', 'gameboy color', 'nintendo game boy color'] },

  { id: 'gba', name: 'Game Boy Advance', core: 'mgba_libretro.dll',
    exts: ['.gba'],
    aliases: ['gba', 'game boy advance', 'gameboy advance', 'nintendo game boy advance'] },

  { id: 'nds', name: 'Nintendo DS', core: 'melonds_libretro.dll',
    exts: ['.nds', '.dsi'],
    aliases: ['ds', 'nds', 'nintendo ds', 'nintendo nintendo ds'] },

  { id: '3ds', name: 'Nintendo 3DS', core: 'citra_libretro.dll',
    exts: ['.3ds', '.cci', '.cxi', '.3dsx'],
    aliases: ['3ds', 'nintendo 3ds', 'nintendo nintendo 3ds'] },

  { id: 'gc', name: 'GameCube', core: 'dolphin_libretro.dll',
    exts: ['.gcm', '.rvz', '.gcz', '.ciso'],
    aliases: ['gamecube', 'gc', 'ngc', 'nintendo gamecube'] },

  { id: 'wii', name: 'Wii', core: 'dolphin_libretro.dll',
    exts: ['.wbfs', '.wad'],
    aliases: ['wii', 'nintendo wii'] },

  { id: 'genesis', name: 'Genesis', core: 'genesis_plus_gx_libretro.dll',
    exts: ['.md', '.gen', '.smd'],
    aliases: ['genesis', 'megadrive', 'mega drive', 'sega genesis', 'sega mega drive', 'sega mega drive genesis'] },

  { id: 'saturn', name: 'Sega Saturn', core: 'mednafen_saturn_libretro.dll',
    exts: [],
    aliases: ['saturn', 'sega saturn'] },

  { id: 'dreamcast', name: 'Dreamcast', core: 'flycast_libretro.dll',
    exts: ['.gdi', '.cdi'],
    aliases: ['dreamcast', 'sega dreamcast'] },

  { id: 'ps1', name: 'PlayStation', core: 'pcsx_rearmed_libretro.dll',
    exts: ['.pbp'],
    aliases: ['ps1', 'psx', 'playstation', 'sony playstation'] },

  { id: 'ps2', name: 'PlayStation 2', core: 'pcsx2_libretro.dll',
    exts: [],
    aliases: ['ps2', 'playstation 2', 'sony playstation 2'] },

  { id: 'psp', name: 'PSP', core: 'ppsspp_libretro.dll',
    exts: ['.cso'],
    aliases: ['psp', 'playstation portable', 'sony playstation portable'] },

  { id: 'ps3', name: 'PlayStation 3', core: null, emulator: 'RPCS3',
    exts: ['.pkg'],
    aliases: ['ps3', 'playstation 3', 'sony playstation 3'] },

  { id: 'xbox360', name: 'Xbox 360', core: null, emulator: 'Xenia',
    exts: ['.xex'],
    aliases: ['xbox360', 'xbox 360', 'microsoft xbox 360'] },

  { id: 'atari2600', name: 'Atari 2600', core: 'stella_libretro.dll',
    exts: ['.a26'],
    aliases: ['atari2600', 'atari 2600'] },
]

// Extensions that are a disc or archive image and so say nothing about the
// console on their own. A file with one of these is only catalogued when its
// folder identifies the platform, which is what keeps a PC game ISO or an
// emulator's own files out of the library.
const AMBIGUOUS_EXTS = new Set(['.iso', '.bin', '.cue', '.chd', '.img', '.zip', '.7z'])

const byExt = new Map()
for (const p of PLATFORMS) for (const e of p.exts) if (!byExt.has(e)) byExt.set(e, p)

const byAlias = new Map()
for (const p of PLATFORMS) for (const a of p.aliases) byAlias.set(a, p)

/** Normalise a folder name for alias matching: case, separators, punctuation. */
function normalizeFolder(name) {
  return String(name).toLowerCase()
    .replace(/[_+-]+/g, ' ')
    .replace(/[()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The platform a folder name denotes, or null if it names no console. */
function platformFromFolder(name) {
  return byAlias.get(normalizeFolder(name)) || null
}

/** The platform an extension implies, or null when it is ambiguous/unknown. */
function platformFromExt(ext) {
  return byExt.get(String(ext).toLowerCase()) || null
}

function isAmbiguousExt(ext) {
  return AMBIGUOUS_EXTS.has(String(ext).toLowerCase())
}

/** Every extension worth considering a game, ambiguous ones included. */
function isGameExt(ext) {
  const e = String(ext).toLowerCase()
  return byExt.has(e) || AMBIGUOUS_EXTS.has(e)
}

module.exports = {
  PLATFORMS, platformFromFolder, platformFromExt, isAmbiguousExt, isGameExt, normalizeFolder,
}
