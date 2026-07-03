import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Users, ShieldCheck, Search, X, Unlock, CalendarClock,
  Ban, CheckCircle, Crown, GraduationCap, UserPlus, Phone, RotateCcw,
  Flame, Trophy, Clock, DollarSign,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/utils'
import {
  fetchStudents, fetchStats, updateStudent, createStudent,
  resetPhoneCall, fetchPhoneCalls, fetchActivity, fetchCosts,
  type AdminStats, type StudentUpdate, type NewStudent,
  type ActivityResponse, type DayActivity, type CostsResponse,
} from '../lib/adminApi'
import type { AdminStudent, PlanType, Level, LearnerGoal } from '../types'

const PLANS: { value: PlanType; label: string }[] = [
  { value: 'free',             label: 'Free' },
  { value: 'monthly',          label: 'Monthly' },
  { value: 'annual',           label: 'Annual' },
  { value: 'power_all_access', label: 'Power (All Access)' },
  { value: 'family',           label: 'Family' },
  { value: 'doctor_english',   label: 'Doctor English' },
]
const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const GOALS: { value: LearnerGoal; label: string }[] = [
  { value: 'work',   label: 'Work' },
  { value: 'travel', label: 'Travel' },
  { value: 'daily',  label: 'Daily life' },
  { value: 'school', label: 'School' },
  { value: 'exam',   label: 'Exam' },
  { value: 'other',  label: 'Other' },
]

const planColor = (p: PlanType) =>
  p === 'doctor_english' ? '#00FF88'
  : p === 'free' ? '#64748b'
  : '#7F77DD'

function accessState(s: AdminStudent): { label: string; color: string } {
  if (s.suspended) return { label: 'Suspended', color: '#FF006E' }
  if (!s.access_end) return { label: 'No limit', color: '#00D4FF' }
  const today = new Date().toISOString().slice(0, 10)
  if (s.access_end < today) return { label: 'Expired', color: '#FF006E' }
  const days = Math.ceil((new Date(s.access_end).getTime() - Date.now()) / 86_400_000)
  if (days <= 7) return { label: `${days}d left`, color: '#FFB020' }
  return { label: `until ${s.access_end}`, color: '#00FF88' }
}

