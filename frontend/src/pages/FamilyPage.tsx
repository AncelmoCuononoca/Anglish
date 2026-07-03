import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Users, UserPlus, X, Crown, Flame, BookOpen, Trophy, Trash2, Star,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/utils'
import { useAuth } from '../lib/AuthContext'
import { hasFamilyPlan } from '../lib/plans'
import {
  fetchFamily, createMember, updateMember, removeMember,
  type FamilyResponse,
} from '../lib/familyApi'
import type { FamilyMember, Level } from '../types'

const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function randomPassword(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4).toUpperCase()
}

function lastActiveLabel(d: string | null): string {
  if (!d) return 'Never active'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days <= 0) return 'Active today'
  if (days === 1) return 'Active yesterday'
  return `Active ${days}d ago`
}

export function FamilyPage() {
  const { user } = useAuth()
  const [family, setFamily] = useState<FamilyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<FamilyMember | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setFamily(await fetchFamily())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load your family')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const full = useMemo(
    () => !!family && family.members.length >= family.max,
    [family],
  )

  if (!hasFamilyPlan(user?.plan)) {
    return (
      <div className="p-6 md:p-8 max-w-2xl">
        <Card className="text-center py-10">
          <Users size={32} className="mx-auto text-purple mb-3" />
          <h1 className="text-xl font-black text-white mb-2">Family is a Family-plan feature</h1>
          <p className="text-slate-400 text-sm mb-5">
            Upgrade to a Family plan to add up to 5 accounts and follow everyone's progress in one place.
          </p>
          <a href="/plans"><Button>See Family plans</Button></a>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Users size={24} className="text-green" /> Your Family
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {family ? `${family.members.length} of ${family.max} accounts used` : 'Loading…'}
          </p>
        </div>
        <Button size="sm" disabled={full} onClick={() => setAdding(true)}>
          <UserPlus size={15} className="mr-1.5" /> Add member
        </Button>
      </div>

      {full && (
        <p className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2 mb-4">
          Your family is full ({family?.max} accounts). Remove a member to add someone new.
        </p>
      )}

      {loading ? (
        <div className="text-center text-slate-400 text-sm py-10">Loading your family…</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {family?.members.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="h-full">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-purple-cyan flex items-center justify-center text-white font-bold flex-shrink-0">
                    {m.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white truncate">{m.name}</span>
                      {m.family_owner && <Crown size={13} className="text-gold flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{m.email}</p>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple/15 text-purple flex-shrink-0">
                    {m.level}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <Stat icon={<Star size={13} className="text-cyan" />} value={m.xp.toLocaleString()} label="XP" />
                  <Stat icon={<Flame size={13} className="text-orange-400" />} value={String(m.streak)} label="streak" />
                  <Stat icon={<BookOpen size={13} className="text-green" />} value={String(m.lessons_completed)} label="lessons" />
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                  <span className="text-[11px] text-slate-500">{lastActiveLabel(m.last_active_date)}</span>
                  {m.family_owner ? (
                    <span className="text-[11px] text-slate-600">You</span>
                  ) : (
                    <button onClick={() => setEditing(m)} className="text-[11px] text-purple hover:text-purple-light font-semibold">
                      Manage →
                    </button>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}

          {!full && (
            <button
              onClick={() => setAdding(true)}
              className="rounded-2xl border-2 border-dashed border-white/10 hover:border-purple/40 hover:bg-purple/5 transition-all flex flex-col items-center justify-center gap-2 py-8 text-slate-500 hover:text-purple min-h-[160px]"
            >
              <UserPlus size={22} />
              <span className="text-sm font-medium">Add a family member</span>
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {adding && <AddMemberModal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load() }} />}
        {editing && <ManageMemberModal member={editing} onClose={() => setEditing(null)} onChanged={() => { setEditing(null); load() }} />}
      </AnimatePresence>
    </div>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="bg-bg-elevated rounded-xl py-2">
      <div className="flex items-center justify-center gap-1 text-sm font-bold text-white">{icon}{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="bg-bg-base border border-white/10 rounded-2xl w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"><X size={18} /></button>
        <h2 className="text-lg font-black text-white mb-4">{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  )
}

const inputCls = 'w-full bg-bg-elevated border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple/50'

function AddMemberModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(randomPassword())
  const [level, setLevel] = useState<Level>('A1')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.error('Fill in name, email and a password (6+ characters).')
      return
    }
    setSaving(true)
    try {
      await createMember({ name: name.trim(), email: email.trim(), password, level })
      toast.success(`${name.split(' ')[0]} added! Share the email + password with them.`)
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add member')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Add a family member" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Email (their login)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@example.com" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Temporary password</label>
          <div className="flex gap-2">
            <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            <button onClick={() => setPassword(randomPassword())} className="text-xs text-purple border border-purple/30 rounded-xl px-3">New</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Starting level</label>
          <div className="flex gap-1.5 flex-wrap">
            {LEVELS.map((l) => (
              <button key={l} onClick={() => setLevel(l)}
                className={cn('text-xs px-2.5 py-1 rounded-lg border transition-colors',
                  level === l ? 'border-purple/50 text-purple bg-purple/10' : 'border-white/10 text-slate-400 hover:text-white')}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          They inherit your plan and access. Share the email and password so they can log in.
        </p>
        <Button className="w-full" loading={saving} onClick={submit}>Create account</Button>
      </div>
    </ModalShell>
  )
}

function ManageMemberModal({ member, onClose, onChanged }: {
  member: FamilyMember; onClose: () => void; onChanged: () => void
}) {
  const [level, setLevel] = useState<Level>(member.level)
  const [accessEnd, setAccessEnd] = useState(member.access_end ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateMember(member.id, { level, access_end: accessEnd || null })
      toast.success('Saved')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Remove ${member.name}? Their account will be deleted.`)) return
    setRemoving(true)
    try {
      await removeMember(member.id)
      toast.success(`${member.name.split(' ')[0]} removed`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove member')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <ModalShell title={`Manage ${member.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-center">
          <MiniStat icon={<Trophy size={13} className="text-cyan" />} value={member.xp.toLocaleString()} label="XP" />
          <MiniStat icon={<Flame size={13} className="text-orange-400" />} value={String(member.streak)} label="streak" />
          <MiniStat icon={<BookOpen size={13} className="text-green" />} value={String(member.lessons_completed)} label="lessons" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Level</label>
          <div className="flex gap-1.5 flex-wrap">
            {LEVELS.map((l) => (
              <button key={l} onClick={() => setLevel(l)}
                className={cn('text-xs px-2.5 py-1 rounded-lg border transition-colors',
                  level === l ? 'border-purple/50 text-purple bg-purple/10' : 'border-white/10 text-slate-400 hover:text-white')}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Access until (optional)</label>
          <input type="date" value={accessEnd} onChange={(e) => setAccessEnd(e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" loading={saving} onClick={save}>Save</Button>
          <button onClick={remove} disabled={removing}
            className="flex items-center gap-1.5 text-sm text-pink border border-pink/30 rounded-xl px-3 hover:bg-pink/10 transition-colors">
            <Trash2 size={15} /> Remove
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex-1 bg-bg-elevated rounded-xl py-2">
      <div className="flex items-center justify-center gap-1 text-sm font-bold text-white">{icon}{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  )
}
