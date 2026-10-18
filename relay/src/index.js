/**
 * VaultTV Relay Worker
 * Maps server tokens -> tunnel URLs so remote clients can find the media server.
 * Uses Cache API for storage — no KV binding needed.
 *
 * Routes:
 *   POST /api/register   { tunnelUrl, version }   Bearer: serverToken  -> 200
 *   POST /api/heartbeat                            Bearer: serverToken  -> 200
 *   POST /api/link       { serverToken }           Bearer: clientToken  -> 200
 *   POST /api/connect                              Bearer: clientToken  -> 200
 *   GET  /api/status                                                    -> 200
 *   GET  /api/keep-warm   manual trigger for the Supabase keep-warm cron
 */

const CACHE_TTL = 300
const CACHE_BASE = 'https://vaulttv-relay-cache.internal'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
}

async function cacheSet(key, value) {
  const cache = caches.default
  const url = `${CACHE_BASE}/${encodeURIComponent(key)}`
  const res = new Response(JSON.stringify(value), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    },
  })
  await cache.put(url, res)
}

async function cacheGet(key) {
  const cache = caches.default
  const url = `${CACHE_BASE}/${encodeURIComponent(key)}`
  const res = await cache.match(url)
  if (!res) return null
  try { return await res.json() } catch { return null }
}

async function handleRegister(request) {
  const serverToken = bearerToken(request)
  if (!serverToken) return json({ error: 'Missing Authorization header' }, 401)
  const { tunnelUrl, version } = await request.json().catch(() => ({}))
  if (!tunnelUrl || !tunnelUrl.startsWith('https://')) {
    return json({ error: 'tunnelUrl must be a full https URL' }, 400)
  }
  await cacheSet(`server:${serverToken}`, { tunnelUrl, version: version || '1.0.0', registeredAt: Date.now() })
  return json({ ok: true, tunnelUrl })
}

async function handleHeartbeat(request) {
  const serverToken = bearerToken(request)
  if (!serverToken) return json({ error: 'Missing Authorization header' }, 401)
  const existing = await cacheGet(`server:${serverToken}`)
  if (!existing) return json({ error: 'Not registered' }, 404)
  await cacheSet(`server:${serverToken}`, { ...existing, lastHeartbeat: Date.now() })
  return json({ ok: true })
}

async function handleLink(request) {
  const clientToken = bearerToken(request)
  if (!clientToken) return json({ error: 'Missing Authorization header' }, 401)
  const { serverToken } = await request.json().catch(() => ({}))
  if (!serverToken) return json({ error: 'serverToken required' }, 400)
  const server = await cacheGet(`server:${serverToken}`)
  if (!server) return json({ error: 'Server not found or offline' }, 404)
  await cacheSet(`client:${clientToken}`, { serverToken, linkedAt: Date.now() })
  return json({ ok: true, tunnelUrl: server.tunnelUrl })
}

async function handleConnect(request) {
  const clientToken = bearerToken(request)
  if (!clientToken) return json({ error: 'Missing Authorization header' }, 401)
  const link = await cacheGet(`client:${clientToken}`)
  if (!link) return json({ error: 'Not linked' }, 404)
  const server = await cacheGet(`server:${link.serverToken}`)
  if (!server) return json({ error: 'Server offline' }, 404)
  return json({ ok: true, tunnelUrl: server.tunnelUrl })
}

// ── Supabase keep-warm ────────────────────────────────────────────────────────
// A free Supabase project pauses after about a week without activity, and a
// paused project's subdomain stops resolving at all: DNS returns NXDOMAIN, so
// clients fail with "check if there is a typo in <host>" rather than anything
// pointing at the real cause. Establishing that the project still existed took
// queries against three separate resolvers.
//
// That matters more here than it would for a single install. Every VaultTV user
// signs in against this one project, since its credentials ship inside the
// installer, so a pause takes sign-in down for everyone at once and nothing in
// the app can explain why.
//
// One cheap request counts as activity. The auth health endpoint needs no
// table and returns a few bytes.
const DEFAULT_SUPABASE_URL = 'https://hbxxdachzhmowlcrbacb.supabase.co'

async function keepSupabaseWarm(env) {
  const base = (env && env.SUPABASE_URL) || DEFAULT_SUPABASE_URL
  // The publishable key is sent when configured. Supabase answers this endpoint
  // without one, but sending it makes the request look like ordinary traffic
  // rather than something a future rate limiter might treat differently.
  const headers = env && env.SUPABASE_ANON_KEY ? { apikey: env.SUPABASE_ANON_KEY } : {}
  try {
    const res = await fetch(`${base}/auth/v1/health`, { headers })
    // 401 counts as alive. Without a key Supabase answers "no API key found",
    // which is the project replying, and replying is the entire point: the
    // request is what resets the inactivity clock. Treating it as a failure
    // would have reported the project down while it was perfectly healthy.
    const alive = res.ok || res.status === 401
    // Logged either way. A failure here is the earliest warning that sign-in
    // is about to break for every user, and this log is the only place it
    // would otherwise appear.
    console.log(`[keep-warm] ${base} -> ${res.status} (${alive ? 'alive' : 'DOWN'})`)
    return alive
  } catch (e) {
    console.error(`[keep-warm] ${base} unreachable: ${e.message}`)
    return false
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
    try {
      if (request.method === 'POST' && url.pathname === '/api/register')  return handleRegister(request)
      if (request.method === 'POST' && url.pathname === '/api/heartbeat') return handleHeartbeat(request)
      if (request.method === 'POST' && url.pathname === '/api/link')      return handleLink(request)
      if (request.method === 'POST' && url.pathname === '/api/connect')   return handleConnect(request)
      if (request.method === 'GET'  && url.pathname === '/api/status')    return json({ ok: true, service: 'vaulttv-relay' })
      // Same work the cron does, callable by hand. A cron that only runs
      // weekly is otherwise impossible to verify without waiting a week.
      if (request.method === 'GET'  && url.pathname === '/api/keep-warm') {
        const ok = await keepSupabaseWarm(env)
        return json({ ok, checked: 'supabase' }, ok ? 200 : 503)
      }
      return json({ error: 'Not found' }, 404)
    } catch (e) {
      console.error('Relay error:', e)
      return json({ error: 'Internal error' }, 500)
    }
  },

  // Cron, configured in wrangler.toml. Its only job is to keep the Supabase
  // project from pausing; see keepSupabaseWarm above for why that matters to
  // every user rather than just one.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(keepSupabaseWarm(env))
  },
}
