/**
 * VaultTV Relay Worker
 *
 * KV schema:
 *   server:{serverToken}  → { tunnelUrl, version, lastSeen }   (7-day TTL, refreshed by heartbeat)
 *   user:{userId}         → serverToken                        (1-year TTL)
 *
 * Endpoints:
 *   POST /api/register   — companion registers its tunnel URL (Bearer serverToken)
 *   POST /api/heartbeat  — companion keeps registration alive  (Bearer serverToken)
 *   POST /api/link       — server admin links a Supabase user to this serverToken
 *   POST /api/connect    — app sends Supabase JWT, gets back { serverUrl, stale }
 *   GET  /api/status     — health check (public)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() })
    }

    try {
      if (request.method === 'POST' && url.pathname === '/api/register') {
        return handleRegister(request, env)
      }
      if (request.method === 'POST' && url.pathname === '/api/heartbeat') {
        return handleHeartbeat(request, env)
      }
      if (request.method === 'POST' && url.pathname === '/api/link') {
        return handleLink(request, env)
      }
      if (request.method === 'POST' && url.pathname === '/api/connect') {
        return handleConnect(request, env)
      }
      if (request.method === 'GET' && url.pathname === '/api/status') {
        return json({ ok: true, service: 'vaulttv-relay' })
      }
      return json({ error: 'Not found' }, 404)
    } catch (e) {
      console.error('Relay error:', e)
      return json({ error: 'Internal error' }, 500)
    }
  }
}

// ── Companion: register tunnel URL ────────────────────────────────────────────
async function handleRegister(request, env) {
  const serverToken = bearerToken(request)
  if (!serverToken) return json({ error: 'Missing Authorization header' }, 401)

  const { tunnelUrl, version } = await request.json().catch(() => ({}))
  if (!tunnelUrl || !tunnelUrl.startsWith('https://')) {
    return json({ error: 'tunnelUrl must be a full https URL' }, 400)
  }

  await env.KV.put(
    `server:${serverToken}`,
    JSON.stringify({ tunnelUrl, version: version || '?', lastSeen: Date.now() }),
    { expirationTtl: 86400 * 7 }
  )
  console.log(`[register] serverToken=...${serverToken.slice(-8)} → ${tunnelUrl}`)
  return json({ ok: true })
}

// ── Companion: heartbeat ──────────────────────────────────────────────────────
async function handleHeartbeat(request, env) {
  const serverToken = bearerToken(request)
  if (!serverToken) return json({ error: 'Missing Authorization header' }, 401)

  const raw = await env.KV.get(`server:${serverToken}`)
  if (!raw) return json({ error: 'Not registered — call /api/register first' }, 404)

  const data = JSON.parse(raw)
  await env.KV.put(
    `server:${serverToken}`,
    JSON.stringify({ ...data, lastSeen: Date.now() }),
    { expirationTtl: 86400 * 7 }
  )
  return json({ ok: true })
}

// ── Server admin: link a Supabase account to this server ─────────────────────
// Called once from the server admin page.
// The user's Supabase token is sent as Bearer; body contains { serverToken }.
// The server must already be registered in KV before this call.
async function handleLink(request, env) {
  const supabaseToken = bearerToken(request)
  if (!supabaseToken) return json({ error: 'Missing Authorization header (Supabase token)' }, 401)

  const { serverToken } = await request.json().catch(() => ({}))
  if (!serverToken) return json({ error: 'serverToken required in request body' }, 400)

  // Verify Supabase token and get userId
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${supabaseToken}`, apikey: env.SUPABASE_ANON_KEY },
  })
  if (!userRes.ok) return json({ error: 'Invalid or expired Supabase token' }, 401)
  const { id: userId } = await userRes.json()
  if (!userId) return json({ error: 'Could not extract user ID from token' }, 401)

  const serverRaw = await env.KV.get(`server:${serverToken}`)
  if (!serverRaw) {
    return json({ error: 'Server not registered yet — start the companion server first so it registers its tunnel URL, then try again.' }, 404)
  }

  await env.KV.put(`user:${userId}`, serverToken, { expirationTtl: 86400 * 365 })
  console.log(`[link] userId=${userId} → serverToken=...${serverToken.slice(-8)}`)
  return json({ ok: true })
}

// ── App: connect after login ──────────────────────────────────────────────────
// App sends Supabase JWT; relay verifies it, looks up user → server → tunnelUrl.
async function handleConnect(request, env) {
  const supabaseToken = bearerToken(request)
  if (!supabaseToken) return json({ error: 'Missing Authorization header' }, 401)

  // Verify token with Supabase and get userId
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${supabaseToken}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  })
  if (!userRes.ok) return json({ error: 'Invalid or expired Supabase token' }, 401)
  const { id: userId } = await userRes.json()
  if (!userId) return json({ error: 'Could not extract user ID' }, 401)

  const serverToken = await env.KV.get(`user:${userId}`)
  if (!serverToken) return json({ error: 'No server linked to this account — open the companion server admin and click "Link VaultTV Account"' }, 404)

  const serverRaw = await env.KV.get(`server:${serverToken}`)
  if (!serverRaw) return json({ error: 'Server offline or not started' }, 404)

  const { tunnelUrl, lastSeen } = JSON.parse(serverRaw)
  // Stale if no heartbeat in last 3 minutes
  const stale = (Date.now() - lastSeen) > 3 * 60_000

  return json({ serverUrl: tunnelUrl, stale, lastSeen: new Date(lastSeen).toISOString() })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function bearerToken(request) {
  const h = request.headers.get('Authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}
