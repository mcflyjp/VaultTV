import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  requestDeviceCode, pollDeviceToken, refreshAccessToken,
  getMe, getUserLists,
} from '../lib/trakt'

const LS_CREDS  = 'vt-trakt-creds'   // { clientId, clientSecret }
const LS_AUTH   = 'vt-trakt-auth'    // { accessToken, refreshToken, expiresAt, username }
const LS_LISTS  = 'vt-trakt-lists'   // [{ id, name, slug }]

const TraktContext = createContext(null)

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

export function TraktProvider({ children }) {
  const [creds,  setCreds]  = useState(() => loadJson(LS_CREDS, null))
  const [auth,   setAuth]   = useState(() => loadJson(LS_AUTH, null))
  const [lists,  setLists]  = useState(() => loadJson(LS_LISTS, []))

  // Device-auth flow state
  const [deviceFlow, setDeviceFlow] = useState(null) // { userCode, verificationUrl, expiresAt }
  const [flowError,  setFlowError]  = useState('')
  const pollTimer = useRef(null)

  // ── Derived ──
  const clientId     = creds?.clientId     || ''
  const clientSecret = creds?.clientSecret || ''
  const accessToken  = auth?.accessToken   || null
  const username     = auth?.username      || null
  const connected    = !!accessToken

  // ── Auto-refresh on mount if token expires within 7 days ──
  useEffect(() => {
    if (!auth || !creds) return
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (auth.expiresAt - Date.now() < sevenDays) {
      refreshAccessToken(creds.clientId, creds.clientSecret, auth.refreshToken)
        .then(data => persistAuth(data, auth.username))
        .catch(() => {}) // silently fail — user will see errors when fetching lists
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function persistAuth(data, uname) {
    const next = {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + data.expires_in * 1000,
      username:     uname || auth?.username || '',
    }
    setAuth(next)
    localStorage.setItem(LS_AUTH, JSON.stringify(next))
    return next
  }

  function saveCredentials(clientId, clientSecret) {
    const next = { clientId: clientId.trim(), clientSecret: clientSecret.trim() }
    setCreds(next)
    localStorage.setItem(LS_CREDS, JSON.stringify(next))
  }

  function disconnect() {
    clearInterval(pollTimer.current)
    setAuth(null)
    setLists([])
    setDeviceFlow(null)
    setFlowError('')
    localStorage.removeItem(LS_AUTH)
    localStorage.removeItem(LS_LISTS)
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

      // Poll every `interval` seconds
      const interval = (data.interval || 5) * 1000
      pollTimer.current = setInterval(async () => {
        try {
          const token = await pollDeviceToken(clientId, clientSecret, data.device_code)
          if (!token) return // still pending
          clearInterval(pollTimer.current)
          // Fetch username
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

  return (
    <TraktContext.Provider value={{
      clientId, clientSecret, connected, accessToken, username, lists,
      deviceFlow, flowError,
      saveCredentials, startDeviceAuth, cancelDeviceAuth, disconnect, fetchLists,
    }}>
      {children}
    </TraktContext.Provider>
  )
}

export function useTrakt() {
  return useContext(TraktContext)
}
