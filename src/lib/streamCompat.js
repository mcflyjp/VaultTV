/**
 * Stream compatibility detection for VaultTV
 *
 * Parses stream names/titles from Stremio addons to extract codec hints,
 * then scores each stream against the current platform's capabilities.
 *
 * Stream names from Torrentio look like:
 *   "1080p HEVC BluRay | AC3 5.1"
 *   "4K HDR x265 | EAC3 Atmos"
 *   "1080p x264 WEB-DL | AAC"
 */

import { SUPPORTED_VIDEO, SUPPORTED_AUDIO } from './platform'

// ── Codec keyword patterns ──────────────────────────────────────────────

const VIDEO_PATTERNS = [
  // HEVC / H.265
  { codec: 'hevc',  re: /\b(hevc|h\.?265|x265|265)\b/i },
  // H.264 / AVC
  { codec: 'h264',  re: /\b(h\.?264|x264|avc|264)\b/i },
  // VP9
  { codec: 'vp9',   re: /\bvp9\b/i },
  // AV1
  { codec: 'av1',   re: /\bav1\b/i },
]

const AUDIO_PATTERNS = [
  // Dolby TrueHD / Atmos (TrueHD is effectively AC3 family, unsupported)
  { codec: 'truehd', re: /\b(truehd|true[-\s]?hd|atmos)\b/i },
  // EAC3 / Dolby Digital Plus / DD+
  { codec: 'eac3',   re: /\b(eac[-\s]?3|dd\+|dolby\s*digital\s*plus|ddplus)\b/i },
  // AC3 / Dolby Digital / DD (must come after eac3 check)
  { codec: 'ac3',    re: /\b(ac[-\s]?3|dolby\s*digital(?!\s*plus)|\bdd\b|dolby\s*5\.1|dolby\s*7\.1)\b/i },
  // DTS variants
  { codec: 'dts',    re: /\b(dts[-\s]?(hd|ma|x|hdma)?)\b/i },
  // AAC
  { codec: 'aac',    re: /\baac\b/i },
  // MP3
  { codec: 'mp3',    re: /\bmp3\b/i },
]

/**
 * Parse a stream name/description for codec hints.
 * @param {object} stream  Stremio stream object { name, title, description, ... }
 * @returns {{ videoCodec: string|null, audioCodec: string|null }}
 */
export function parseStreamCodecs(stream) {
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename]
    .filter(Boolean).join(' ')

  let videoCodec = null
  for (const { codec, re } of VIDEO_PATTERNS) {
    if (re.test(text)) { videoCodec = codec; break }
  }

  let audioCodec = null
  for (const { codec, re } of AUDIO_PATTERNS) {
    if (re.test(text)) { audioCodec = codec; break }
  }

  return { videoCodec, audioCodec }
}

/**
 * Score a stream's compatibility with the current platform.
 *
 * Returns:
 *   'compatible'   — all detected codecs are supported (or none detected)
 *   'audio-issue'  — video OK, audio codec unsupported (AC3/DTS/EAC3)
 *   'video-issue'  — video codec unsupported (HEVC on browser/Android)
 *   'both-issues'  — both video and audio unsupported
 */
export function streamCompat(stream) {
  const { videoCodec, audioCodec } = parseStreamCodecs(stream)

  const videoOk = !videoCodec || SUPPORTED_VIDEO.has(videoCodec)
  const audioOk = !audioCodec || SUPPORTED_AUDIO.has(audioCodec)

  if (videoOk  && audioOk)  return 'compatible'
  if (videoOk  && !audioOk) return 'audio-issue'
  if (!videoOk && audioOk)  return 'video-issue'
  return 'both-issues'
}

/** Sort streams: compatible first, then audio-only issues, then video issues, then both */
const COMPAT_ORDER = { compatible: 0, 'audio-issue': 1, 'video-issue': 2, 'both-issues': 3 }

export function sortStreamsByCompat(streams) {
  return [...streams].sort((a, b) => {
    const ca = COMPAT_ORDER[streamCompat(a)] ?? 4
    const cb = COMPAT_ORDER[streamCompat(b)] ?? 4
    return ca - cb
  })
}

// ── Language detection ──────────────────────────────────────────────────

