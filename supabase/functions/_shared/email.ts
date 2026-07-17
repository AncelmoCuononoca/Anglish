// Deno port of backend/src/lib/email.ts. Identical Resend REST contract and
// branded layout; only process.env → Deno.env.get. Safe no-op when
// RESEND_API_KEY is unset (logs what it would have sent).

const BRAND = 'Anglish Me'

function domain(): string {
  return Deno.env.get('EMAIL_DOMAIN') || 'anglishme.com'
}

function from(kind: 'support' | 'hello' | 'noreply'): string {
  const explicit = Deno.env.get(`EMAIL_FROM_${kind.toUpperCase()}`)
  if (explicit) return explicit
  return `${BRAND} <${kind}@${domain()}>`
}

interface SendArgs {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export async function sendEmail({ to, subject, html, from: fromAddr, replyTo }: SendArgs): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const sender = fromAddr || from('noreply')

  if (!apiKey) {
    console.log(`[email] (disabled — no RESEND_API_KEY) would send "${subject}" → ${to}`)
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[email] Resend rejected "${subject}" → ${to}: ${res.status} ${body}`)
      return false
    }
    console.log(`[email] sent "${subject}" → ${to}`)
    return true
  } catch (err) {
    console.error(`[email] send failed "${subject}" → ${to}:`, err)
    return false
  }
}

function layout(opts: { heading: string; body: string; cta?: { label: string; url: string } }): string {
  const site = Deno.env.get('FRONTEND_URL') || `https://${domain()}`
  const cta = opts.cta
    ? `<tr><td style="padding:8px 0 28px;">
         <a href="${opts.cta.url}" style="display:inline-block;background:linear-gradient(135deg,#7F77DD,#00D4FF);color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;">${opts.cta.label}</a>
       </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D1B2A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B2A;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#112236;border-radius:20px;overflow:hidden;border:1px solid #1c3350;">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#7F77DD,#00D4FF);-webkit-background-clip:text;background-clip:text;color:#7F77DD;">${BRAND}</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="margin:0 0 12px;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25;">${opts.heading}</h1>
        </td></tr>
        <tr><td style="padding:0 32px;color:#aeb9c9;font-size:16px;line-height:1.6;">
          ${opts.body}
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${cta}</td></tr></table>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #1c3350;">
          <p style="margin:0;color:#5f6e82;font-size:13px;line-height:1.5;">
            You're receiving this because you have an account at ${BRAND}.<br>
            Need a hand? Just reply to this email — we read every one.<br>
            <a href="${site}" style="color:#7F77DD;text-decoration:none;">${domain()}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export async function sendWelcomeEmail(to: string, name?: string): Promise<boolean> {
  const site = Deno.env.get('FRONTEND_URL') || `https://${domain()}`
  const first = (name || '').trim().split(/\s+/)[0] || 'there'
  return await sendEmail({
    to,
    from: from('hello'),
    replyTo: from('support').replace(/^.*<|>$/g, ''),
    subject: `Welcome to ${BRAND}, ${first}! 🎉`,
    html: layout({
      heading: `Welcome aboard, ${first}!`,
      body: `
        <p style="margin:0 0 14px;">You just started something great. ${BRAND} teaches you real English with an AI coach, spoken conversations, and a course that unlocks step by step.</p>
        <p style="margin:0 0 14px;">Your free trial is live right now — jump in and take your first lesson while it's fresh.</p>
        <p style="margin:0 0 4px;">Angli is waiting for you. 🐴</p>`,
      cta: { label: 'Start learning', url: `${site}/dashboard` },
    }),
  })
}

export async function sendReceiptEmail(args: {
  to: string
  name?: string
  planLabel: string
  amount: string
  accessEnd?: string
}): Promise<boolean> {
  const site = Deno.env.get('FRONTEND_URL') || `https://${domain()}`
  const first = (args.name || '').trim().split(/\s+/)[0] || 'there'
  const until = args.accessEnd
    ? `<tr><td style="padding:6px 0;color:#aeb9c9;">Access until</td><td style="padding:6px 0;color:#ffffff;text-align:right;font-weight:600;">${args.accessEnd}</td></tr>`
    : ''
  return await sendEmail({
    to: args.to,
    from: from('support'),
    subject: `Your ${BRAND} receipt — ${args.planLabel}`,
    html: layout({
      heading: `Payment received — thank you, ${first}!`,
      body: `
        <p style="margin:0 0 16px;">Your plan is active. Here's your receipt:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B2A;border-radius:12px;padding:8px 16px;font-size:15px;">
          <tr><td style="padding:6px 0;color:#aeb9c9;">Plan</td><td style="padding:6px 0;color:#ffffff;text-align:right;font-weight:600;">${args.planLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#aeb9c9;">Amount paid</td><td style="padding:6px 0;color:#00FF88;text-align:right;font-weight:700;">${args.amount}</td></tr>
          ${until}
        </table>
        <p style="margin:16px 0 0;">Keep this email as proof of purchase. Questions about billing? Just reply.</p>`,
      cta: { label: 'Go to my dashboard', url: `${site}/dashboard` },
    }),
  })
}

// "Cobrança" / renewal reminder — the student's paid access is about to end (or
// has ended). Nudges them to renew before they lose their streak. Works for both
// Stripe (card renewal) and Kwanza/IBAN (manual pay) — the CTA lands on Plans.
export async function sendRenewalReminderEmail(args: {
  to: string
  name?: string
  planLabel: string
  accessEnd: string       // YYYY-MM-DD
  daysLeft: number        // <= 0 means access already ended
}): Promise<boolean> {
  const site = Deno.env.get('FRONTEND_URL') || `https://${domain()}`
  const first = (args.name || '').trim().split(/\s+/)[0] || 'there'
  const ended = args.daysLeft <= 0
  const when = ended
    ? 'Your access has ended'
    : args.daysLeft === 1
      ? 'Your access ends tomorrow'
      : `Your access ends in ${args.daysLeft} days`
  return await sendEmail({
    to: args.to,
    from: from('support'),
    subject: ended
      ? `${first}, your ${BRAND} access has ended — renew to continue`
      : `${first}, your ${BRAND} access ends soon`,
    html: layout({
      heading: ended ? `Welcome back any time, ${first}` : `Keep your momentum, ${first}`,
      body: `
        <p style="margin:0 0 14px;"><strong style="color:#ffffff;">${when}</strong>${ended ? '' : ` (on ${args.accessEnd})`}. Renew your <strong style="color:#ffffff;">${args.planLabel}</strong> to keep your lessons, streak and Phone Call time going without a break.</p>
        <p style="margin:0 0 14px;">Prefer to pay by bank transfer (Kwanza)? Reply to this email and we'll send you the details.</p>
        <p style="margin:0 0 4px;">Your progress is saved — pick up right where you left off. 🚀</p>`,
      cta: { label: 'Renew my plan', url: `${site}/plans` },
    }),
  })
}

// Generic informative / announcement email (new features, tips, notices). Pass a
// ready-made HTML body so the same branded shell wraps any one-off message.
export async function sendInfoEmail(args: {
  to: string
  name?: string
  subject: string
  heading: string
  bodyHtml: string
  cta?: { label: string; url: string }
}): Promise<boolean> {
  return await sendEmail({
    to: args.to,
    from: from('hello'),
    subject: args.subject,
    html: layout({ heading: args.heading, body: args.bodyHtml, cta: args.cta }),
  })
}
