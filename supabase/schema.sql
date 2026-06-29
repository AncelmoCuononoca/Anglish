-- ============================================================
--  ANGLISH AI - Supabase Schema
--  Cola este ficheiro inteiro no SQL Editor do Supabase
--  https://supabase.com/dashboard → SQL Editor → New Query
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUM types ───────────────────────────────────────────────
CREATE TYPE level_enum  AS ENUM ('A1','A2','B1','B2','C1','C2');
CREATE TYPE plan_enum   AS ENUM ('free','monthly','annual','power_all_access','family','doctor_english');
CREATE TYPE status_enum AS ENUM ('pending','confirmed','cancelled');

-- ============================================================
--  TABLE: profiles
--  Extends auth.users (created automatically by Supabase Auth)
-- ============================================================
CREATE TABLE public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           VARCHAR(255) UNIQUE NOT NULL,
  name            VARCHAR(120) NOT NULL DEFAULT '',
  avatar_url      TEXT,
  level           level_enum  NOT NULL DEFAULT 'A1',
  plan            plan_enum   NOT NULL DEFAULT 'free',
  xp              INTEGER     NOT NULL DEFAULT 0 CHECK (xp >= 0),
  streak          INTEGER     NOT NULL DEFAULT 0 CHECK (streak >= 0),
  longest_streak  INTEGER     NOT NULL DEFAULT 0,
  lessons_completed INTEGER   NOT NULL DEFAULT 0,
  speaking_minutes  INTEGER   NOT NULL DEFAULT 0,
  last_active_date  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Trigger: keep updated_at fresh ───────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Trigger: auto-create profile on signup ───────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
--  TABLE: lessons
-- ============================================================
CREATE TABLE public.lessons (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level       level_enum NOT NULL,
  week        SMALLINT   NOT NULL CHECK (week BETWEEN 1 AND 4),
  day         SMALLINT   NOT NULL CHECK (day  BETWEEN 1 AND 7),
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  topic       VARCHAR(100),
  content     JSONB NOT NULL DEFAULT '[]',
  xp_reward   INTEGER NOT NULL DEFAULT 50,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(level, week, day)
);

-- ============================================================
--  TABLE: exercises
-- ============================================================
CREATE TYPE exercise_type_enum AS ENUM (
  'multiple_choice','translation','fill_blank','matching',
  'pronunciation','grammar','comprehension','shadowing','dictionary'
);

CREATE TABLE public.exercises (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id      UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  type           exercise_type_enum NOT NULL,
  question       TEXT NOT NULL,
  options        JSONB,
  correct_answer TEXT NOT NULL,
  explanation    TEXT,
  xp_reward      INTEGER NOT NULL DEFAULT 10,
  sort_order     SMALLINT NOT NULL DEFAULT 0
);

-- ============================================================
--  TABLE: user_lesson_progress
-- ============================================================
CREATE TABLE public.user_lesson_progress (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id    UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  score        SMALLINT,           -- percentage 0-100
  completed_at TIMESTAMPTZ,
  xp_earned    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, lesson_id)
);

-- ============================================================
--  TABLE: achievements
-- ============================================================
CREATE TABLE public.achievements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        VARCHAR(60) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  icon        VARCHAR(10),
  xp_reward   INTEGER NOT NULL DEFAULT 0,
  condition   JSONB              -- e.g. {"type":"streak","value":7}
);

CREATE TABLE public.user_achievements (
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

-- ============================================================
--  TABLE: scheduled_lessons  (live class bookings)
-- ============================================================
CREATE TABLE public.scheduled_lessons (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_name   VARCHAR(120) NOT NULL,
  student_email  VARCHAR(255) NOT NULL,
  whatsapp       VARCHAR(30)  NOT NULL,
  level          level_enum   NOT NULL,
  preferred_date TIMESTAMPTZ  NOT NULL,
  status         status_enum  NOT NULL DEFAULT 'pending',
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
--  TABLE: daily_xp_log  (for streak calculation)
-- ============================================================
CREATE TABLE public.daily_xp_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  xp_earned  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

-- ============================================================
--  SEED: Achievements
-- ============================================================
INSERT INTO public.achievements (slug, name, description, icon, xp_reward, condition) VALUES
  ('first_lesson',   'First Step',      'Complete your first lesson',          '🎯', 50,  '{"type":"lessons_completed","value":1}'),
  ('streak_7',       'On Fire',         'Maintain a 7-day streak',             '🔥', 100, '{"type":"streak","value":7}'),
  ('streak_30',      'Dedicated',       'Maintain a 30-day streak',            '💎', 500, '{"type":"streak","value":30}'),
  ('lessons_10',     'Quick Learner',   'Complete 10 lessons',                 '⚡', 150, '{"type":"lessons_completed","value":10}'),
  ('lessons_50',     'Bookworm',        'Complete 50 lessons',                 '📚', 500, '{"type":"lessons_completed","value":50}'),
  ('speaking_60',    'Voice Star',      'Practice 60 minutes of Speaking AI',  '🎤', 200, '{"type":"speaking_minutes","value":60}'),
  ('xp_1000',        'XP Hunter',       'Earn 1000 total XP',                  '🏆', 100, '{"type":"xp","value":1000}'),
  ('level_a2',       'Growing Up',      'Reach level A2',                      '📈', 300, '{"type":"level","value":"A2"}'),
  ('level_b1',       'Intermediate!',   'Reach level B1',                      '🌟', 500, '{"type":"level","value":"B1"}');
