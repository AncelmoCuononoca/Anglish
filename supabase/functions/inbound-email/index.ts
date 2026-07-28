// Inbound email forwarder. Resend receives mail for anglishme.com (MX →
// inbound-smtp AWS SES) and fires an `email.received` webhook here; we re-send
// the message to the founder's Gmail so hello@ / support@ land in a real inbox
// WITHOUT exposing that Gmail publicly. verify_jwt: false — this is a webhook,
// authenticated by verifying Resend's Svix signature instead of a user JWT.
import { Hono } from 'jsr:@hono/hono@4'
import { getAdminClient } from '../_shared/supabaseClients.ts'

const app = new Hono().basePath('/inbound-email')

// Verify a Resend (Svix) webhook signature over the raw body.
async function verifySvix(secret: string, id: string, ts: string, body: string, sigHeader: string): Promise<boolean> {
  try {
    const raw = secret.replace(/^whsec_/, '')
    const keyBytes = Uint8Array.from(atob(raw), (ch) => ch.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signed = `${id}.${ts}.${body}`
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed))
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
    // Header looks like "v1,<sig> v1,<sig2>"; any match passes.
    return sigHeader.split(' ').some((part) => part.split(',')[1] === expected)
  } catch {
    return false
  }
}

function addrOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return (o.address as string) || (o.email as string) || ''
  }
  return ''
}

app.post('/', async (c) => {
  const raw = await c.req.text()
  const db = getAdminClient()

  const { data: cfg } = await db.from('app_config').select('key,value').in('key', ['resend_webhook_secret', 'inbound_forward_to'])
  const m: Record<string, string> = {}
  for (const r of cfg ?? []) m[r.key as string] = r.value as string

  const id = c.req.header('svix-id') ?? ''
  const ts = c.req.header('svix-timestamp') ?? ''
  const sig = c.req.header('svix-signature') ?? ''
  if (!m.resend_webhook_secret || !id || !ts || !sig || !(await verifySvix(m.resend_webhook_secret, id, ts, raw, sig))) {
    return c.json({ error: 'invalid signature' }, 401)
  }

  let evt: { type?: string; data?: Record<string, unknown> }
  try { evt = JSON.parse(raw) } catch { return c.json({ ok: true }) }
  if (evt?.type !== 'email.received') return c.json({ ok: true }) // ignore other events

  const target = m.inbound_forward_to
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!target || !apiKey) return c.json({ ok: true })

  const d = evt.data ?? {}
  const fromAddr = addrOf(d.from) || 'desconhecido'
  const toField = Array.isArray(d.to) ? (d.to as unknown[]).map(addrOf).join(', ') : addrOf(d.to) || 'hello@anglishme.com'
  const subject = (d.subject as string) || '(sem assunto)'
  const text = (d.text as string) || ''
  const html = (d.html as string) || ''

  const note = `<div style="background:#f4f6f8;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#555;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">📩 Reencaminhado de <b>${toField}</b> · De: <b>${fromAddr}</b><br>Responde a este email para responderes diretamente ao remetente.</div>`
  const bodyHtml = html
    ? note + html
    : note + `<pre style="white-space:pre-wrap;font-family:inherit;">${text.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] as string))}</pre>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Anglish Me <noreply@anglishme.com>',
      to: [target],
      reply_to: [fromAddr],   // replying in Gmail goes straight to the student
      subject: `[hello@] ${subject}`,
      html: bodyHtml,
      ...(text ? { text } : {}),
    }),
  }).catch((e) => console.error('[inbound-email] forward failed:', e))

  return c.json({ ok: true })
})

Deno.serve(app.fetch)
