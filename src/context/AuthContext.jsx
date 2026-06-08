import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const IS_ELECTRON = !!window.electronAPI?.isElectron
// FireTV WebView — Google blocks OAuth in embedded browsers, so we open Silk
const IS_FIRETV   = /VaultTV-FireTV/i.test(navigator.userAgent)

// The custom URL scheme registered in electron/main.cjs.
// Must also be added as an allowed redirect URL in the Supabase dashboard:
//   Authentication → URL Configuration → Redirect URLs → add  vaulttv://auth/callback
const ELECTRON_REDIRECT = 'vaulttv://auth/callback'

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth state changes (covers token refresh, sign-out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── FireTV OAuth deep-link handler ───────────────────────────────────
  // MainActivity intercepts vaulttv://auth/callback, extracts the fragment,
  // and calls window.__vaulttvAuthCallback(fragment).
  useEffect(() => {
    if (!IS_FIRETV) return
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

    } else if (IS_FIRETV) {
      // FireTV: Java intercepts accounts.google.com URLs and opens Silk.
      // Supabase redirects back to vaulttv://auth/callback — Android catches
      // that intent and calls window.__vaulttvAuthCallback() with the fragment.
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
