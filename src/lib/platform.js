/**
 * Platform detection for VaultTV
 * Determines whether we're running in a browser, Electron desktop app,
 * or Android WebView — each has different codec support.
 */

export const IS_ELECTRON = !!window.electronAPI?.isElectron
export const IS_ANDROID  = /android/i.test(navigator.userAgent)
export const IS_BROWSER  = !IS_ELECTRON && !IS_ANDROID

/**
 * Returns a human-readable platform label.
 */
export function platformLabel() {
  if (IS_ELECTRON) return 'Desktop App'
  if (IS_ANDROID)  return 'Android'
  return 'Browser'
}

/**
 * Video codecs supported on each platform.
 * Electron: HEVC/H.265 supported via Windows platform codec
 *           (requires PlatformHEVCDecoderSupport flag in main.cjs)
 * Browser/Android: H.264, VP8, VP9, AV1 only
 */
export const SUPPORTED_VIDEO = IS_ELECTRON
  ? new Set(['h264', 'avc', 'x264', 'vp8', 'vp9', 'av1', 'hevc', 'h265', 'x265'])
  : new Set(['h264', 'avc', 'x264', 'vp8', 'vp9', 'av1'])

/**
 * Audio codecs supported on all platforms.
 * AC3/EAC3/DTS are NOT supported anywhere in Chromium without transcoding.
 */
export const SUPPORTED_AUDIO = new Set(['aac', 'mp3', 'mp4a', 'opus', 'vorbis', 'flac', 'pcm'])