export function AdminPage() {
  const [students, setStudents] = useState<AdminStudent[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AdminStudent | null>(null)
  const [creating, setCreating] = useState(false)
  const [costs, setCosts] = useState<CostsResponse | null>(null)
  const [costDays, setCostDays] = useState(30)

  useEffect(() => {
    fetchCosts(costDays).then(setCosts).catch(() => setCosts(null))
  }, [costDays])

  const load = async () => {
    setLoading(true)
    try {
      const [s, st] = await Promise.all([fetchStudents(), fetchStats().catch(() => null)])
      setStudents(s)
      if (st) setStats(st)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load students. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter(s =>
      s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
  }, [students, query])

  const onSaved = (updated: AdminStudent) => {
    setStudents(prev => prev.map(s => (s.id === updated.id ? updated : s)))
    setEditing(null)
    load() // refresh stats
  }

  const statCards = [
    { label: 'Total Students', value: stats?.totalStudents, icon: Users,        color: '#7F77DD' },
    { label: 'Paid Plans',     value: stats?.paidStudents,  icon: Crown,        color: '#00FF88' },
    { label: 'Expiring ≤7d',   value: stats?.expiringSoon,  icon: CalendarClock, color: '#FFB020' },
    { label: 'Suspended',      value: stats?.suspended,     icon: Ban,          color: '#FF006E' },
  ]

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <ShieldCheck size={24} className="text-pink" /> Admin Panel
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage students, plans, and access.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={load}>Refresh</Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus size={15} className="mr-1.5" /> New student
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map(({ label, value, icon: Icon, color }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <div className="text-2xl font-black text-white">{value ?? (loading ? '…' : 0)}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* AI spend (estimated from stored usage) */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#00FF8818', border: '1px solid #00FF8830' }}>
              <DollarSign size={17} style={{ color: '#00FF88' }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Estimated AI spend</div>
              <div className="text-xs text-slate-500">Last {costDays} days · estimates from usage</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-black text-green">${costs?.totalUsd?.toFixed(2) ?? '—'}</div>
              <div className="text-[11px] text-slate-500">total</div>
            </div>
            <div className="flex gap-1">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setCostDays(d)}
                  className={cn('text-xs px-2 py-1 rounded-lg border transition-colors',
                    costDays === d ? 'border-green/50 text-green bg-green/10' : 'border-white/10 text-slate-400 hover:text-white')}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
        {costs && costs.users.length > 0 ? (
          <div className="divide-y divide-white/5">
            {costs.users.slice(0, 6).map(u => (
              <div key={u.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate">{u.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {Math.round(u.realtimeSeconds / 60)}m call · {Math.round(u.speakingSeconds / 60)}m speak · {u.chatMessages} chat
                  </div>
                </div>
                <div className="text-green font-semibold">${u.costUsd.toFixed(2)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">{costs ? 'No usage yet in this period.' : 'Loading…'}</p>
        )}
      </Card>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full bg-bg-elevated border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple/50"
        />
      </div>

      {/* Students list */}
      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading students…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No students found.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(s => {
              const acc = accessState(s)
              return (
                <button
                  key={s.id}
                  onClick={() => setEditing(s)}
                  className="w-full flex items-center gap-3 p-3.5 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-purple-cyan flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {s.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
                      {s.name}
                      {s.role === 'admin' && <Crown size={12} className="text-gold flex-shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{s.email}</div>
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                      style={{ background: `${planColor(s.plan)}1a`, color: planColor(s.plan) }}>
                      {PLANS.find(p => p.value === s.plan)?.label ?? s.plan}
                    </span>
                    <span className="text-[11px] font-semibold" style={{ color: acc.color }}>
                      {acc.label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 w-12 text-right">{s.level}</div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <AnimatePresence>
        {editing && (
          <StudentEditor
            student={editing}
            onClose={() => setEditing(null)}
            onSaved={onSaved}
          />
        )}
        {creating && (
          <CreateStudentModal
            onClose={() => setCreating(false)}
            onCreated={(s) => {
              setStudents(prev => [s, ...prev])
              setCreating(false)
              load()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Student editor modal ──────────────────────────────────────────────────────
function StudentEditor({
  student, onClose, onSaved,
}: {
  student: AdminStudent
  onClose: () => void
  onSaved: (s: AdminStudent) => void
}) {
  const [form, setForm] = useState<StudentUpdate>({
    plan: student.plan,
    role: student.role,
    level: student.level,
    suspended: student.suspended,
    access_start: student.access_start,
    access_end: student.access_end,
    unlock_override_month: student.unlock_override_month,
    goal: student.goal,
    goal_detail: student.goal_detail,
  })
  const [saving, setSaving] = useState(false)
  const [calls, setCalls] = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    fetchPhoneCalls(student.id).then(r => setCalls(r.used)).catch(() => setCalls(null))
  }, [student.id])

  const resetCall = async () => {
    setResetting(true)
    try {
      await resetPhoneCall(student.id)
      setCalls(0)
      toast.success('Phone Call reset - they can call again this week')
    } catch {
      toast.error('Could not reset Phone Call')
    } finally {
      setResetting(false)
    }
  }

  const set = <K extends keyof StudentUpdate>(k: K, v: StudentUpdate[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const updated = await updateStudent(student.id, form)
      toast.success('Student updated')
      onSaved(updated)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  // Quick presets for the paid access window
  const setWindowDays = (days: number) => {
    const start = new Date()
    const end = new Date(Date.now() + days * 86_400_000)
    set('access_start', start.toISOString().slice(0, 10))
    set('access_end', end.toISOString().slice(0, 10))
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-bg-card border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-bg-card border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h2 className="font-bold text-white truncate">{student.name}</h2>
            <p className="text-xs text-slate-500 truncate">{student.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Progress snapshot (read-only) */}
          <div className="grid grid-cols-4 gap-2">
            <Stat icon={Trophy} color="#7F77DD" label="XP" value={student.xp} />
            <Stat icon={Flame} color="#FF6B35" label="Streak" value={`${student.streak}d`} />
            <Stat icon={CheckCircle} color="#00FF88" label="Lessons" value={student.lessons_completed} />
            <Stat icon={Clock} color="#00D4FF" label="Speak" value={`${student.speaking_minutes}m`} />
          </div>
          <p className="text-[11px] text-slate-500 -mt-2">
            Joined {student.created_at.slice(0, 10)}
            {student.last_active_date ? ` · last active ${student.last_active_date}` : ' · never active'}
            {` · best streak ${student.longest_streak}d`}
          </p>

          {/* Day-by-day activity - which days they actually studied */}
          <ActivityCalendar studentId={student.id} />


          {/* Phone Call (weekly) control */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-bg-elevated">
            <Phone size={18} className="text-green flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Phone Call this week</div>
              <div className="text-[11px] text-slate-500">
                {calls === null ? 'Loading…' : calls > 0 ? `Used (${calls}/1) - locked until next week` : 'Available'}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={resetCall} disabled={resetting || calls === 0}>
              <RotateCcw size={13} className="mr-1.5" /> Reset
            </Button>
          </div>

          {/* Plan */}
          <Field label="Plan">
            <div className="grid grid-cols-2 gap-2">
              {PLANS.map(p => (
                <Chip key={p.value} active={form.plan === p.value} onClick={() => set('plan', p.value)}>
                  {p.value === 'doctor_english' && <GraduationCap size={13} />}
                  {p.label}
                </Chip>
              ))}
            </div>
          </Field>

          {/* Level + Goal */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Level">
              <select
                value={form.level}
                onChange={e => set('level', e.target.value as Level)}
                className="w-full bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Goal">
              <select
                value={form.goal ?? ''}
                onChange={e => set('goal', (e.target.value || null) as LearnerGoal | null)}
                className="w-full bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">-</option>
                {GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Goal detail - specific work area / custom focus (feeds the AI tutor) */}
          <Field label="Focus / work area" hint="Used to tailor AI conversations. E.g. 'Petroleum Engineering (Oil & Gas)'.">
            <input
              value={form.goal_detail ?? ''}
              onChange={e => set('goal_detail', e.target.value || null)}
              placeholder="-"
              className="w-full bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
          </Field>

          {/* Access window */}
          <Field label="Paid access window" hint="When access_end passes, the student is locked out with a renewal notice.">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-500">Start</span>
                <input type="date" value={form.access_start ?? ''}
                  onChange={e => set('access_start', e.target.value || null)}
                  className="w-full bg-bg-elevated border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500">End</span>
                <input type="date" value={form.access_end ?? ''}
                  onChange={e => set('access_end', e.target.value || null)}
                  className="w-full bg-bg-elevated border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Chip onClick={() => setWindowDays(30)}>+1 month</Chip>
              <Chip onClick={() => setWindowDays(90)}>+3 months</Chip>
              <Chip onClick={() => setWindowDays(365)}>+1 year</Chip>
              <Chip onClick={() => { set('access_start', null); set('access_end', null) }}>No limit</Chip>
            </div>
          </Field>

          {/* Unlock override */}
          <Field label="Open lessons up to month" hint="Empty = automatic (1 lesson/day). Set a month to force-open weeks/months for this student.">
            <div className="flex flex-wrap gap-2">
              <Chip active={form.unlock_override_month == null} onClick={() => set('unlock_override_month', null)}>
                <Unlock size={13} /> Auto
              </Chip>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <Chip key={m} active={form.unlock_override_month === m} onClick={() => set('unlock_override_month', m)}>
                  M{m}
                </Chip>
              ))}
            </div>
          </Field>

          {/* Suspend + Admin role */}
          <div className="flex flex-col gap-2.5">
            <Toggle
              active={!!form.suspended}
              onClick={() => set('suspended', !form.suspended)}
              icon={form.suspended ? Ban : CheckCircle}
              color="#FF006E"
              label="Suspended"
              desc="Immediately blocks all lessons and speaking."
            />
            <Toggle
              active={form.role === 'admin'}
              onClick={() => set('role', form.role === 'admin' ? 'student' : 'admin')}
              icon={Crown}
              color="#FFB020"
              label="Administrator"
              desc="Full access to this admin panel."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-bg-card border-t border-white/10 px-5 py-3.5 flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Daily activity calendar ───────────────────────────────────────────────────
// A 30-day heatmap so the coach can see at a glance which days the student did
// exercises / speaking and which they skipped.
function ActivityCalendar({ studentId }: { studentId: string }) {
  const [data, setData] = useState<ActivityResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchActivity(studentId, 30)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [studentId])

  const cellColor = (d: DayActivity) => {
    if (!d.active) return 'rgba(255,255,255,0.06)'
    const intensity = d.lessons + (d.speakingSeconds > 0 ? 1 : 0)
    if (intensity >= 3) return '#00FF88'
    if (intensity === 2) return '#00FF88aa'
    return '#00FF8866'
  }

  const tip = (d: DayActivity) => {
    if (!d.active) return `${d.date}: no activity`
    const parts: string[] = []
    if (d.lessons) parts.push(`${d.lessons} lesson${d.lessons > 1 ? 's' : ''}`)
    if (d.speakingSeconds) parts.push(`${Math.round(d.speakingSeconds / 60)}m speaking`)
    return `${d.date}: ${parts.join(' · ')}`
  }

  const activeDays = data?.activity.filter(d => d.active).length ?? 0

  return (
    <div className="p-3 rounded-xl border border-white/10 bg-bg-elevated">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <CalendarClock size={15} className="text-cyan" /> Daily activity
        </div>
        {!loading && data && (
          <div className="text-[11px] text-slate-400">{activeDays}/30 days active</div>
        )}
      </div>
      {loading ? (
        <div className="text-[11px] text-slate-500">Loading activity…</div>
      ) : !data ? (
        <div className="text-[11px] text-slate-500">Could not load activity.</div>
      ) : (
        <>
          <div className="grid grid-cols-10 gap-1">
            {data.activity.map(d => (
              <div
                key={d.date}
                title={tip(d)}
                className="aspect-square rounded-sm"
                style={{ background: cellColor(d) }}
              />
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-2">
            Last 30 days · green = did lessons / speaking that day · oldest left → today right
          </div>
        </>
      )}
    </div>
  )
}

// ── Small UI primitives ───────────────────────────────────────────────────────
function Stat({ icon: Icon, color, label, value }: { icon: typeof Trophy; color: string; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-bg-elevated p-2.5 text-center">
      <Icon size={15} className="mx-auto mb-1" style={{ color }} />
      <div className="text-sm font-black text-white leading-none">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">{label}</label>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5 mb-2 leading-snug">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
        active
          ? 'bg-purple/20 border-purple/60 text-white'
          : 'bg-bg-elevated border-white/10 text-slate-300 hover:border-white/20'
      }`}
    >
      {children}
    </button>
  )
}

function Toggle({
  active, onClick, icon: Icon, color, label, desc,
}: {
  active: boolean; onClick: () => void; icon: typeof Ban; color: string; label: string; desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
        active ? 'border-white/20' : 'border-white/5 bg-bg-elevated'
      }`}
      style={active ? { background: `${color}14`, borderColor: `${color}55` } : {}}
    >
      <Icon size={18} style={{ color: active ? color : '#64748b' }} />
      <div className="flex-1">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-[11px] text-slate-500">{desc}</div>
      </div>
      <div className={`w-10 h-6 rounded-full p-0.5 transition-colors ${active ? '' : 'bg-white/10'}`}
        style={active ? { background: color } : {}}>
        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${active ? 'translate-x-4' : ''}`} />
      </div>
    </button>
  )
}

// ── Create student modal ──────────────────────────────────────────────────────
// Lets the admin create an account directly (email confirmed, temp password to
// share with the student). The student can change the password later.
function CreateStudentModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (s: AdminStudent) => void
}) {
  const [form, setForm] = useState<NewStudent>({ email: '', password: '', name: '', plan: 'free', level: 'A1' })
  const [saving, setSaving] = useState(false)

  const genPassword = () =>
    setForm(f => ({ ...f, password: Math.random().toString(36).slice(-4) + Math.random().toString(36).slice(-4).toUpperCase() + '!' }))

  const submit = async () => {
    if (!form.email || !form.password || !form.name) {
      toast.error('Fill name, email and password')
      return
    }
    setSaving(true)
    try {
      const s = await createStudent(form)
      toast.success(`Account created for ${s.name}`)
      onCreated(s)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-bg-card border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-bg-card border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="font-bold text-white flex items-center gap-2"><UserPlus size={18} className="text-purple" /> New student</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Name">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Student's name"
              className="w-full bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="student@email.com"
              className="w-full bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
          </Field>
          <Field label="Temporary password" hint="Share this with the student - they can change it later.">
            <div className="flex gap-2">
              <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="At least 6 characters"
                className="flex-1 bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
              <Button size="sm" variant="secondary" onClick={genPassword}>Generate</Button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Plan">
              <select value={form.plan}
                onChange={e => setForm(f => ({ ...f, plan: e.target.value as PlanType }))}
                className="w-full bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Level">
              <select value={form.level}
                onChange={e => setForm(f => ({ ...f, level: e.target.value as Level }))}
                className="w-full bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Access until (optional)" hint="Leave empty for no time limit.">
            <input type="date" value={form.access_end ?? ''}
              onChange={e => setForm(f => ({ ...f, access_end: e.target.value || null }))}
              className="w-full bg-bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
          </Field>
        </div>

        <div className="sticky bottom-0 bg-bg-card border-t border-white/10 px-5 py-3.5 flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="flex-1">
            {saving ? 'Creating…' : 'Create account'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
