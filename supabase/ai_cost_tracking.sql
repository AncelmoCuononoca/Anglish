-- Real per-user AI spend tracking.
--
-- Each edge function records the ACTUAL USD cost of every OpenAI call, computed
-- from the returned token usage (chat), audio duration (whisper) or character
-- count (tts). Phone Call / Realtime audio flows browser<->OpenAI directly, so
-- the server never sees its tokens: that cost is a per-minute ESTIMATE recorded
-- when the client reports call seconds. The admin /costs panel reads this table
-- for real per-person + total spend (replaces the old flat-rate estimate).

create table if not exists public.ai_cost_daily (
  user_id      uuid not null references auth.users(id) on delete cascade,
  usage_date   date not null default (now() at time zone 'utc')::date,
  chat_usd     numeric(12,6) not null default 0,
  speaking_usd numeric(12,6) not null default 0,
  realtime_usd numeric(12,6) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, usage_date)
);

-- Deny-all to clients (RLS on, no policies) — only the service_role (edge
-- functions) reads/writes it, same pattern as rate_limit_hits / access_codes.
alter table public.ai_cost_daily enable row level security;

-- Atomic upsert-increment so concurrent calls never lose a write.
create or replace function public.add_ai_cost(
  p_user     uuid,
  p_chat     numeric default 0,
  p_speaking numeric default 0,
  p_realtime numeric default 0
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_cost_daily (user_id, usage_date, chat_usd, speaking_usd, realtime_usd, updated_at)
  values (p_user, (now() at time zone 'utc')::date,
          coalesce(p_chat, 0), coalesce(p_speaking, 0), coalesce(p_realtime, 0), now())
  on conflict (user_id, usage_date) do update set
    chat_usd     = public.ai_cost_daily.chat_usd     + coalesce(p_chat, 0),
    speaking_usd = public.ai_cost_daily.speaking_usd + coalesce(p_speaking, 0),
    realtime_usd = public.ai_cost_daily.realtime_usd + coalesce(p_realtime, 0),
    updated_at   = now();
$$;

revoke all on function public.add_ai_cost(uuid, numeric, numeric, numeric) from public;
grant execute on function public.add_ai_cost(uuid, numeric, numeric, numeric) to service_role;
