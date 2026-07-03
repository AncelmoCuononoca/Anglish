-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe (EUR / card) payments support.
--   1. New plan_enum values so paid Basic and Family+Tutor are distinct from the
--      free tier / entry Family tier (they map to different limits in plans.ts).
--   2. profiles.stripe_customer_id so renewals + cancellations can find the user.
-- Non-destructive: only adds enum values and a nullable column.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE plan_enum ADD VALUE IF NOT EXISTS 'basic';
ALTER TYPE plan_enum ADD VALUE IF NOT EXISTS 'family_tutor';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Only the backend service key writes this column; students never touch it, so
-- no extra column GRANT to `authenticated` is added (they keep no write access).
