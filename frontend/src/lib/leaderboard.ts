import { NPC_PROFILES } from './npcData'

export interface MergedEntry {
  id: string
  name: string
  xp: number
  streak: number
  level: string
  avatar_url?: string
  rank: number
  isMe: boolean
}

type RealUser = { id: string; name: string; xp: number; streak: number; level: string; avatar_url?: string }

export function buildLeaderboard(realUsers: RealUser[], currentUserId?: string): MergedEntry[] {
  const all: RealUser[] = [
    ...realUsers,
    ...NPC_PROFILES.map(n => ({ id: n.id, name: n.name, xp: n.xp, streak: n.streak, level: n.level, avatar_url: n.avatar })),
  ]

  all.sort((a, b) => b.xp - a.xp)

  return all.map((e, i) => ({
    ...e,
    rank: i + 1,
    isMe: e.id === currentUserId,
  }))
}
