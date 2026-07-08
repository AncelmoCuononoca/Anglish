import { Router } from 'express'
import { z } from 'zod'
import { getAdminClient } from '../lib/supabase'
import { requireAuth, type AuthRequest } from '../middleware/auth'

// ─────────────────────────────────────────────────────────────────────────────
// Access-code redemption. A student enters a code the admin gave them (e.g. after
// paying by IBAN over WhatsApp) and it unlocks / extends their paid access. All
// reads/writes use the service client because access_codes is deny-all under RLS
// and access_end is a column students may not write themselves.
// ─────────────────────────────────────────────────────────────────────────────
export const accessRouter = Router()

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

// ── POST /api/access/redeem ───────────────────────────────────
// Body: { code }. Validates the code and extends the caller's access_end.
accessRouter.post('/redeem', requireAuth, async (req, res) => {
  const parsed = z.object({ code: z.string().min(1).max(64) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Código inválido.' })
  const code = parsed.data.code.trim().toUpperCase()
  const userId = (req as AuthRequest).userId

  try {
    const db = getAdminClient()

    const { data: row } = await db
      .from('access_codes')
      .select('id, grant_days, grant_plan, max_uses, uses, active, expires_at')
      .eq('code', code)
      .maybeSingle()

    if (!row) return res.status(404).json({ error: 'Código inválido. Confirma que digitaste corretamente.' })
    if (!row.active) return res.status(400).json({ error: 'Este código foi desativado.' })
    const today = todayStr()
    if (row.expires_at && (row.expires_at as string) < today) {
      return res.status(400).json({ error: 'Este código já expirou.' })
    }
    if (row.max_uses != null && (row.uses as number) >= (row.max_uses as number)) {
      return res.status(400).json({ error: 'Este código já atingiu o limite de utilizações.' })
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
        return res.status(400).json({ error: 'Já resgataste este código antes.' })
      }
      console.error('[access] redemption insert failed:', redErr)
      return res.status(500).json({ error: 'Não foi possível resgatar o código.' })
    }

    // Apply the grant to the profile.
    const update: Record<string, unknown> = { access_start: today, access_end: newEnd }
    if (row.grant_plan) update.plan = row.grant_plan
    const { error: updErr } = await db.from('profiles').update(update).eq('id', userId)
    if (updErr) {
      console.error('[access] profile update failed:', updErr)
      return res.status(500).json({ error: 'Não foi possível aplicar o código.' })
    }

    // Bump the usage counter (best-effort; the per-user unique already caps abuse).
    await db.from('access_codes').update({ uses: (row.uses as number) + 1 }).eq('id', row.id)

    return res.json({ success: true, access_end: newEnd, plan: row.grant_plan ?? undefined })
  } catch (err) {
    console.error('[access] redeem error:', err)
    return res.status(500).json({ error: 'Não foi possível resgatar o código.' })
  }
})

// ── POST /api/access/code-info ────────────────────────────────
// Non-consuming lookup used by the Plans page: given a code, returns its %
// discount (and trial days) so prices can show the promo WITHOUT redeeming.
// Only exposes info for a valid, active, non-expired code — never lists codes.
accessRouter.post('/code-info', requireAuth, async (req, res) => {
  const parsed = z.object({ code: z.string().min(1).max(64) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ valid: false, error: 'Código inválido.' })
  const code = parsed.data.code.trim().toUpperCase()
  try {
    const { data: row } = await getAdminClient()
      .from('access_codes')
      .select('grant_days, discount_pct, active, expires_at')
      .eq('code', code)
      .maybeSingle()
    const today = todayStr()
    const ok = !!row && row.active && (!row.expires_at || (row.expires_at as string) >= today)
    if (!ok) return res.status(404).json({ valid: false, error: 'Código inválido ou expirado.' })
    return res.json({
      valid: true,
      discount_pct: (row!.discount_pct as number) ?? 0,
      grant_days: (row!.grant_days as number) ?? 0,
    })
  } catch (err) {
    console.error('[access] code-info error:', err)
    return res.status(500).json({ valid: false, error: 'Não foi possível validar o código.' })
  }
})
