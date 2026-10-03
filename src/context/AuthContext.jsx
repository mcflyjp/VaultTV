/**
 * AuthContext
 *
 * Supabase session state for the whole app: the current user, sign in and sign
 * out, and the loading flag routes use to avoid redirecting before the session
 * has been restored. Everything that syncs to the cloud waits on the user
 * object exposed here.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const IS_ELECTRON     = !!window.electronAPI?.isElectron
// True for the native Android WebView app on ANY device (phone or TV) — MainActivity.java
// tags this unconditionally. Used to pick the OAuth redirect strategy, since the WebView's
// own accounts.google.com interception + vaulttv://auth/callback deep-link handling isn't
// TV-gated and works identically on phones. The separate "VaultTV-FireTV" tag (only on
// real TV hardware, checked elsewhere for D-pad vs. touch UI layout) is too narrow for this.
const IS_ANDROID_APP  = /VaultTV-App/i.test(navigator.userAgent)
// Already running inside the VaultTV Server — no redirect needed
const IS_SERVER       = !!window.__VAULTTV_SERVER

// The custom URL scheme registered in electron/main.cjs.
// Must also be added as an allowed redirect URL in the Supabase dashboard:
//   Authentication → URL Configuration → Redirect URLs → add  vaulttv://auth/callback
const ELECTRON_REDIRECT = 'vaulttv://auth/callback'

// The relay maps a signed-in user to their own Media Server's current address.
// It exists because a quick cloudflared tunnel regenerates its *.trycloudflare.com
// hostname on every launch, so no client can hold a working address for long.
const RELAY_URL = 'https://vaulttv-relay.jeremypulis.workers.dev'

// Where the companion address lives, and whether we are the ones who set it.
// A host the user typed themselves is never overwritten; one we adopted from the
// relay is refreshed whenever the tunnel moves, which is what makes a changed
// URL self-heal instead of breaking playback until someone re-types it.
const LS_HOST   = 'vt-companion-host'
const LS_SOURCE = 'vt-companion-host-source'

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      // Re-check on every launch, not only at sign-in. These apps start with a
      // session already restored, so SIGNED_IN never fires for them, and the
      // tunnel may well have moved while the app was closed.
      if (session && (IS_ELECTRON || IS_ANDROID_APP)) adoptServerFromRelay(session)
    })

    // Listen for auth state changes (covers token refresh, sign-out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      // On sign-in: check if the user has a registered VaultTV Server and redirect to it.
      // Skip when already inside the server, in Electron, or in the native Android app
      // (phone or FireTV) — those go through the deep-link callback flow above, and an
      // immediate second location.href redirect right after it would interrupt that.
      if (_event === 'SIGNED_IN' && session && !IS_SERVER && !IS_ELECTRON && !IS_ANDROID_APP) {
        redirectToServer(session)
      }
      // Electron and the Android app cannot be redirected: they are mid deep-link
      // callback, and navigating away would interrupt it. They also do not need to
      // be, since they render their own UI and only need the server's ADDRESS. So
      // they adopt it instead and keep rendering.
      if (_event === 'SIGNED_IN' && session && (IS_ELECTRON || IS_ANDROID_APP)) {
        adoptServerFromRelay(session)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Relay server discovery ──────────────────────────────────────────────────
  // Points this client at the user's own Media Server without them ever typing
  // an address. Browsers are redirected onto the server's origin instead, by
  // redirectToServer below; this is the path for clients that keep rendering
  // their own UI and only need to know where the server lives.
  async function adoptServerFromRelay(session) {
    try {
      const res = await fetch(`${RELAY_URL}/api/connect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { serverUrl, stale } = await res.json()
      // A stale record means the server has not sent a heartbeat recently, so
      // its address is probably dead. Keeping whatever already works beats
      // replacing it with something that does not.
      if (!serverUrl || stale) return

      const current = (localStorage.getItem(LS_HOST) || '').trim()
      const source  = localStorage.getItem(LS_SOURCE)
      // Never clobber an address the user entered by hand. They may be pointing
      // at a LAN URL on purpose, which the relay has no way to know about and
      // which is faster than routing through the tunnel.
      if (current && source !== 'relay') return

      const next = serverUrl.replace(/\/$/, '')
      if (current === next) return
      localStorage.setItem(LS_HOST, next)
      localStorage.setItem(LS_SOURCE, 'relay')
      console.log('[relay] server address adopted:', next)
      // companion.js recomputes its base on every call, so this takes effect
      // immediately for anything requested from here on. Views already holding
      // a failed result still need a re-render, hence the event.
      window.dispatchEvent(new CustomEvent('vt-companion-host-changed', { detail: next }))
    } catch {
      // Offline, or the relay is down. The existing address stays in place.
    }
  }

  async function redirectToServer(session) {
    try {
      const res = await fetch('https://vaulttv-relay.jeremypulis.workers.dev/api/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { serverUrl, stale } = await res.json()
      if (!serverUrl || stale) return
      // Already on the server's origin — nothing to do
      if (window.location.origin === new URL(serverUrl).origin) return
      // Redirect with the Supabase access token so the server can create a local session
      window.location.href = `${serverUrl.replace(/\/$/, '')}/auth/sso?token=${session.access_token}`
    } catch {
      // Non-fatal — user stays on current page
    }
  }

  // ── Android OAuth deep-link handler (phone + FireTV) ──────────────────
  // MainActivity intercepts vaulttv://auth/callback, extracts the fragment,
  // and calls window.__vaulttvAuthCallback(fragment).
  useEffect(() => {
    if (!IS_ANDROID_APP) return
    window.__vaulttvAuthCallback = async (fragment) => {
      try {
        const params = new URLSearchParams(fragment)
        const accessToken  = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken || '' })
        } else {
          await supabase.auth.exchangeCodeForSession(fragment)
        }
      } catch (err) {
        console.error('VaultTV FireTV auth callback error:', err)
      }
    }
    return () => { delete window.__vaulttvAuthCallback }
  }, [])

  // ── Electron OAuth deep-link handler ─────────────────────────────────
  // When Google OAuth completes, the system browser redirects to
  // vaulttv://auth/callback#access_token=...&refresh_token=...
  // main.cjs intercepts it and sends an 'auth-callback' IPC event here.
  // We extract the tokens and call supabase.auth.setSession() to log in.
  useEffect(() => {
    if (!IS_ELECTRON || !window.electronAPI?.onAuthCallback) return

    window.electronAPI.onAuthCallback(async (callbackUrl) => {
      try {
        // Supabase appends tokens in the hash or query string
        const raw = callbackUrl.includes('#') ? callbackUrl.split('#')[1] : callbackUrl.split('?')[1] || ''
        const params = new URLSearchParams(raw)
        const accessToken  = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (accessToken) {
          const { error } = await supabase.auth.setSession({
            access_token:  accessToken,
            refresh_token: refreshToken || '',
          })
          if (error) console.error('VaultTV auth-callback setSession error:', error)
        } else {
          // PKCE flow: Supabase may use a code instead; let the SDK handle it
          await supabase.auth.exchangeCodeForSession(raw)
        }
      } catch (err) {
        console.error('VaultTV auth deep-link error:', err)
      }
    })
  }, [])

  // ── Auth methods ──────────────────────────────────────────────────────

  async function signInWithEmail(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUpWithEmail(email, password) {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  async function signInWithGoogle() {
    if (IS_ELECTRON) {
      // Electron: open OAuth in system browser, catch deep-link callback
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: ELECTRON_REDIRECT,
          skipBrowserRedirect: true,
        },
      })
      if (error) throw error
      if (data?.url) window.electronAPI.openExternal(data.url)

    } else if (IS_ANDROID_APP) {
      // Native Android app (phone or FireTV): Java intercepts accounts.google.com
      // URLs and opens Silk/Chrome. Supabase redirects back to vaulttv://auth/callback —
      // Android catches that intent and calls window.__vaulttvAuthCallback() with the fragment.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'vaulttv://auth/callback' },
      })
      if (error) throw error
      // Navigation to Google happens inside the WebView; Java intercepts it.

    } else {
      // Browser / web: normal redirect flow
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
