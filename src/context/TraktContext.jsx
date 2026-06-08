import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  requestDeviceCode, pollDeviceToken, refreshAccessToken,
  getMe, getUserLists,
  syncWatched as apiSyncWatched,
  syncRating as apiSyncRating,
  addToWatchlist as apiAddToWatchlist,
  removeFromWatchlist as apiRemoveFromWatchlist,
} from '../lib/trakt'
import { supabase } from '../lib/supabase'

const LS_CREDS  = 'vt-trakt-creds'
const LS_AUTH   = 'vt-trakt-auth'
const LS_LISTS  = 'vt-trakt-lists'

const TraktContext = createContext(null)

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

export function TraktProvider({ children }) {
  const [creds,  setCreds]  = useState(() => loadJson(LS_CREDS, null))
  const [auth,   setAuth]   = useState(() => loadJson(LS_AUTH, null))
  const [lists,  setLists]  = useState(() => loadJson(LS_LISTS, []))

  const [deviceFlow, setDeviceFlow] = useState(null)
  const [flowError,  setFlowError]  = useState('')
  const pollTimer = useRef(null)

  const clientId     = creds?.clientId     || ''
  const clientSecret = creds?.clientSecret || ''
  const accessToken  = auth?.accessToken   || null
  const username     = auth?.username      || null
  const connected    = !!accessToken

  // ── Load from Supabase on sign-in ──────────────────────────────────
  useEffect(() => {
    async function loadFromCloud() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('user_settings')
        .select('trakt_creds, trakt_auth')
        .eq('user_id', session.user.id)
        .single()
      if (!data) return
      // Cloud always wins on sign-in — overwrite whatever is in localStorage
      if (data.trakt_creds) {
        setCreds(data.trakt_creds)
        localStorage.setItem(LS_CREDS, JSON.stringify(data.trakt_creds))
      }
      if (data.trakt_auth) {
        setAuth(data.trakt_auth)
        localStorage.setItem(LS_AUTH, JSON.stringify(data.trakt_auth))
      }
    }
    loadFromCloud()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') loadFromCloud()
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Auto-refresh token ──────────────────────────────────────────────
  useEffect(() => {
    if (!auth || !creds) return
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (auth.expiresAt - Date.now() < sevenDays) {
      refreshAccessToken(creds.clientId, creds.clientSecret, auth.refreshToken)
        .then(data => persistAuth(data, auth.username))
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveToCloud(field, value) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('user_settings').upsert({
        user_id: session.user.id,
        [field]: value,
        updated_at: new Date().toISOString(),
      })
    } catch {}
  }

  function persistAuth(data, uname) {
    const next = {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + data.expires_in * 1000,
      username:     uname || auth?.username || '',
    }
    setAuth(next)
    localStorage.setItem(LS_AUTH, JSON.stringify(next))
    saveToCloud('trakt_auth', next)
    return next
  }

  function saveCredentials(clientId, clientSecret) {
    const next = { clientId: clientId.trim(), clientSecret: clientSecret.trim() }
    setCreds(next)
    localStorage.setItem(LS_CREDS, JSON.stringify(next))
    saveToCloud('trakt_creds', next)
  }

  function disconnect() {
    clearInterval(pollTimer.current)
    setAuth(null)
    setLists([])
    setDeviceFlow(null)
    setFlowError('')
    localStorage.removeItem(LS_AUTH)
    localStorage.removeItem(LS_LISTS)
    saveToCloud('trakt_auth', null)
  }

  const fetchLists = useCallback(async (token, cid) => {
    const at = token || accessToken
    const id = cid  || clientId
    if (!at || !id) return
    try {
      const raw = await getUserLists(id, at)
      const next = raw.map(l => ({ id: l.ids?.slug || String(l.ids?.trakt), name: l.name, slug: l.ids?.slug }))
      setLists(next)
      localStorage.setItem(LS_LISTS, JSON.stringify(next))
    } catch {}
  }, [accessToken, clientId])

  // ── Device auth flow ────────────────────────────────────────────────
  async function startDeviceAuth() {
    if (!clientId || !clientSecret) {
      setFlowError('Enter your Client ID and Client Secret first.')
      return
    }
    setFlowError('')
    clearInterval(pollTimer.current)
    try {
      const data = await requestDeviceCode(clientId)
      setDeviceFlow({
        userCode:        data.user_code,
        verificationUrl: data.verification_url,
        expiresAt:       Date.now() + data.expires_in * 1000,
      })
      const interval = (data.interval || 5) * 1000
      pollTimer.current = setInterval(async () => {
        try {
          const token = await pollDeviceToken(clientId, clientSecret, data.device_code)
          if (!token) return
          clearInterval(pollTimer.current)
          let uname = ''
          try { uname = (await getMe(clientId, token.access_token)).username } catch {}
          persistAuth(token, uname)
          await fetchLists(token.access_token, clientId)
          setDeviceFlow(null)
        } catch (err) {
          clearInterval(pollTimer.current)
          setDeviceFlow(null)
          setFlowError(err.message)
        }
      }, interval)
    } catch (err) {
      setFlowError(err.message)
    }
  }

  function cancelDeviceAuth() {
    clearInterval(pollTimer.current)
    setDeviceFlow(null)
    setFlowError('')
  }

  // ── Sync helpers — silently fail if not connected ───────────────────
  async function withToken(fn) {
    if (!connected || !clientId) return
    try { await fn(clientId, accessToken) }
    catch (e) {
      // Try token refresh once on 401
      if (e.message?.includes('401') && creds?.refreshToken) {
        try {
          const data = await refreshAccessToken(clientId, clientSecret, auth.refreshToken)
          const next = persistAuth(data, username)
          await fn(clientId, next.accessToken)
        } catch {}
      }
    }
  }

  function syncWatched(type, tmdbId)          { withToken((cid, at) => apiSyncWatched(cid, at, type, tmdbId)) }
  function syncRating(type, tmdbId, rating)   { withToken((cid, at) => apiSyncRating(cid, at, type, tmdbId, rating)) }
  function addToWatchlist(type, tmdbId)        { withToken((cid, at) => apiAddToWatchlist(cid, at, type, tmdbId)) }
  function removeFromWatchlist(type, tmdbId)   { withToken((cid, at) => apiRemoveFromWatchlist(cid, at, type, tmdbId)) }

  return (
    <TraktContext.Provider value={{
      clientId, clientSecret, connected, accessToken, username, lists,
      deviceFlow, flowError,
      saveCredentials, startDeviceAuth, cancelDeviceAuth, disconnect, fetchLists,
      syncWatched, syncRating, addToWatchlist, removeFromWatchlist,
    }}>
      {children}
    </TraktContext.Provider>
  )
}

export function useTrakt() {
  return useContext(TraktContext)
}
