-- ============================================================
--  ANGLISH AI - Row Level Security (RLS)
--  Cola após o schema.sql
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Cada utilizador só lê/edita o próprio perfil
CREATE POLICY "profiles: owner select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: owner update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin vê tudo (usa a claim 'role' no JWT)
CREATE POLICY "profiles: admin select all"
  ON public.profiles FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "profiles: admin update all"
  ON public.profiles FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'admin');

-- ── lessons ──────────────────────────────────────────────────
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- Qualquer utilizador autenticado lê lições
CREATE POLICY "lessons: authenticated read"
  ON public.lessons FOR SELECT
  TO authenticated USING (TRUE);

-- Só admin escreve
CREATE POLICY "lessons: admin write"
  ON public.lessons FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- ── exercises ────────────────────────────────────────────────
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercises: authenticated read"
  ON public.exercises FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "exercises: admin write"
  ON public.exercises FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- ── user_lesson_progress ─────────────────────────────────────
ALTER TABLE public.user_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progress: owner all"
  ON public.user_lesson_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "progress: admin read"
  ON public.user_lesson_progress FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

-- ── achievements ─────────────────────────────────────────────
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements: public read"
  ON public.achievements FOR SELECT
  TO authenticated USING (TRUE);

-- ── user_achievements ────────────────────────────────────────
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_achievements: owner read"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_achievements: admin read"
  ON public.user_achievements FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

-- ── scheduled_lessons ────────────────────────────────────────
ALTER TABLE public.scheduled_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled: owner read"
  ON public.scheduled_lessons FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "scheduled: insert authenticated"
  ON public.scheduled_lessons FOR INSERT
  TO authenticated WITH CHECK (TRUE);

CREATE POLICY "scheduled: admin all"
  ON public.scheduled_lessons FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- ── daily_xp_log ─────────────────────────────────────────────
ALTER TABLE public.daily_xp_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xp_log: owner all"
  ON public.daily_xp_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
--  HELPER FUNCTIONS (chamadas pelo backend com service key)
-- ============================================================

-- Adiciona XP e atualiza streak
CREATE OR REPLACE FUNCTION public.add_xp(
  p_user_id UUID,
  p_xp      INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today     DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  v_last_date DATE;
  v_streak    INTEGER;
BEGIN
  -- Regista o XP diário
  INSERT INTO public.daily_xp_log (user_id, date, xp_earned)
  VALUES (p_user_id, v_today, p_xp)
  ON CONFLICT (user_id, date) DO UPDATE
    SET xp_earned = daily_xp_log.xp_earned + p_xp;

  -- Calcula streak
  SELECT last_active_date, streak
    INTO v_last_date, v_streak
    FROM public.profiles
   WHERE id = p_user_id;

  IF v_last_date = v_today THEN
    -- já jogou hoje, só soma XP
    UPDATE public.profiles
       SET xp = xp + p_xp
     WHERE id = p_user_id;
  ELSIF v_last_date = v_yesterday THEN
    -- dia consecutivo - incrementa streak
    UPDATE public.profiles
       SET xp              = xp + p_xp,
           streak          = streak + 1,
           longest_streak  = GREATEST(longest_streak, streak + 1),
           last_active_date = v_today
     WHERE id = p_user_id;
  ELSE
    -- streak quebrado (ou primeiro acesso)
    UPDATE public.profiles
       SET xp              = xp + p_xp,
           streak          = 1,
           last_active_date = v_today
     WHERE id = p_user_id;
  END IF;
END;
$$;

-- Promove utilizador a admin (chamado manualmente pelo fundador)
CREATE OR REPLACE FUNCTION public.set_admin_role(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
   WHERE id = p_user_id;
END;
$$;

-- Leaderboard (top 50 por XP)
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit INT DEFAULT 50)
RETURNS TABLE (
  rank   BIGINT,
  id     UUID,
  name   VARCHAR,
  level  level_enum,
  xp     INTEGER,
  streak INTEGER,
  avatar_url TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ROW_NUMBER() OVER (ORDER BY xp DESC) AS rank,
    id, name, level, xp, streak, avatar_url
  FROM public.profiles
  ORDER BY xp DESC
  LIMIT p_limit;
$$;
