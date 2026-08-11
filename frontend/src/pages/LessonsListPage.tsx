import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpen, Lock, CheckCircle, ChevronRight, Star,
  PlayCircle, AlertCircle,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useAuth } from '../lib/AuthContext'
import { unlockPaceLabel } from '../lib/plans'
import { loadProgress, getMaxStage, getMistakes, getAllMistakesCount } from '../lib/exerciseProgress'
import {
  LESSON_SEQUENCE, MONTH_INFO, getLesson,
  DAYS_PER_MONTH, WEEK_INFO, userUnlockedCount,
} from '../lib/lessonData'
import { useLongPress } from '../hooks/useLongPress'
import { hapticTap } from '../lib/haptics'
import { LessonShareSheet } from '../components/LessonShareSheet'
import type { ShareableLesson } from '../lib/share'

// ── Visual config for each month ──────────────────────────────────────────────
// Emoji fallback for months that don't yet have a custom 3D mascot illustration.
const MONTH_EMOJIS = ['🏆', '💬', '🌍', '⏰', '📖', '🔗', '💭', '🎯', '🎨', '✨', '🎓', '🏅']

// Custom 3D mascot illustrations (background removed) live in
// /public/mascots/full/monthNN.png — one per month, per the course order.
const MONTH_IMAGES: Record<number, string> = {
  1: '/mascots/full/month01.png',
  2: '/mascots/full/month02.png',
  3: '/mascots/full/month03.png',
  4: '/mascots/full/month04.png',
  5: '/mascots/full/month05.png',
  6: '/mascots/full/month06.png',
  7: '/mascots/full/month07.png',
  8: '/mascots/full/month08.png',
  9: '/mascots/full/month09.png',
  10: '/mascots/full/month10.png',
  11: '/mascots/full/month11.png',
  12: '/mascots/full/month12.png',
}

// Precomputed 0-indexed [start, end) of each month in LESSON_SEQUENCE
const MONTH_BOUNDS = (() => {
  const b: { start: number; end: number }[] = []
  let pos = 0
  for (const d of DAYS_PER_MONTH) {
    b.push({ start: pos, end: pos + d })
    pos += d
  }
  return b
})()

type MonthStatus = 'completed' | 'active' | 'locked'

// ── Main page ─────────────────────────────────────────────────────────────────
// Flat, fast list: lands directly on the current month's lessons (no map screen
// to click through). A compact row of month chips at the top switches months.
export function LessonsListPage() {
  const { user } = useAuth()

  const { unlockedCount, monthData, totalMistakes } = useMemo(() => {
    // Unlock count comes from the shared helper (lib/lessonData) so this page
    // and the Dashboard always agree. Plan/time sets the pace; an admin month
    // cap (unlock_override_month) hard-caps it to exactly months 1..N.
    const unlockedCount = userUnlockedCount(user)
    const totalMistakes = getAllMistakesCount()

    const monthData = MONTH_BOUNDS.map(({ start, end }, i) => {
      const month = i + 1
      const info = MONTH_INFO[month]
      const ids = LESSON_SEQUENCE.slice(start, end)
      const totalLessons = ids.length
      const completedInMonth = ids.filter(id => getMaxStage(id) >= 1).length

      const status: MonthStatus =
        unlockedCount >= end ? 'completed'
        : unlockedCount > start ? 'active'
        : 'locked'

      return {
        month, info, status, totalLessons, completedInMonth,
        progress: totalLessons > 0 ? completedInMonth / totalLessons : 0,
      }
    })

    return { unlockedCount, monthData, totalMistakes }
  }, [user?.created_at, user?.unlock_override_month, user?.plan])

  // Default to the month the student is currently on, so they land straight on
  // their lessons. Fall back to the last unlocked month, then month 1.
  const defaultMonth = useMemo(() => {
    const active = monthData.find(m => m.status === 'active')
    if (active) return active.month
    const lastOpen = [...monthData].reverse().find(m => m.status !== 'locked')
    return lastOpen?.month ?? 1
  }, [monthData])

  const [selected, setSelected] = useState<number | null>(null)
  const month = selected ?? defaultMonth

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="pb-28 min-h-screen"
    >
      {/* ── Header ── */}
      <div className="px-5 pt-6 pb-3 flex items-start justify-between max-w-2xl">
        <div>
          <h1 className="text-2xl font-black text-[var(--text)]">Your Journey</h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">
            {unlockedCount} / {LESSON_SEQUENCE.length} lessons · {unlockPaceLabel(user?.plan)}
          </p>
        </div>
        {/* Mistakes pill */}
        {totalMistakes > 0 && (
          <Link to="/mistakes">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1.5 mt-1"
            >
              <span className="text-red-400 text-xs font-black">⚡ {totalMistakes} fix</span>
            </motion.div>
          </Link>
        )}
      </div>

      {/* ── Month chips (horizontal selector) ── */}
      <MonthChips monthData={monthData} selected={month} onSelect={setSelected} />

      {/* ── Selected month's lessons ── */}
      <MonthLessons key={month} month={month} unlockedCount={unlockedCount} />
    </motion.div>
  )
}

