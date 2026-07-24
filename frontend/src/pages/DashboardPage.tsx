import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { XPBar } from '../components/gamification/XPBar'
import { StreakBadge } from '../components/gamification/StreakBadge'
import { getLevelColor, getLevelLabel } from '../lib/utils'
import { useAuth } from '../lib/AuthContext'
import { getLeaderboard } from '../lib/auth'
import { buildLeaderboard, type MergedEntry } from '../lib/leaderboard'
import { LESSON_SEQUENCE, WEEK_INFO, getLesson, userUnlockedCount } from '../lib/lessonData'
import { getMaxStage } from '../lib/exerciseProgress'
import {
  BookOpen, Mic, Trophy, Target, ChevronRight,
  Lock, CheckCircle, Play, Flame, Star, Zap, Clock, KeyRound, X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { RedeemCodeModal } from '../components/RedeemCodeModal'

const LEVEL_XP_RANGES: Record<string, [number, number]> = {
  A1: [0, 500], A2: [500, 1500], B1: [1500, 3000],
  B2: [3000, 5000], C1: [5000, 8000], C2: [8000, 10000],
}

const achievements = [
  { icon: '🔥', name: 'First Streak', desc: '7 days in a row', unlocked: false },
  { icon: '⚡', name: 'Quick Learner', desc: 'Complete 10 lessons', unlocked: false },
  { icon: '🎤', name: 'Voice Star', desc: '30 min speaking AI', unlocked: false },
  { icon: '🏆', name: 'Top 10', desc: 'Reach top 10 ranking', unlocked: false },
]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.4 } }),
}

type RawEntry = { id: string; name: string; xp: number; streak: number; level: string; avatar_url?: string }

