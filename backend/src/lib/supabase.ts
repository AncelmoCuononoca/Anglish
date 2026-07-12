import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Auth client - uses anon key, sufficient for getUser() JWT validation
let _authClient: SupabaseClient | null = null
export function getAuthClient(): SupabaseClient {
  if (!_authClient) {
    const url = process.env.SUPABASE_URL
    // Must be the ANON key: this client runs anon/user-JWT queries that rely on
    // RLS. Never fall back to the SERVICE key here — that would silently bypass
    // RLS on every read and re-expose data these queries are meant to protect.
    const key = process.env.SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env')
    _authClient = createClient(url, key)
  }
  return _authClient
}

// Admin client - uses service key for privileged operations
let _adminClient: SupabaseClient | null = null
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) throw new Error('SUPABASE_SERVICE_KEY required for admin operations')
    _adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }
  return _adminClient
}

// Legacy alias - proxies to auth client (works for most read operations)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getAuthClient() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
