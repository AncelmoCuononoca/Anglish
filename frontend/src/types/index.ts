export type UserRole = 'student' | 'admin'

export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export type PlanType = 'free' | 'monthly' | 'annual' | 'power_all_access' | 'family' | 'doctor_english'

export type LearnerGoal = 'work' | 'travel' | 'daily' | 'school' | 'exam' | 'other'

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  role: UserRole
  plan: PlanType
  level: Level
  xp: number
  streak: number
  longest_streak: number
  lessons_completed: number
  created_at: string
  // ── Admin-managed access control (added by admin_and_access_control migration) ──
  suspended?: boolean
  access_start?: string | null      // ISO date - paid period starts
  access_end?: string | null        // ISO date - paid period ends (null = no limit)
  unlock_override_month?: number | null  // admin forces months 1..N open
  goal?: LearnerGoal | null          // onboarding objective
  goal_detail?: string | null        // specific work area / custom focus
}

// One student row as returned by the admin API
export interface AdminStudent {
  id: string
  email: string
  name: string
  role: UserRole
  plan: PlanType
  level: Level
  xp: number
  streak: number
  longest_streak: number
  lessons_completed: number
  speaking_minutes: number
  last_active_date: string | null
  suspended: boolean
  access_start: string | null
  access_end: string | null
  unlock_override_month: number | null
  goal: LearnerGoal | null
  goal_detail: string | null
  created_at: string
}

export interface Lesson {
  id: string
  title: string
  description: string
  level: Level
  week: number
  day: number
  topic: string
  content: string
  is_locked: boolean
  is_completed: boolean
  xp_reward: number
  unlock_date?: string
}

export interface Exercise {
  id: string
  lesson_id: string
  type: ExerciseType
  question: string
  options?: string[]
  correct_answer: string
  explanation?: string
  xp_reward: number
}

export type ExerciseType =
  | 'sentence_building'
  | 'translation'
  | 'matching'
  | 'pronunciation'
  | 'grammar'
  | 'comprehension'
  | 'shadowing'
  | 'dictionary'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  condition: string
  xp_reward: number
  unlocked_at?: string
}

export interface Avatar {
  id: string
  name: string
  accent: string
  country: string
  flag: string
  description: string
  preview_url: string
  voice_id: string
}

export interface ScheduledLesson {
  id: string
  student_id: string
  student_name: string
  student_email: string
  whatsapp: string
  level: Level
  preferred_date: string
  status: 'pending' | 'confirmed' | 'cancelled'
  notes?: string
  created_at: string
}

export interface DailyGoal {
  xp_target: number
  xp_earned: number
  lessons_target: number
  lessons_done: number
  speaking_minutes: number
  speaking_done: number
}

export interface LeaderboardEntry {
  rank: number
  user_id: string
  name: string
  avatar_url?: string
  xp: number
  streak: number
  level: Level
}