export function DashboardPage() {
  const { user } = useAuth()
  const [rawLeaderboard, setRawLeaderboard] = useState<RawEntry[]>([])
  const [showRedeem, setShowRedeem] = useState(false)

  // Trial / paid-window banner: how many days of access are left. Admins and
  // lifetime accounts (no access_end) get no banner.
  const trialDaysLeft = useMemo(() => {
    if (!user || user.role === 'admin' || !user.access_end) return null
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const end = new Date(user.access_end + 'T00:00:00Z')
    const days = Math.round((end.getTime() - today.getTime()) / 86_400_000)
    return days >= 0 ? days : 0
  }, [user])

  // The access / redeem card is shown once (first session) or as an end-of-access
  // reminder in the last 3 days. After the first view it is marked "seen" so it
  // won't reappear on later sessions — the code is always available under Plans.
  const [accessDismissed, setAccessDismissed] = useState(false)
  const alreadySeen = useMemo(() => {
    try { return localStorage.getItem('anglish-access-card-seen') === '1' } catch { return false }
  }, [])
  const showAccessCard =
    trialDaysLeft !== null && !accessDismissed && (trialDaysLeft <= 3 || !alreadySeen)
  useEffect(() => {
    if (showAccessCard && !alreadySeen) {
      try { localStorage.setItem('anglish-access-card-seen', '1') } catch { /* ignore */ }
    }
  }, [showAccessCard, alreadySeen])

  useEffect(() => {
    getLeaderboard().then(setRawLeaderboard).catch(() => {})
  }, [])

  // ── Enrollment-based daily unlock ─────────────────────────────────────────
  const { unlockedCount, currentIndex, currentWeek, weekLessons, nextUnlockStr, lessonsCompleted } = useMemo(() => {
    const enrolledAt = user?.created_at ? new Date(user.created_at) : new Date()
    // Same unlock rule as the Lessons page (plan/time pacing + admin month cap),
    // so the two screens always show the same "X / total" number.
    const unlockedCount = userUnlockedCount(user)

    // First unlocked lesson that hasn't been completed
    const currentIndex = LESSON_SEQUENCE.findIndex((id, i) => i < unlockedCount && getMaxStage(id) === 0)
    const activeIndex = currentIndex >= 0 ? currentIndex : unlockedCount - 1
    const currentLesson = getLesson(LESSON_SEQUENCE[activeIndex] ?? 'w1d1')
    const currentWeek = currentLesson.week

    // All lessons in current week with computed state
    const weekLessons = LESSON_SEQUENCE
      .map((id, globalIdx) => ({ ...getLesson(id), globalIdx }))
      .filter(l => l.week === currentWeek)
      .map(l => ({
        ...l,
        isUnlocked: l.globalIdx < unlockedCount,
        completed: getMaxStage(l.id) >= 1,
        isCurrent: l.globalIdx === currentIndex,
      }))

    // Next-unlock hint. The precise daily countdown only fits the 1-lesson/day
    // drip; when an admin has capped this student to a month, or everything is
    // already open, show a status line instead of a misleading timer.
    const cap = user?.unlock_override_month ?? null
    const nextUnlockAt = new Date(enrolledAt.getTime() + unlockedCount * 86_400_000)
    const ms = Math.max(0, nextUnlockAt.getTime() - Date.now())
    const h = Math.floor(ms / 3_600_000)
    const m = Math.floor((ms % 3_600_000) / 60_000)
    const nextUnlockStr =
      unlockedCount >= LESSON_SEQUENCE.length ? 'All lessons unlocked!'
      : cap != null ? `Unlocked through month ${cap}`
      : `${h}h ${m}m until next lesson`

    const lessonsCompleted = LESSON_SEQUENCE.filter(id => getMaxStage(id) >= 1).length

    return { unlockedCount, currentIndex, currentWeek, weekLessons, nextUnlockStr, lessonsCompleted }
  }, [user?.created_at, user?.plan, user?.unlock_override_month])

  // ── Derived display values ─────────────────────────────────────────────────
  const levelKey = user?.level ?? 'A1'
  const levelColor = getLevelColor(levelKey)
  const xp = user?.xp ?? 0
  const streak = user?.streak ?? 0
  const name = user?.name ?? 'Student'
  const [, xpMax] = LEVEL_XP_RANGES[levelKey] ?? [0, 500]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const weekInfo = WEEK_INFO[currentWeek] ?? { title: `Week ${currentWeek}`, subtitle: '' }
  const dayInWeek = weekLessons.filter(l => l.isUnlocked).length
  const currentLessonData = currentIndex >= 0 ? getLesson(LESSON_SEQUENCE[currentIndex]) : null

  // Merged leaderboard (real users + NPCs), sorted by XP
  const mergedLeaderboard = useMemo(
    () => buildLeaderboard(rawLeaderboard, user?.id),
    [rawLeaderboard, user?.id]
  )

  // Top 4 to show in dashboard snippet (always include "you" if outside top 4)
  const leaderboardDisplay = useMemo((): MergedEntry[] => {
    if (!mergedLeaderboard.length) return []
    const top4 = mergedLeaderboard.slice(0, 4)
    const alreadyIncluded = top4.some(e => e.isMe)
    if (!alreadyIncluded) {
      const myEntry = mergedLeaderboard.find(e => e.isMe)
      if (myEntry) return [...top4.slice(0, 3), myEntry]
    }
    return top4
  }, [mergedLeaderboard])

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-white mb-1">
              {greeting}, {name} 👋
            </h1>
            <p className="text-slate-400 text-sm">
              {streak > 0
                ? `You're on a ${streak}-day streak. Keep it up!`
                : 'Start your learning streak today!'}
            </p>
          </div>
          <StreakBadge streak={streak} size="lg" />
        </div>
      </motion.div>

      {/* Learn with real people + AI — top hero card (same on desktop and mobile) */}
      <motion.div custom={0.05} initial="hidden" animate="show" variants={fadeUp} className="mb-6">
        <div className="bg-bg-card border border-white/5 rounded-2xl overflow-hidden flex flex-col sm:flex-row">
          <img
            src="/founders/founders-office-light.jpg"
            alt="Anselmo Aldair and the Anglish Me team"
            className="w-full h-40 sm:h-auto sm:w-52 object-cover flex-shrink-0"
          />
          <div className="p-5 flex flex-col justify-center flex-1">
            <div className="font-bold text-white mb-1">Learn with real people + AI</div>
            <p className="text-sm text-slate-400 mb-3">
              Anselmo and the team are here to help, book a live 1-on-1 session whenever you
              need a human touch.
            </p>
            <div>
              <Link to="/schedule">
                <Button size="sm" variant="secondary">Book a live class</Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Access / redeem card — first session only, or an end-of-access reminder */}
      {showAccessCard && (
        <motion.div custom={0.1} initial="hidden" animate="show" variants={fadeUp} className="mb-6">
          <div className="relative bg-gradient-to-r from-purple/10 to-cyan/10 border border-cyan/20 rounded-2xl p-4 pr-10">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan/15 flex items-center justify-center flex-shrink-0">
                <KeyRound size={18} className="text-cyan" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">
                  {user?.plan === 'free'
                    ? ((trialDaysLeft ?? 0) > 0 ? `Período de teste, ${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia' : 'dias'} restantes` : 'O teu teste termina hoje')
                    : `Acesso ativo, ${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia' : 'dias'} restantes`}
                </div>
                <div className="text-xs text-slate-400">Tens um código de acesso? Resgata-o para desbloquear mais tempo.</div>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <button
                    onClick={() => setShowRedeem(true)}
                    className="flex items-center gap-2 bg-gradient-purple-cyan text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
                  >
                    <KeyRound size={15} /> Resgatar código
                  </button>
                  <Link to="/plans" className="text-xs text-cyan hover:text-cyan/80 font-medium">Ver planos</Link>
                </div>
              </div>
            </div>
            <button
              onClick={() => setAccessDismissed(true)}
              aria-label="Fechar"
              className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}

      <div className="flex flex-col gap-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 order-3">
        {[
          { label: 'Total XP',     value: xp.toLocaleString(),          icon: Zap,      color: '#00D4FF' },
          { label: 'Streak',       value: `${streak} days`,              icon: Flame,    color: '#FFD700' },
          { label: 'Lessons Done', value: lessonsCompleted,              icon: BookOpen, color: '#7F77DD' },
          { label: 'Level',        value: levelKey,                      icon: Star,     color: levelColor },
        ].map(({ label, value, icon: Icon, color }, i) => (
          <motion.div key={label} custom={i * 0.05} initial="hidden" animate="show" variants={fadeUp}>
            <Card className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}
              >
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <div className="text-lg font-black text-white">{value}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

        {/* Daily Goals */}
        <motion.div custom={0.2} initial="hidden" animate="show" variants={fadeUp} className="order-2">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Target size={18} className="text-cyan" /> Daily Goals
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock size={12} />
                  <span>{nextUnlockStr}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Lessons Unlocked</span>
                    <span className="text-cyan font-semibold">{unlockedCount} / {LESSON_SEQUENCE.length}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="xp-bar-fill h-full rounded-full" style={{ width: `${(unlockedCount / LESSON_SEQUENCE.length) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Lessons Completed</span>
                    <span className="text-purple font-semibold">{lessonsCompleted} / {unlockedCount}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-purple rounded-full" style={{ width: unlockedCount ? `${(lessonsCompleted / unlockedCount) * 100}%` : '0%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Week {currentWeek} Progress</span>
                    <span className="text-green font-semibold">Day {dayInWeek} / 7</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-green rounded-full" style={{ width: `${(dayInWeek / 7) * 100}%` }} />
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Level progress */}
        <motion.div custom={0.25} initial="hidden" animate="show" variants={fadeUp} className="order-4">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg"
                    style={{ background: `${levelColor}15`, border: `2px solid ${levelColor}40`, color: levelColor }}
                  >
                    {levelKey}
                  </div>
                  <div>
                    <div className="font-bold text-white">{getLevelLabel(levelKey)}</div>
                    <div className="text-xs text-slate-400">
                      {weekInfo.title}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-slate-500 bg-bg-elevated px-2 py-1 rounded-lg">
                  {xp.toLocaleString()} / {xpMax.toLocaleString()} XP
                </span>
              </div>
              <XPBar xp={xp} />
            </Card>
          </motion.div>

          {/* Week lessons */}
        <motion.div custom={0.3} initial="hidden" animate="show" variants={fadeUp} className="order-5">
            <Card>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <BookOpen size={18} className="text-purple" /> {weekInfo.title}
                </h2>
                <span className="text-xs text-slate-500">Day {dayInWeek} / 7</span>
              </div>
              <div className="space-y-2">
                {weekLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-all ${
                      lesson.isCurrent
                        ? 'bg-purple/10 border border-purple/25'
                        : lesson.completed
                        ? 'bg-bg-elevated/50 opacity-80'
                        : !lesson.isUnlocked
                        ? 'opacity-40'
                        : 'bg-bg-elevated'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {lesson.completed ? (
                        <CheckCircle size={20} className="text-green" />
                      ) : !lesson.isUnlocked ? (
                        <Lock size={20} className="text-slate-600" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-purple" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${lesson.isCurrent ? 'text-white' : 'text-slate-300'}`}>
                        Day {lesson.day} · {lesson.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{lesson.topic}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-cyan/70">+{lesson.xp} XP</span>
                      {lesson.isCurrent && (
                        <Link to={`/exercises/${lesson.id}`}>
                          <Button size="sm">
                            <Play size={14} /> Start
                          </Button>
                        </Link>
                      )}
                      {lesson.completed && (
                        <Link to={`/exercises/${lesson.id}`}>
                          <button className="text-xs text-slate-400 hover:text-cyan transition-colors">Review</button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {currentLessonData && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs text-slate-500 text-center">
                    Current lesson: <span className="text-purple font-semibold">{currentLessonData.title}</span>
                  </p>
                </div>
              )}
            </Card>
          </motion.div>

        {/* Quick actions */}
        <motion.div custom={0.35} initial="hidden" animate="show" variants={fadeUp} className="order-1">
            <Card>
              <h2 className="font-bold text-white mb-4">Quick Practice</h2>
              <div className="space-y-2.5">
                {currentLessonData && (
                  <Link to={`/exercises/${currentLessonData.id}`} className="block">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-green/10 border border-green/20 hover:border-green/40 transition-all card-hover">
                      <div className="w-9 h-9 rounded-lg bg-green/20 flex items-center justify-center">
                        <Play size={18} className="text-green" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">Today's Lesson</div>
                        <div className="text-xs text-slate-400 truncate max-w-[140px]">{currentLessonData.title}</div>
                      </div>
                      <ChevronRight size={16} className="ml-auto text-slate-500" />
                    </div>
                  </Link>
                )}
                <Link to="/speaking" className="block">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-purple/10 border border-purple/20 hover:border-purple/40 transition-all card-hover">
                    <div className="w-9 h-9 rounded-lg bg-purple/20 flex items-center justify-center">
                      <Mic size={18} className="text-purple" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Speaking</div>
                      <div className="text-xs text-slate-400">Practise speaking</div>
                    </div>
                    <ChevronRight size={16} className="ml-auto text-slate-500" />
                  </div>
                </Link>
                <Link to="/chat" className="block">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan/10 border border-cyan/20 hover:border-cyan/40 transition-all card-hover">
                    <div className="w-9 h-9 rounded-lg bg-cyan/20 flex items-center justify-center">
                      <BookOpen size={18} className="text-cyan" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Chat Tutor</div>
                      <div className="text-xs text-slate-400">Ask a grammar question</div>
                    </div>
                    <ChevronRight size={16} className="ml-auto text-slate-500" />
                  </div>
                </Link>
              </div>
            </Card>
          </motion.div>

          {/* Achievements */}
        <motion.div custom={0.4} initial="hidden" animate="show" variants={fadeUp} className="order-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Star size={16} className="text-gold" /> Achievements
                </h2>
                <span className="text-xs text-slate-500">
                  {achievements.filter(a => a.unlocked).length} / {achievements.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {achievements
                  .map(a => ({
                    ...a,
                    unlocked: a.name === 'First Streak' ? streak >= 7 : a.unlocked,
                  }))
                  .map(({ icon, name, desc, unlocked }) => (
                    <div
                      key={name}
                      className={`p-3 rounded-xl text-center transition-all ${
                        unlocked
                          ? 'bg-gold/10 border border-gold/25'
                          : 'bg-bg-elevated border border-white/5 opacity-50'
                      }`}
                    >
                      <div className="text-2xl mb-1">{icon}</div>
                      <div className={`text-xs font-bold ${unlocked ? 'text-gold' : 'text-slate-400'}`}>{name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                    </div>
                  ))}
              </div>
            </Card>
          </motion.div>

          {/* Leaderboard snippet */}
        <motion.div custom={0.45} initial="hidden" animate="show" variants={fadeUp} className="order-7">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Trophy size={16} className="text-gold" /> Ranking
                </h2>
                <Link to="/leaderboard" className="text-xs text-purple hover:text-purple-light">See all</Link>
              </div>
              {leaderboardDisplay.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Loading ranking…</p>
              ) : (
                <div className="space-y-2">
                  {leaderboardDisplay.map(({ rank, name, xp, streak, isMe }) => (
                    <div
                      key={rank}
                      className={`flex items-center gap-3 p-2.5 rounded-xl ${
                        isMe ? 'bg-purple/10 border border-purple/20' : 'bg-bg-elevated/50'
                      }`}
                    >
                      <span className={`text-xs font-black w-5 text-center ${rank <= 3 ? 'text-gold' : 'text-slate-500'}`}>
                        {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-semibold ${isMe ? 'text-purple' : 'text-slate-300'}`}>
                          {isMe ? 'You' : name}
                        </div>
                        <div className="text-xs text-slate-500">🔥 {streak} days</div>
                      </div>
                      <span className="text-xs text-cyan font-mono">{xp.toLocaleString()} XP</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
        </motion.div>
      </div>

      <RedeemCodeModal open={showRedeem} onClose={() => setShowRedeem(false)} />
    </div>
  )
}
