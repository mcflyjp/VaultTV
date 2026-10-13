/**
 * Dev utility: copy shared API keys out of a local Media Server config into .env
 *
 * The keys that ship with an installer live in .env, which the build reads via
 * make-defaults.cjs. On a machine that has already been using VaultTV those
 * same keys are usually sitting in the Media Server's own config.json, entered
 * through Settings long ago, so this saves hunting them down and retyping them.
 *
 * Only ever writes to .env, which is gitignored. Values are never printed: the
 * output reports which keys were found, not what they are, because build and
 * terminal logs get pasted into issues.
 *
 * Run: node scripts/seed-env-from-config.cjs
 */

const fs   = require('fs')
const os   = require('os')
const path = require('path')

const ROOT     = path.join(__dirname, '..')
const ENV_FILE = path.join(ROOT, '.env')

const CONFIG_CANDIDATES = [
  process.env.VAULTTV_CONFIG_DIR && path.join(process.env.VAULTTV_CONFIG_DIR, 'config.json'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'VaultTV', 'config.json'),
  path.join(os.homedir(), '.config', 'VaultTV', 'config.json'),
].filter(Boolean)

// config.json field -> .env variable. Only these move; nothing else in the
// config, such as the server token or JWT secret, is ever touched.
const MAP = {
  igdbClientId:     'IGDB_CLIENT_ID',
  igdbClientSecret: 'IGDB_CLIENT_SECRET',
  comicVineApiKey:  'COMICVINE_API_KEY',
  tmdbKey:          'VITE_TMDB_KEY',
}

const configPath = CONFIG_CANDIDATES.find(p => fs.existsSync(p))
if (!configPath) {
  console.error('No VaultTV config.json found. Looked in:\n  ' + CONFIG_CANDIDATES.join('\n  '))
  process.exit(1)
}

let config
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch (e) {
  console.error(`Could not read ${configPath}: ${e.message}`)
  process.exit(1)
}

let env = ''
try { env = fs.readFileSync(ENV_FILE, 'utf8') } catch { /* a new .env is fine */ }

const added = []
const kept  = []
const empty = []

for (const [field, varName] of Object.entries(MAP)) {
  const value = (config[field] || '').trim()
  if (!value) { empty.push(varName); continue }

  const line = new RegExp('^\\s*' + varName + '\\s*=.*$', 'm')
  const existing = env.match(line)
  // An existing non-empty value is left alone: .env is the source of truth for
  // what ships, and silently replacing it could swap a deliberately chosen key
  // for whatever this machine happened to have configured.
  if (existing && existing[0].split('=').slice(1).join('=').trim()) { kept.push(varName); continue }

  if (existing) env = env.replace(line, `${varName}=${value}`)
  else env = env.replace(/\s*$/, '\n') + `${varName}=${value}\n`
  added.push(varName)
}

fs.writeFileSync(ENV_FILE, env, 'utf8')

console.log(`Read ${configPath}`)
console.log(`  written to .env : ${added.length ? added.join(', ') : '(none)'}`)
console.log(`  already set     : ${kept.length ? kept.join(', ') : '(none)'}`)
console.log(`  not in config   : ${empty.length ? empty.join(', ') : '(none)'}`)
console.log('\nNext: npm run defaults   (regenerates server/defaults.json)')
