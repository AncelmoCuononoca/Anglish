// Edge Function port of backend/src/routes/access.ts (Express → Hono).
// Deployed with verify_jwt: false; both routes apply requireAuth per-route.
//
// Access-code redemption: a student enters a code the admin gave them (e.g.
// after paying by IBAN over WhatsApp) and it unlocks / extends their paid
// access. All reads/writes use the service client because access_codes is
// deny-all under RLS and access_end is a column students may not write.
// NOTE: requireActiveAccess is deliberately NOT applied — a blocked/expired
// student MUST be able to redeem to get back in.
import { Hono } from 'jsr:@hono/hono@4'
import { z } from 'npm:zod@3'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseClients.ts'
import { requireAuth, type AuthEnv } from '../_shared/auth.ts'

const app = new Hono<AuthEnv>().basePath('/access')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})

function todayStr(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

// Add `days` to a paid window, never shrinking what the student already has:
// start from the later of "today" and the current access_end.
function extendAccessDays(currentEnd: string | null | undefined, days: number): string {
  const now = new Date()
  const base = currentEnd ? new Date(currentEnd + 'T00:00:00Z') : now
  const from = base > now ? base : now
  from.setUTCDate(from.getUTCDate() + days)
  return from.toISOString().slice(0, 10)
}

async function body(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try { return await c.req.json() } catch { return {} }
}

// ── POST /access/redeem ───────────────────────────────────────
// Body: { code }. Validates the code and extends the caller's access_end.
app.post('/redeem', requireAuth, async (c) => {
  const parsed = z.object({ code: z.string().min(1).max(64) }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Código inválido.' }, 400)
  const code = parsed.data.code.trim().toUpperCase()
  const userId = c.get('userId')

  try {
    const db = getAdminClient()

    const { data: row } = await db
      .from('access_codes')
      .select('id, grant_days, grant_plan, max_uses, uses, active, expires_at')
      .eq('code', code)
      .maybeSingle()

    if (!row) return c.json({ error: 'Código inválido. Confirma que digitaste corretamente.' }, 404)
    if (!row.active) return c.json({ error: 'Este código foi desativado.' }, 400)
    const today = todayStr()
    if (row.expires_at && (row.expires_at as string) < today) {
      return c.json({ error: 'Este código já expirou.' }, 400)
    }
    if (row.max_uses != null && (row.uses as number) >= (row.max_uses as number)) {
      return c.json({ error: 'Este código já atingiu o limite de utilizações.' }, 400)
    }

    // Read the current window so we extend (never shorten) it.
    const { data: profile } = await db
      .from('profiles')
      .select('access_end')
      .eq('id', userId)
      .maybeSingle()

    const newEnd = extendAccessDays(profile?.access_end as string | null, row.grant_days as number)

    // Insert the redemption FIRST — the UNIQUE(code_id, user_id) constraint makes
    // "already redeemed" a hard, race-proof error instead of a second grant.
    const { error: redErr } = await db.from('access_code_redemptions').insert({
      code_id: row.id,
      user_id: userId,
      granted_days: row.grant_days,
      new_access_end: newEnd,
    })
    if (redErr) {
      // 23505 = unique_violation → this user already used this code.
      if ((redErr as { code?: string }).code === '23505') {
        return c.json({ error: 'Já resgataste este código antes.' }, 400)
      }
      console.error('[access] redemption insert failed:', redErr)
      return c.json({ error: 'Não foi possível resgatar o código.' }, 500)
    }

    // Apply the grant to the profile.
    const update: Record<string, unknown> = { access_start: today, access_end: newEnd }
    if (row.grant_plan) update.plan = row.grant_plan
    const { error: updErr } = await db.from('profiles').update(update).eq('id', userId)
    if (updErr) {
      console.error('[access] profile update failed:', updErr)
      return c.json({ error: 'Não foi possível aplicar o código.' }, 500)
    }

    // Bump the usage counter (best-effort; the per-user unique already caps abuse).
    await db.from('access_codes').update({ uses: (row.uses as number) + 1 }).eq('id', row.id)

    return c.json({ success: true, access_end: newEnd, plan: row.grant_plan ?? undefined })
  } catch (err) {
    console.error('[access] redeem error:', err)
    return c.json({ error: 'Não foi possível resgatar o código.' }, 500)
  }
})

// ── POST /access/code-info ────────────────────────────────────
// Non-consuming lookup used by the Plans page: given a code, returns its %
// discount (and trial days) so prices can show the promo WITHOUT redeeming.
app.post('/code-info', requireAuth, async (c) => {
  const parsed = z.object({ code: z.string().min(1).max(64) }).safeParse(await body(c))
  if (!parsed.success) return c.json({ valid: false, error: 'Código inválido.' }, 400)
  const code = parsed.data.code.trim().toUpperCase()
  try {
    const { data: row } = await getAdminClient()
      .from('access_codes')
      .select('grant_days, discount_pct, active, expires_at')
      .eq('code', code)
      .maybeSingle()
    const today = todayStr()
    const ok = !!row && row.active && (!row.expires_at || (row.expires_at as string) >= today)
    if (!ok) return c.json({ valid: false, error: 'Código inválido ou expirado.' }, 404)
    return c.json({
      valid: true,
      discount_pct: (row!.discount_pct as number) ?? 0,
      grant_days: (row!.grant_days as number) ?? 0,
    })
  } catch (err) {
    console.error('[access] code-info error:', err)
    return c.json({ valid: false, error: 'Não foi possível validar o código.' }, 500)
  }
})

Deno.serve(app.fetch)
