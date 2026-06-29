import type { User } from '../types'

const GOAL_PHRASE: Record<string, string> = {
  work:   'their job / career',
  travel: 'travelling',
  daily:  'everyday daily life',
  school: 'school and studying',
  exam:   'preparing for an English exam',
  other:  'a personal goal',
}

// A short instruction for the AI tutor so conversations and examples match what
// the student needs English for. Built from profiles.goal + goal_detail.
// Returns '' when no goal is set (so prompts are unchanged for older accounts).
export function buildFocus(user: User | null): string {
  if (!user?.goal) return ''
  const base = GOAL_PHRASE[user.goal] ?? 'a personal goal'
  const detail = user.goal_detail?.trim()
  if (detail) {
    return `This student is learning English mainly for ${base}, specifically: "${detail}". Whenever it fits naturally, use vocabulary, examples and role-play situations relevant to that field. Keep it appropriate to their level.`
  }
  return `This student is learning English mainly for ${base}. Whenever it fits naturally, use relevant vocabulary and examples.`
}
