import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { XPBar } from '../components/gamification/XPBar'
import { StreakBadge } from '../components/gamification/StreakBadge'
import { getLevelColor, getLevelLabel } from '../lib/utils'
import { useAuth } from '../lib/AuthContext'
import { LESSON_SEQUENCE } from '../lib/lessonData'
import { getMaxStage } from '../lib/exerciseProgress'
import { BookOpen, Mic, Flame, Trophy, Target, Loader2 } from 'lucide-react'

const PLAN_LABELS: Record<string, string> = {
  monthly:          'Monthly',
  annual:           'Annual',
  power_all_access: 'Power All Access',
  family:           'Family',
  doctor_english:   'Doctor English',
}

export function ProfilePage() {
  const { user, loading } = useAuth()

  const lessonsCompleted = useMemo(
    () => LESSON_SEQUENCE.filter(id => getMaxStage(id) >= 1).length,
    []
  )

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin text-purple-400" />
      </div>
    )
  }

  if (!user) return null

  const levelColor  = getLevelColor(user.level)
  const joined      = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const planLabel   = PLAN_LABELS[user.plan] ?? user.plan ?? '-'
  const longestStr  = user.longest_streak ?? 0
  const speakingMin = (user as { speaking_minutes?: number }).speaking_minutes ?? 0

  const achievements = [
    { icon: '🔥', name: 'On Fire',        desc: '7-day streak',     unlocked: user.streak >= 7 },
    { icon: '📚', name: 'Eager Learner',  desc: '5 lessons done',   unlocked: lessonsCompleted >= 5 },
    { icon: '⚡', name: 'Quick Learner',  desc: '10 lessons done',  unlocked: lessonsCompleted >= 10 },
    { icon: '🎤', name: 'Voice Star',     desc: '60 min speaking',  unlocked: speakingMin >= 60 },
    { icon: '🏆', name: 'Top 10',         desc: 'Reach top 10',     unlocked: false },
    { icon: '💎', name: 'Dedicated',      desc: '30-day streak',    unlocked: longestStr >= 30 },
  ]

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <h1 className="text-2xl font-black text-[var(--text)] mb-8">My Profile</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Profile card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-purple-cyan flex items-center justify-center text-4xl mx-auto mb-3 font-black text-white text-2xl">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <h2 className="font-bold text-[var(--text)] text-lg">{user.name}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">{user.email}</p>
            <div
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-sm font-bold mb-4"
              style={{ background: `${levelColor}15`, border: `1px solid ${levelColor}30`, color: levelColor }}
            >
              {user.level} · {getLevelLabel(user.level)}
            </div>
            <XPBar xp={user.xp} />
            <div className="mt-3 flex justify-center">
              <StreakBadge streak={user.streak} size="md" />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-3">Member since {joined}</p>
            <p className="text-xs text-[var(--text-muted)]">
              Plan: <span className="text-purple-400">{planLabel}</span>
            </p>
          </Card>
        </motion.div>

        {/* Stats + Achievements */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="md:col-span-2 space-y-4"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: BookOpen, label: 'Lessons',     value: lessonsCompleted,            color: '#7F77DD' },
              { icon: Flame,    label: 'Best Streak',  value: `${longestStr}d`,            color: '#FFD700' },
              { icon: Mic,      label: 'Speaking',     value: `${speakingMin} min`,        color: '#00D4FF' },
              { icon: Target,   label: 'Total XP',     value: user.xp.toLocaleString(),    color: '#00FF88' },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label} className="text-center p-4">
                <div className="w-9 h-9 rounded-xl mx-auto flex items-center justify-center mb-2"
                  style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <div className="text-xl font-black text-[var(--text)]">{value}</div>
                <div className="text-xs text-[var(--text-muted)]">{label}</div>
              </Card>
            ))}
          </div>

          {/* Achievements */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[var(--text)] flex items-center gap-2">
                <Trophy size={16} className="text-yellow-400" /> Achievements
              </h3>
              <span className="text-xs text-[var(--text-muted)]">
                {achievements.filter(a => a.unlocked).length} / {achievements.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {achievements.map(({ icon, name, desc, unlocked }) => (
                <div
                  key={name}
                  className={`p-3 rounded-xl text-center transition-all ${
                    unlocked
                      ? 'bg-yellow-400/10 border border-yellow-400/20'
                      : 'bg-[var(--bg-elev)] border border-[var(--border)] opacity-40'
                  }`}
                >
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className={`text-xs font-bold ${unlocked ? 'text-yellow-400' : 'text-[var(--text-muted)]'}`}>{name}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{desc}</div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
