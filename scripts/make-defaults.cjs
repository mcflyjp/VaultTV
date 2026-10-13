/**
 * Build step: generate server/defaults.json
 *
 * Copies the shared API keys out of .env into a small file the Media Server
 * reads at runtime, so a fresh install works without the user registering
 * their own TMDB application. Without this the server's matcher returns null
 * for every file and a new library scans to zero matches with nothing on
 * screen explaining why.
 *
 * The keys deliberately live in .env, which is gitignored, and defaults.json is
 * gitignored too. Neither is ever committed: the value reaches users only
 * inside an installer built on a machine that already has the .env.
 *
 * Missing keys are not an error. A build without them produces a server that
 * behaves exactly as it did before, asking the user for their own key.
 */

const fs = require('fs')
const path = require('path')

const ROOT     = path.join(__dirname, '..')
const ENV_FILE = path.join(ROOT, '.env')
const OUT_FILE = path.join(ROOT, 'server', 'defaults.json')

// Only these are copied. Anything else in .env stays out of the shipped file,
// so adding a secret there later cannot leak into an installer by accident.
const COPY = {
  VITE_TMDB_KEY:      'tmdbKey',
  IGDB_CLIENT_ID:     'igdbClientId',
  IGDB_CLIENT_SECRET: 'igdbClientSecret',
  COMICVINE_API_KEY:  'comicVineApiKey',
}

function parseEnv(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

let env = {}
try {
  env = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'))
} catch {
  console.warn('[defaults] no .env found — building without bundled API keys')
}

const defaults = {}
for (const [envKey, outKey] of Object.entries(COPY)) {
  if (env[envKey]) defaults[outKey] = env[envKey]
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
fs.writeFileSync(OUT_FILE, JSON.stringify(defaults, null, 2) + '\n', 'utf8')

// Report presence, never the value, since build logs get pasted into issues.
const present = Object.keys(defaults)
console.log(`[defaults] wrote ${path.relative(ROOT, OUT_FILE)} with: ${present.length ? present.join(', ') : '(nothing)'}`)
