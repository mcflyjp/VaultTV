/**
 * Supabase client
 *
 * The single shared client used for auth and cloud sync. Credentials come from
 * the build environment normally, or are injected on window by the Media
 * Server when it serves the app, so a self hosted build does not need them
 * baked in at compile time.
 */

import { createClient } from '@supabase/supabase-js'

// When served by VaultTV Server, credentials are injected into window.__
// so they don't need to be baked into the build.
const url = (typeof window !== 'undefined' && window.__SUPABASE_URL) || import.meta.env.VITE_SUPABASE_URL
const key = (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)
