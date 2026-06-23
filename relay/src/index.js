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
      return json({ error: 'Not found' }, 404)
    } catch (e) {
      console.error('Relay error:', e)
      return json({ error: 'Internal error' }, 500)
    }
  },
}