/** Country flag emoji → ISO 639-1 code */
const FLAG_TO_LANG = {
  '🇬🇧': 'en', '🇺🇸': 'en', '🇦🇺': 'en', '🇨🇦': 'en', '🇮🇪': 'en',
  '🇫🇷': 'fr', '🇩🇪': 'de', '🇦🇹': 'de', '🇨🇭': 'de',
  '🇪🇸': 'es', '🇲🇽': 'es', '🇦🇷': 'es', '🇨🇴': 'es', '🇨🇱': 'es',
  '🇮🇹': 'it', '🇵🇹': 'pt', '🇧🇷': 'pt',
  '🇯🇵': 'ja', '🇰🇷': 'ko', '🇨🇳': 'zh', '🇹🇼': 'zh',
  '🇷🇺': 'ru', '🇳🇱': 'nl', '🇧🇪': 'nl',
  '🇵🇱': 'pl', '🇸🇪': 'sv', '🇹🇷': 'tr',
  '🇮🇳': 'hi', '🇵🇰': 'hi',
  '🇸🇦': 'ar', '🇦🇪': 'ar', '🇪🇬': 'ar',
}

/** ISO 639-2/B (3-letter) → ISO 639-1 (2-letter) */
const ISO3_TO_CODE = {
  ENG: 'en', SPA: 'es', FRE: 'fr', GER: 'de', ITA: 'it',
  POR: 'pt', JPN: 'ja', KOR: 'ko', CHI: 'zh', RUS: 'ru',
  DUT: 'nl', POL: 'pl', SWE: 'sv', TUR: 'tr', HIN: 'hi', ARA: 'ar',
}

const ISO2_CODES = ['en','es','fr','de','it','pt','ja','ko','zh','ru','nl','pl','sv','tr','hi','ar']

const WORD_TO_CODE = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de',
  italian: 'it', portuguese: 'pt', japanese: 'ja', korean: 'ko',
  chinese: 'zh', russian: 'ru', dutch: 'nl', polish: 'pl',
  swedish: 'sv', turkish: 'tr', hindi: 'hi', arabic: 'ar',
}

/** Display label for a language code */
export const LANG_LABELS = {
  en: 'EN', es: 'ES', fr: 'FR', de: 'DE', it: 'IT',
  pt: 'PT', ja: 'JA', ko: 'KO', zh: 'ZH', ru: 'RU',
  nl: 'NL', pl: 'PL', sv: 'SV', tr: 'TR', hi: 'HI', ar: 'AR',
  MULTI: 'MULTI', DUAL: 'DUAL',
}

/**
 * Parse a Stremio stream object for language indicators.
 * Scans name, title, description, and behaviorHints.filename.
 *
 * Returns an array of lowercase ISO 639-1 codes e.g. ['en', 'fr'],
 * ['MULTI'] for multi-language streams, or [] if nothing detected.
 */
export function parseStreamLanguages(stream) {
  const text = [
    stream.name, stream.title, stream.description,
    stream.behaviorHints?.filename,
  ].filter(Boolean).join('\n')

  // Multi-language shortcut
  if (/\bmulti([-\s]?(audio|lang|language|ingual))?\b/i.test(text)) return ['MULTI']

  const found = new Set()

  // Flag emojis (most reliable signal)
  for (const [flag, code] of Object.entries(FLAG_TO_LANG)) {
    if (text.includes(flag)) found.add(code)
  }

  // 3-letter ISO codes at word boundaries
  for (const [iso3, code] of Object.entries(ISO3_TO_CODE)) {
    if (new RegExp(`\\b${iso3}\\b`, 'i').test(text)) found.add(code)
  }

  // 2-letter ISO codes — uppercase only to reduce false positives
  for (const code of ISO2_CODES) {
    if (new RegExp(`\\b${code.toUpperCase()}\\b`).test(text)) found.add(code)
  }

  // Full language words
  for (const [word, code] of Object.entries(WORD_TO_CODE)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) found.add(code)
  }

  // Dual audio — no specific lang detected
  if (found.size === 0 && /\bdual\b/i.test(text)) return ['DUAL']

  return [...found]
}

/** Human-readable compat label and colour for UI badges */
export function compatBadge(compat) {
  switch (compat) {
    case 'compatible':   return { label: '✓',       color: '#4ade80', title: 'Compatible with your device' }
    case 'audio-issue':  return { label: 'AC3/DTS',  color: '#fbbf24', title: 'Audio may need transcoding (AC3/DTS)' }
    case 'video-issue':  return { label: 'HEVC',     color: '#fb923c', title: 'Video codec may not play (HEVC/H.265)' }
    case 'both-issues':  return { label: '⚠ Compat', color: '#f87171', title: 'Audio and video codecs may be unsupported' }
    default:             return null
  }
}