// ── Horizontal month selector ─────────────────────────────────────────────────
function MonthChips({
  monthData, selected, onSelect,
}: {
  monthData: Array<{ month: number; info: any; status: MonthStatus }>
  selected: number
  onSelect: (m: number) => void
}) {
  return (
    <div className="px-4 pb-1">
      <div className="flex flex-wrap gap-1.5 max-w-2xl">
        {monthData.map(m => {
          const accent = m.info?.accent ?? '#6b7280'
          const isLocked = m.status === 'locked'
          const isSel = m.month === selected
          return (
            <button
              key={m.month}
              disabled={isLocked}
              onClick={() => !isLocked && onSelect(m.month)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full border-2 text-xs font-bold whitespace-nowrap transition-all',
                isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              )}
              style={
                isSel
                  ? { background: `${accent}22`, borderColor: accent, color: accent }
                  : { background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }
              }
            >
              {isLocked ? <Lock size={11} /> : <span className="text-sm leading-none">{MONTH_EMOJIS[m.month - 1]}</span>}
              <span>Month {m.month}</span>
              {m.status === 'completed' && <CheckCircle size={12} className="text-green-500" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── A month's lessons, grouped by week ────────────────────────────────────────
function MonthLessons({
  month, unlockedCount,
}: {
  month: number
  unlockedCount: number
}) {
  const info = MONTH_INFO[month]
  const accent = info?.accent ?? '#6b7280'
  const { start, end } = MONTH_BOUNDS[month - 1]

  // Lesson currently being shared (long-press → bottom sheet). null = closed.
  const [shareTarget, setShareTarget] = useState<ShareableLesson | null>(null)

  const { lessons, weekGroups, inProgress } = useMemo(() => {
    const lessons = LESSON_SEQUENCE.slice(start, end).map((id, localIdx) => {
      const lesson = getLesson(id)
      const globalIdx = start + localIdx
      return {
        ...lesson,
        globalIdx,
        unlocked: globalIdx < unlockedCount,
        completed: getMaxStage(id) >= 1,
      }
    })

    const weekGroups = lessons.reduce<Record<number, typeof lessons>>((acc, l) => {
      ;(acc[l.week] ??= []).push(l)
      return acc
    }, {})

    const inProgress = lessons
      .map(l => {
        const p = loadProgress(l.id)
        return p && !p.done && l.unlocked
          ? { id: l.id, title: l.title, stage: p.stage, idx: p.idx, xpEarned: p.xpEarned }
          : null
      })
      .filter(Boolean) as Array<{ id: string; title: string; stage: number; idx: number; xpEarned: number }>

    return { lessons, weekGroups, inProgress }
  }, [month, unlockedCount, start, end])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen"
    >
      {/* Month title row */}
      <div className="px-4 pt-4 pb-1 flex items-center gap-3 max-w-2xl">
        {MONTH_IMAGES[month] ? (
          <img src={MONTH_IMAGES[month]} alt="" draggable={false}
            className="w-9 h-9 object-contain flex-shrink-0 select-none" />
        ) : (
          <span className="text-2xl">{MONTH_EMOJIS[month - 1]}</span>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-[var(--text)] text-sm leading-tight truncate">
            Month {month} · {info?.title}
          </h2>
          <p className="text-xs text-[var(--text-muted)] leading-tight truncate">{info?.subtitle}</p>
        </div>
        <span
          className="flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border"
          style={{ color: accent, borderColor: `${accent}66`, background: `${accent}18` }}
        >
          {info?.level}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mx-4 mt-2 h-1 rounded-full bg-[var(--bg-elev)] max-w-2xl">
        <motion.div
          className="h-full rounded-full"
          style={{ background: accent }}
          initial={{ width: 0 }}
          animate={{
            width: `${(lessons.filter(l => l.completed).length / (lessons.length || 1)) * 100}%`,
          }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      <div className="px-4 pt-5 space-y-6 max-w-2xl">
        {/* Continue where you left off */}
        {inProgress.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Continue where you left off
            </p>
            <div className="space-y-2">
              {inProgress.map(ex => (
                <Link key={ex.id} to={`/exercises/${ex.id}`}>
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ x: 4 }}
                    className="flex items-center gap-4 p-4 rounded-2xl border border-purple-400/30 bg-purple-500/8 hover:bg-purple-500/12 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                      <PlayCircle size={18} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[var(--text)] text-sm truncate">{ex.title}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Stage {ex.stage} · {ex.xpEarned} XP so far
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-purple-400 font-semibold">Continue</span>
                      <ChevronRight size={16} className="text-purple-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Weeks */}
        {Object.entries(weekGroups).map(([weekStr, weekLessons]) => {
          const week = Number(weekStr)
          const wInfo = WEEK_INFO[week]
          const anyUnlocked = weekLessons.some(l => l.unlocked)
          const allDone = weekLessons.every(l => l.completed)

          return (
            <div key={week}>
              {/* Week header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-[var(--border)]" />
                <div className="text-center">
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    {wInfo?.title ?? `Week ${week}`}
                  </span>
                  {wInfo?.subtitle && (
                    <p className="text-[10px] text-[var(--text-muted)] opacity-60 mt-0.5 leading-tight">
                      {wInfo.subtitle}
                    </p>
                  )}
                </div>
                {allDone && anyUnlocked && (
                  <div className="flex-shrink-0">
                    <CheckCircle size={14} className="text-green-500" />
                  </div>
                )}
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>

              {!anyUnlocked && (
                <p className="text-xs text-[var(--text-muted)] text-center py-2 opacity-50">
                  🔒 Locked - come back when you reach this week
                </p>
              )}

              <div className="space-y-2">
                {weekLessons.map((lesson, i) => (
                  <motion.div
                    key={lesson.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    {lesson.unlocked ? (
                      <UnlockedLessonRow lesson={lesson} onShare={setShareTarget} />
                    ) : (
                      <div className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] opacity-35 cursor-not-allowed">
                        <div className="w-10 h-10 rounded-xl bg-[var(--bg-elev)] flex items-center justify-center flex-shrink-0">
                          <Lock size={16} className="text-[var(--text-muted)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[var(--text-muted)] text-sm truncate">
                            {lesson.title}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            Locked · Day {lesson.globalIdx + 1} of course
                          </p>
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">+{lesson.xp} XP</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Long-press share sheet */}
      <LessonShareSheet lesson={shareTarget} onClose={() => setShareTarget(null)} />
    </motion.div>
  )
}

// ── An unlocked lesson row: tap to open, press-and-hold to share ───────────────
function UnlockedLessonRow({
  lesson, onShare,
}: {
  lesson: {
    id: string; title: string; topic: string; level: string
    xp: number; day: number; completed: boolean
  }
  onShare: (l: ShareableLesson) => void
}) {
  const longPress = useLongPress(() => {
    hapticTap() // little buzz so the hold is felt, like WhatsApp
    onShare({ id: lesson.id, title: lesson.title, topic: lesson.topic, level: lesson.level })
  })

  return (
    <Link
      to={`/lessons/${lesson.id}`}
      title="Hold to share"
      // Suppress iOS Safari's long-press link preview/callout so only our
      // share sheet appears on hold.
      style={{ WebkitTouchCallout: 'none' }}
      {...longPress}
    >
      <motion.div
        whileHover={{ x: 3 }}
        className={cn(
          'flex items-center gap-4 p-4 rounded-2xl border transition-all group select-none',
          lesson.completed
            ? 'bg-green-500/5 border-green-500/20 hover:border-green-500/40'
            : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-purple-400/30 hover:bg-purple-500/5'
        )}
      >
        <LessonIcon day={lesson.day} completed={lesson.completed} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--text)] text-sm truncate">
            {lesson.title}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {lesson.topic} · +{lesson.xp} XP
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(() => {
            const mc = getMistakes(lesson.id).length
            return mc > 0 ? (
              <Link
                to={`/exercises/${lesson.id}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/30 px-2 py-0.5 rounded-full hover:bg-red-400/20 transition-all"
              >
                <AlertCircle size={10} /> {mc}
              </Link>
            ) : null
          })()}
          {lesson.completed
            ? <CheckCircle size={16} className="text-green-500" />
            : <ChevronRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors" />
          }
        </div>
      </motion.div>
    </Link>
  )
}

// ── Lesson day icon ───────────────────────────────────────────────────────────
function LessonIcon({ day, completed }: { day: number; completed: boolean }) {
  if (completed) return (
    <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center flex-shrink-0">
      <CheckCircle size={18} className="text-green-500" />
    </div>
  )
  if (day === 7) return (
    <div className="w-10 h-10 rounded-xl bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
      <Star size={18} className="text-yellow-400" />
    </div>
  )
  return (
    <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-400/20 flex items-center justify-center flex-shrink-0">
      <BookOpen size={16} className="text-purple-400" />
    </div>
  )
}
