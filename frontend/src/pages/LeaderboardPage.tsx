import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { Trophy, Loader2, RefreshCw } from 'lucide-react'
import { getLevelColor } from '../lib/utils'
import { getLeaderboard } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import { buildLeaderboard, type MergedEntry } from '../lib/leaderboard'

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const PODIUM_COLORS = ['#7F77DD', '#FFD700', '#CD7F32']

function Avatar({ entry, size = 'md' }: { entry: MergedEntry; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (entry.avatar_url) {
    return <img src={entry.avatar_url} alt={entry.name} className={`${sz} rounded-full object-cover flex-shrink-0`} />
  }
  return (
    <div className={`${sz} rounded-full bg-purple-500/20 flex items-center justify-center font-bold text-purple-300 flex-shrink-0`}>
      {initials(entry.name)}
    </div>
  )
}

export function LeaderboardPage() {
  const { user } = useAuth()
  const [rawEntries, setRawEntries] = useState<Array<{ id: string; name: string; xp: number; streak: number; level: string; avatar_url?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getLeaderboard()
      setRawEntries(data)
    } catch {
      setError('Could not load leaderboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const ranked = useMemo(
    () => buildLeaderboard(rawEntries, user?.id),
    [rawEntries, user?.id]
  )

  const top3 = ranked.slice(0, 3)
  const top10 = ranked.slice(0, 10)
  const myEntry = ranked.find(e => e.isMe)
  const isInTop10 = top10.some(e => e.isMe)

  // Podium order: 2nd (left), 1st (centre), 3rd (right)
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) as MergedEntry[]
  const podiumHeights = ['h-24', 'h-32', 'h-20']
  const podiumMedals  = ['🥈', '🥇', '🥉']

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-[var(--text)] mb-1 flex items-center gap-2">
            <Trophy size={24} className="text-yellow-400" /> Leaderboard
          </h1>
          <p className="text-[var(--text-muted)] text-sm">Ranked by total XP earned.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-white/20 transition-all disabled:opacity-40">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-purple-400" />
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p className="mb-3">{error}</p>
          <button onClick={() => void load()} className="text-sm text-purple-400 underline">Try again</button>
        </div>
      )}

      {!loading && !error && ranked.length > 0 && (
        <>
          {/* Podium */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {podiumOrder.map((u, podiumIdx) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: podiumIdx * 0.1 }}
                className="flex flex-col items-center"
              >
                {u.avatar_url
                  ? <img src={u.avatar_url} alt={u.name} className="w-10 h-10 rounded-full object-cover mb-2" />
                  : <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white mb-2"
                      style={{ background: PODIUM_COLORS[podiumIdx] + '40', border: `1px solid ${PODIUM_COLORS[podiumIdx]}60` }}>
                      {initials(u.name)}
                    </div>
                }
                <div className="text-xs font-bold text-[var(--text)] mb-1 text-center">{u.name.split(' ')[0]}</div>
                <div className="text-xs text-cyan-400 mb-2">{u.xp.toLocaleString()} XP</div>
                <div
                  className={`w-full ${podiumHeights[podiumIdx]} rounded-t-xl flex items-end justify-center pb-3 text-2xl`}
                  style={{ background: `${PODIUM_COLORS[podiumIdx]}20`, border: `1px solid ${PODIUM_COLORS[podiumIdx]}40` }}
                >
                  {podiumMedals[podiumIdx]}
                </div>
              </motion.div>
            ))}
          </div>

          <Card>
            <div className="space-y-1">
              {/* Top 10 */}
              {top10.map((u, i) => {
                const isMe = u.isMe
                return (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-all ${
                      isMe ? 'bg-purple-500/10 border border-purple-400/20' : 'hover:bg-[var(--bg-elev)]'
                    }`}
                  >
                    <span className="w-6 text-center text-sm font-black text-[var(--text-muted)]">
                      {u.rank <= 3 ? ['🥇', '🥈', '🥉'][u.rank - 1] : u.rank}
                    </span>
                    <Avatar entry={u} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${isMe ? 'text-purple-400' : 'text-[var(--text)]'}`}>
                        {u.name} {isMe && <span className="text-xs font-normal opacity-70">(you)</span>}
                      </div>
                      <div className="text-xs flex items-center gap-2 text-[var(--text-muted)]">
                        <span style={{ color: getLevelColor(u.level) }}>{u.level}</span>
                        {u.streak > 0 && <span>🔥 {u.streak}d</span>}
                      </div>
                    </div>
                    <span className="text-sm text-cyan-400 font-mono font-bold">{u.xp.toLocaleString()}</span>
                  </motion.div>
                )
              })}

              {/* If user is outside top 10, show separator + their position */}
              {!isInTop10 && myEntry && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="h-px flex-1 border-t border-dashed border-[var(--border)]" />
                    <span className="text-xs text-[var(--text-muted)]">your position</span>
                    <div className="h-px flex-1 border-t border-dashed border-[var(--border)]" />
                  </div>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-4 p-3 rounded-xl bg-purple-500/10 border border-purple-400/20"
                  >
                    <span className="w-6 text-center text-sm font-black text-[var(--text-muted)]">{myEntry.rank}</span>
                    <Avatar entry={myEntry} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-purple-400">
                        {myEntry.name} <span className="text-xs font-normal opacity-70">(you)</span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)]" style={{ color: getLevelColor(myEntry.level) }}>
                        {myEntry.level}
                      </div>
                    </div>
                    <span className="text-sm text-cyan-400 font-mono font-bold">{myEntry.xp.toLocaleString()}</span>
                  </motion.div>
                </>
              )}

              {/* Edge case: user not in leaderboard at all (new user, 0 XP, not in merged list somehow) */}
              {!isInTop10 && !myEntry && user && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="h-px flex-1 border-t border-dashed border-[var(--border)]" />
                    <span className="text-xs text-[var(--text-muted)]">your position</span>
                    <div className="h-px flex-1 border-t border-dashed border-[var(--border)]" />
                  </div>
                  <div className="flex items-center gap-4 p-3 rounded-xl bg-purple-500/10 border border-purple-400/20">
                    <span className="w-6 text-center text-sm font-black text-[var(--text-muted)]">-</span>
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-300 flex-shrink-0">
                      {initials(user.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-purple-400">
                        {user.name} <span className="text-xs font-normal opacity-70">(you)</span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)]" style={{ color: getLevelColor(user.level) }}>{user.level}</div>
                    </div>
                    <span className="text-sm text-cyan-400 font-mono font-bold">{(user.xp ?? 0).toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
