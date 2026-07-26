// Account self-deletion. Deployed with verify_jwt: false; the single route
// applies requireAuth so a user can only ever delete THEIR OWN account.
//
// What "delete" means here (decided with the founder): wipe everything personal
// — profile, all progress, speaking/chat usage, and the auth login itself — but
// keep ONE minimal, non-personal-beyond-email record in `trial_history` so the
// same email cannot claim the 3-day free trial a second time. The free trial is
// once-per-email, for life; that guard is the only reason anything survives.
//
// Deletion order matters (see the FK audit):
//   • 4 tables carry user_id but do NOT cascade from profiles → cleared by hand
//   • deleting the profiles row cascades the other 7 user tables + reminder_log
//   • profiles has no FK to auth.users, so the login is removed separately
import { Hono } from 'jsr:@hono/hono@4'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseClients.ts'
import { requireAuth, type AuthEnv } from '../_shared/auth.ts'

const app = new Hono<AuthEnv>().basePath('/account')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})

// user_id tables with no ON DELETE CASCADE from profiles — must be cleared first.
const NON_CASCADE_TABLES = [
  'access_code_redemptions',
  'ai_cost_daily',
  'chat_daily_usage',
  'speaking_practice',
] as const

// ── POST /account/delete ──────────────────────────────────────
// Irreversible. Removes the caller's account and every trace of their data,
// keeping only the trial-abuse guard keyed by email.
app.post('/delete', requireAuth, async (c) => {
  const userId = c.get('userId')
  const db = getAdminClient()

  try {
    // 1. Read the minimal signals we need BEFORE anything is deleted.
    const { data: profile } = await db
      .from('profiles')
      .select('email, stripe_customer_id, topup_seconds')
      .eq('id', userId)
      .maybeSingle()

    const email = (profile?.email as string | null)?.trim().toLowerCase() || null
    const everPaid = !!profile?.stripe_customer_id || (Number(profile?.topup_seconds) || 0) > 0

    // 2. Preserve the trial-abuse guard (survives the wipe). Insert-or-touch by
    //    email; never downgrade a known payer back to unpaid.
    if (email) {
      await db.from('trial_history')
        .upsert({ email, deleted_at: new Date().toISOString() }, { onConflict: 'email' })
      if (everPaid) await db.from('trial_history').update({ ever_paid: true }).eq('email', email)
    }

    // 3. Clear the tables that don't cascade.
    for (const t of NON_CASCADE_TABLES) {
      const { error } = await db.from(t).delete().eq('user_id', userId)
      if (error) console.error(`[account] failed clearing ${t}:`, error)
    }

    // 4. Delete the profile → cascades the remaining user tables + reminder_log.
    const { error: pErr } = await db.from('profiles').delete().eq('id', userId)
    if (pErr) {
      console.error('[account] profile delete failed:', pErr)
      return c.json({ error: 'Could not delete your account. Please contact support.' }, 500)
    }

    // 5. Remove the auth login (credentials + OAuth identities).
    const { error: aErr } = await db.auth.admin.deleteUser(userId)
    if (aErr) {
      // Profile/data are already gone; the orphaned login can't reach anything,
      // but surface it so support can finish the job.
      console.error('[account] auth user delete failed:', aErr)
      return c.json({ error: 'Your data was removed but the login could not be closed. Please contact support.' }, 500)
    }

    return c.json({ success: true })
  } catch (err) {
    console.error('[account] delete error:', err)
    return c.json({ error: 'Could not delete your account. Please try again.' }, 500)
  }
})

Deno.serve(app.fetch)
