import { createClient } from '@supabase/supabase-js'

// When served by VaultTV Server, credentials are injected into window.__
// so they don't need to be baked into the build.
const url = (typeof window !== 'undefined' && window.__SUPABASE_URL) || import.meta.env.VITE_SUPABASE_URL
const key = (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)
