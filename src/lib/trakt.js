const BASE = 'https://api.trakt.tv'

function hdrs(clientId, accessToken) {
  const h = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  }
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`
  return h
}

export async function requestDeviceCode(clientId) {
  const res = await fetch(`${BASE}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }),
  })
  if (!res.ok) throw new Error(`Trakt ${res.status}: check your Client ID`)
  return res.json()
  // Returns: { device_code, user_code, verification_url, expires_in, interval }
}

export async function pollDeviceToken(clientId, clientSecret, deviceCode) {
  const res = await fetch(`${BASE}/oauth/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: deviceCode, client_id: clientId, client_secret: clientSecret }),
  })
  if (res.status === 400) return null   // still pending — keep polling
  if (res.status === 404) throw new Error('Device code not found')
  if (res.status === 409) throw new Error('Code already used')
  if (res.status === 410) throw new Error('Code expired — try again')
  if (res.status === 418) throw new Error('You denied the request on Trakt')
  if (!res.ok) throw new Error(`Trakt ${res.status}`)
  return res.json()
  // Returns: { access_token, refresh_token, expires_in, token_type }
}

export async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Token refresh failed (${res.status}): ${body || 'reconnect Trakt'}`)
  }
  return res.json()
}

export async function getMe(clientId, accessToken) {
  const res = await fetch(`${BASE}/users/me`, { headers: hdrs(clientId, accessToken) })
  if (!res.ok) throw new Error(`Trakt ${res.status}`)
  return res.json() // { username, name, ... }
}

export async function getUserLists(clientId, accessToken) {
  const res = await fetch(`${BASE}/users/me/lists`, { headers: hdrs(clientId, accessToken) })
  if (!res.ok) throw new Error(`Trakt ${res.status}`)
  return res.json() // [{ name, description, ids: { slug, trakt } }, ...]
}

export async function getListItems(clientId, accessToken, listIdOrSlug) {
  const path = listIdOrSlug === 'watchlist'
    ? '/users/me/watchlist'
    : `/users/me/lists/${listIdOrSlug}/items`
  const res = await fetch(`${BASE}${path}`, { headers: hdrs(clientId, accessToken) })
  if (!res.ok) throw new Error(`Trakt ${res.status}`)
  return res.json()
}

// ── Sync helpers ──────────────────────────────────────────────────────

/** Build a Trakt media object from a TMDB id + type */
function traktObj(type, tmdbId) {
  const key = type === 'movie' ? 'movies' : 'shows'
  return { [key]: [{ ids: { tmdb: Number(tmdbId) } }] }
}

/** Mark an item as watched in Trakt history */
export async function syncWatched(clientId, accessToken, type, tmdbId, watchedAt) {
  const payload = {
    ...(type === 'movie'
      ? { movies: [{ ids: { tmdb: Number(tmdbId) }, watched_at: watchedAt || new Date().toISOString() }] }
      : { shows:  [{ ids: { tmdb: Number(tmdbId) }, watched_at: watchedAt || new Date().toISOString() }] }),
  }
  const res = await fetch(`${BASE}/sync/history`, {
    method: 'POST',
    headers: hdrs(clientId, accessToken),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Trakt syncWatched ${res.status}`)
  return res.json()
}

/** Push a rating (1–10) to Trakt */
export async function syncRating(clientId, accessToken, type, tmdbId, rating) {
  const key = type === 'movie' ? 'movies' : 'shows'
  const res = await fetch(`${BASE}/sync/ratings`, {
    method: 'POST',
    headers: hdrs(clientId, accessToken),
    body: JSON.stringify({ [key]: [{ ids: { tmdb: Number(tmdbId) }, rating }] }),
  })
  if (!res.ok) throw new Error(`Trakt syncRating ${res.status}`)
  return res.json()
}

/** Add an item to the Trakt watchlist */
export async function addToWatchlist(clientId, accessToken, type, tmdbId) {
  const res = await fetch(`${BASE}/sync/watchlist`, {
    method: 'POST',
    headers: hdrs(clientId, accessToken),
    body: JSON.stringify(traktObj(type, tmdbId)),
  })
  if (!res.ok) throw new Error(`Trakt addToWatchlist ${res.status}`)
  return res.json()
}

/** Remove an item from the Trakt watchlist */
export async function removeFromWatchlist(clientId, accessToken, type, tmdbId) {
  const res = await fetch(`${BASE}/sync/watchlist/remove`, {
    method: 'POST',
    headers: hdrs(clientId, accessToken),
    body: JSON.stringify(traktObj(type, tmdbId)),
  })
  if (!res.ok) throw new Error(`Trakt removeFromWatchlist ${res.status}`)
  return res.json()
}

/** Convert raw Trakt list items to minimal TMDB-id-carrying objects */
export function traktItemsToPartial(items) {
  return (items || [])
    .filter(i => i.type === 'movie' || i.type === 'show')
    .map(i => {
      const obj = i.type === 'movie' ? i.movie : i.show
      return {
        id: obj?.ids?.tmdb,
        title: obj?.title || '',
        media_type: i.type === 'movie' ? 'movie' : 'tv',
      }
    })
    .filter(i => i.id)
}
