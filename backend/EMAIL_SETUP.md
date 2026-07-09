# Email setup — Anglish AI

Two separate email systems. This doc covers turning both on.

| System | What it sends | Handled by | Code status |
|---|---|---|---|
| **Transactional (app)** | Welcome, payment receipt | Our backend → Resend | ✅ Built (`src/lib/email.ts`) |
| **Auth** | Confirm account, reset password | Supabase Auth | ⚠️ Needs custom SMTP → Resend |

Right now both are **no-ops / rate-limited** until you do the steps below. The app
works without them; email just switches on when configured.

---

## STEP 1 — Buy a domain (the one thing that unlocks everything)

You cannot send branded email from `vercel.app`. Buy a cheap domain (~$10/yr):
- Namecheap, Cloudflare, or Porkbun. Good names: `anglish.me`, `anglishai.com`.
- Keep the DNS panel handy — you'll paste records into it in Step 2.

## STEP 2 — Resend account + verify domain

1. Sign up at https://resend.com (free: 3,000 emails/month, 100/day).
2. **Domains → Add Domain** → enter your domain.
3. Resend shows 3–4 DNS records (SPF, DKIM, and a Return-Path). Copy each one
   into your domain's DNS panel. Wait for Resend to show **Verified** (minutes to a few hours).
4. **API Keys → Create** → copy the key (starts with `re_...`).

## STEP 3 — Turn on transactional email (backend)

Set these env vars on **Railway** (backend service):

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
EMAIL_DOMAIN=anglish.me            # your real domain, no https://
```

That's it — the welcome and receipt emails go live on the next deploy.
Senders default to `hello@`, `support@`, `noreply@` on that domain.
(Optional overrides: `EMAIL_FROM_SUPPORT`, `EMAIL_FROM_HELLO`, `EMAIL_FROM_NOREPLY`.)

Test: register a new account → you should get the welcome email. Make a test
purchase → you should get a receipt.

## STEP 4 — Turn on auth email (Supabase custom SMTP)

Without this, Supabase caps confirm/reset emails at ~3–4 per hour (shared pool) —
a real launch blocker. Point Supabase at Resend's SMTP:

1. Supabase Dashboard → **Project Settings → Authentication → SMTP Settings** → Enable custom SMTP.
2. Fill in:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your `re_...` API key
   - Sender email: `noreply@anglish.me`
   - Sender name: `Anglish AI`
3. Save. Under **Authentication → Email Templates**, paste the branded HTML from
   `email-templates/` (below) into "Confirm signup" and "Reset password".

## STEP 5 — Google login (OAuth)

The button + backend route already exist. Just add credentials:

1. Google Cloud Console → create an **OAuth 2.0 Client ID** (Web application).
2. Authorized redirect URI: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
   (copy the exact one from Supabase → Authentication → Providers → Google).
3. Supabase → **Authentication → Providers → Google** → paste Client ID + Secret → enable.

Free. No domain needed for this step.

---

## Cost summary

| Item | Cost |
|---|---|
| Domain | ~$10/year |
| Resend | Free (3k emails/mo), then ~$20/mo at scale |
| Google OAuth | Free |
| Supabase SMTP | Free (uses your Resend key) |

**To launch: ~$10/year total.**
