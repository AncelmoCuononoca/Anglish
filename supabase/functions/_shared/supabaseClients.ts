// Mirrors backend/src/lib/supabase.ts. No dotenv/load-env needed - Edge
// Functions inject env vars directly into Deno.env per invocation.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are reserved
// names auto-injected by the platform on every Edge Function - do NOT set
// these as custom secrets (the platform rejects the SUPABASE_ prefix anyway).
// Note the service key's reserved name is SUPABASE_SERVICE_ROLE_KEY, not
// SUPABASE_SERVICE_KEY (the name backend/.env happens to use on Railway).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Anon-key client for a specific caller's JWT. Used for requests that must
// respect RLS (e.g. reading the caller's own profile row).
export function getUserClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Anon-key client with no caller JWT (e.g. signUp, signInWithPassword before
// a session exists). Safe to share: callers read the session off the returned
// data, never off the client's own state.
let _anonClient: SupabaseClient | null = null
export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _anonClient
}

// Fresh (non-shared) anon client. Use when a flow mutates the client's own
// session state — e.g. the recovery flow does setSession() then updateUser(),
// which must not race with a concurrent request on a shared singleton.
export function newAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Service-role client - bypasses RLS. Only for admin operations / internal
// helpers like check_rate_limit that are locked down to service_role.
let _adminClient: SupabaseClient | null = null
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _adminClient
}
