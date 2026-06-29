-- ============================================================
--  Speaking AI: daily usage limits + mistake tracking
--  (Applied to project ofojymkvrldiaeclwxgd via migration
--   "speaking_usage_and_mistakes")
-- ============================================================

-- Daily usage per user (resets per calendar day)
CREATE TABLE IF NOT EXISTS public.speaking_daily_usage (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  realtime_seconds   INTEGER NOT NULL DEFAULT 0 CHECK (realtime_seconds >= 0),
  pushtotalk_seconds INTEGER NOT NULL DEFAULT 0 CHECK (pushtotalk_seconds >= 0),
  xp_awarded         BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_speaking_usage_user_date
  ON public.speaking_daily_usage(user_id, usage_date);

-- Recorded mistakes from Speaking AI conversations
CREATE TABLE IF NOT EXISTS public.speaking_mistakes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tutor        VARCHAR(40),
  mode         VARCHAR(20),
  topic        VARCHAR(120),
  mistake      TEXT NOT NULL,           -- what the student said (wrong)
  correction   TEXT NOT NULL,           -- the correct form
  explanation  TEXT,                    -- why / how to apply it
  category     VARCHAR(40),             -- grammar | vocabulary | pronunciation | word_order | other
  resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_speaking_mistakes_user_created
  ON public.speaking_mistakes(user_id, created_at DESC);

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE public.speaking_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaking_mistakes   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own usage select" ON public.speaking_daily_usage
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own usage write" ON public.speaking_daily_usage
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own mistakes select" ON public.speaking_mistakes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own mistakes write" ON public.speaking_mistakes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
