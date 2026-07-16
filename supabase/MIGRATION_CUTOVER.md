# Railway → Supabase Edge Functions — Cut-over Runbook (Phase 7)

Branch: `supabase-edge-migration`. All 8 route groups are ported and deployed as
Edge Functions (verify_jwt=false) on project **`ofojymkvrldiaeclwxgd`**:
`auth, chat, speaking, payments, admin, family, access, scheduling` (+ `health`).

The frontend was switched from calling Railway directly to calling **relative
`/api/*`**, which a Vercel rewrite proxies to
`https://ofojymkvrldiaeclwxgd.supabase.co/functions/v1/*`
(see `frontend/vercel.json` + `frontend/src/lib/apiBase.ts`).

Railway stays LIVE until the end-to-end regression below passes. Nothing here is
irreversible while `VITE_API_URL` still points at Railway.

---

## How the switch actually flips

`VITE_API_URL` is a **build-time** Vite var and is the single lever:

| `VITE_API_URL` in Vercel (Production) | Where the app's `/api/*` calls go |
|---|---|
| `https://anglish-production.up.railway.app` | **Railway** (old backend) — safe pre-cut state |
| empty / unset | **Supabase** via the `vercel.json` rewrite — the new state |

Because it is baked at build time, changing it requires a **redeploy** to take
effect. Merging the branch does NOT flip anything on its own if `VITE_API_URL`
is still set to Railway.

---

## Go-live sequence

1. **Pre-check (safe):** in Vercel → project → Settings → Environment Variables,
   confirm **Production** `VITE_API_URL = https://anglish-production.up.railway.app`.
   If it is currently empty, set it to the Railway URL first so the branch can be
   merged without flipping traffic yet.
2. **Merge** `supabase-edge-migration` → `main`. Vercel redeploys; production
   still hits Railway (thanks to step 1). Nothing changes for users yet.
3. **Stripe webhook (Anselmo — I can't touch secrets):**
   - Stripe Dashboard → Developers → Webhooks → add/point the endpoint to
     `https://ofojymkvrldiaeclwxgd.supabase.co/functions/v1/payments/webhook`.
   - Subscribe to: `checkout.session.completed`, `invoice.paid`,
     `customer.subscription.deleted`.
   - Copy the new **Signing secret** (`whsec_…`) and set it as the Edge Function
     secret **`STRIPE_WEBHOOK_SECRET`** (Supabase → Project → Edge Functions →
     Secrets). A new endpoint = a new secret; the old Railway one won't verify.
   - Keep the old Railway webhook endpoint enabled until cut-over is confirmed,
     then disable it.
4. **Flip:** set Production `VITE_API_URL` to **empty** (delete the value) and
   **redeploy**. Production now calls `/api/*` → Vercel rewrite → Supabase.
5. **Regression (see checklist below).**
6. **Only after it all passes:** disable the old Stripe Railway endpoint and
   **pause/stop the Railway service**.

## Rollback (fast)

Set Production `VITE_API_URL` back to
`https://anglish-production.up.railway.app` and redeploy. Traffic returns to
Railway immediately. (Revert the Stripe webhook secret too if step 3 was done.)

---

## End-to-end regression checklist (do on the deployed site, real account)

Auth (login/signup/Google/reset) is **direct to Supabase Auth**, not the
backend, so it is unaffected — but confirm it still works. The rest goes through
the rewrite:

- [ ] **Chat**: send a message (`/api/chat/message`), streaming reply
  (`/api/chat/stream` — watch it stream, not arrive all at once), translate,
  correct, and the daily usage counter (`/api/chat/usage`).
- [ ] **Speaking**: Talk (transcribe → respond → TTS), Group chat, usage counter,
  and a **Phone Call** (`/api/speaking/realtime-session` mints the token; the
  WebRTC call itself is browser↔OpenAI and does not go through us).
- [ ] **Payments**: run a real Stripe test checkout (`/api/payments/checkout`),
  complete it, and confirm the webhook applied the plan (profile `plan` /
  `access_end` updated) and the receipt email fired.
- [ ] **Access code**: redeem a code (`/api/access/redeem`) and the promo lookup
  (`/api/access/code-info`).
- [ ] **Admin panel**: students list/stats/edit, costs, codes, activity.
- [ ] **Family** (if a Family-plan account exists): list/create/edit/remove.
- [ ] Watch the browser Network tab: `/api/*` calls should be same-origin, 2xx,
  and **not** served from an unexpected cache.

## Notes / known gaps

- **Scheduling**: the Express `POST /api/scheduling` never worked (wrong columns
  + anon vs. RLS); the Edge port fixes it, but the frontend booking form uses a
  `wa.me` link and does not call the endpoint. Nothing to test in the UI.
- **Twilio / WhatsApp notify** (scheduling): still a no-op — `TWILIO_*` /
  `ADMIN_WHATSAPP` were never set. Ported via fetch, so it will work if those
  secrets are added later.
- **Cost rates** (`/api/admin/costs`): `COST_*` env vars aren't set on Supabase,
  so the default estimate rates apply (same as Railway, which also lacked them).
- **Local dev** is unchanged: `VITE_API_URL` empty → Vite proxy → `localhost:4000`
  (local Express). Once Railway is retired, point the Vite proxy at Supabase or a
  local Supabase stack.
