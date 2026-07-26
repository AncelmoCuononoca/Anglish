import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sun, Moon, Sunset, Bell, BookOpen,
  Volume2, Target, LogOut, ChevronRight, Check,
  User, Lock, FileText, Shield, Eye, EyeOff, Pencil,
} from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'
import { useAuth } from '../lib/AuthContext'
import { signOut, updateDisplayName, changePassword } from '../lib/auth'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { cn } from '../lib/utils'
import { InstallAppButton } from '../components/InstallAppButton'

// ─── Sub-components ───────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={cn('relative w-11 h-6 rounded-full transition-colors duration-200', checked ? 'bg-purple-500' : 'bg-white/10')}>
      <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 px-1">{title}</p>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden divide-y divide-[var(--border)]">
        {children}
      </div>
    </div>
  )
}

function Row({ icon: Icon, label, description, right, onClick }: {
  icon: React.ElementType; label: string; description?: string
  right: React.ReactNode; onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { onClick } : {})}
      className={cn('w-full flex items-center gap-4 px-4 py-3.5', onClick && 'hover:bg-white/3 transition-colors')}
    >
      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-[var(--text-muted)]" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-[var(--text)]">{label}</p>
        {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      {right}
    </Tag>
  )
}

// ─── Inline edit field ────────────────────────────────────────────────────────
function EditableNameRow({ currentName, onSave }: { currentName: string; onSave: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentName)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!value.trim() || value.trim() === currentName) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(value.trim())
      setEditing(false)
    } finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-4 px-4 py-3.5">
        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
          <User size={15} className="text-[var(--text-muted)]" />
        </div>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 bg-[var(--bg-elev)] border border-purple-400/40 rounded-lg px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-purple-400"
          maxLength={50}
        />
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1">Cancel</button>
          <button onClick={() => void save()} disabled={saving}
            className="text-xs bg-purple-500 text-white rounded-lg px-3 py-1 hover:bg-purple-400 transition-colors disabled:opacity-50">
            {saving ? '…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
        <User size={15} className="text-[var(--text-muted)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text)]">Display Name</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{currentName}</p>
      </div>
      <button onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] hover:border-white/20 rounded-lg px-2.5 py-1.5 transition-all">
        <Pencil size={12} /> Edit
      </button>
    </div>
  )
}

function ChangePasswordRow() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (newPw !== confirm) { toast.error('Passwords do not match'); return }
    setSaving(true)
    try {
      await changePassword(newPw)
      toast.success('Password updated successfully')
      setOpen(false); setCurrent(''); setNewPw(''); setConfirm('')
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to update password')
    } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-4 px-4 py-3.5">
        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
          <Lock size={15} className="text-[var(--text-muted)]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--text)]">Password</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">••••••••</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] hover:border-white/20 rounded-lg px-2.5 py-1.5 transition-all">
          <Pencil size={12} /> Change
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={14} className="text-[var(--text-muted)]" />
        <p className="text-sm font-medium text-[var(--text)]">Change Password</p>
      </div>
      {/* Current password field - present for UX context, not validated client-side (Supabase session covers auth) */}
      <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)}
        className="w-full bg-[var(--bg-elev)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-purple-400/60" />
      <div className="relative">
        <input type={showNew ? 'text' : 'password'} placeholder="New password (min 8 chars)" value={newPw} onChange={e => setNewPw(e.target.value)}
          className="w-full bg-[var(--bg-elev)] border border-[var(--border)] rounded-xl px-3 py-2.5 pr-10 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-purple-400/60" />
        <button type="button" onClick={() => setShowNew(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]">
          {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      <input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)}
        className="w-full bg-[var(--bg-elev)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-purple-400/60" />
      <div className="flex gap-2 pt-1">
        <button onClick={() => { setOpen(false); setCurrent(''); setNewPw(''); setConfirm('') }}
          className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
          Cancel
        </button>
        <button onClick={() => void save()} disabled={saving || !newPw || !confirm}
          className="flex-1 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-400 transition-colors disabled:opacity-40">
          {saving ? 'Saving…' : 'Update Password'}
        </button>
      </div>
    </div>
  )
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { user, refresh } = useAuth()
  const navigate = useNavigate()

  const [notifications, setNotifications] = useState(true)
  const [soundFx, setSoundFx] = useState(true)
  const [autoPlay, setAutoPlay] = useState(false)
  const [dailyGoal, setDailyGoal] = useState<'10' | '20' | '30'>('20')
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try { await signOut(); navigate('/auth', { replace: true }) }
    catch { toast.error('Failed to sign out'); setLoggingOut(false) }
  }

  const handleSaveName = async (name: string) => {
    try {
      await updateDisplayName(name)
      await refresh()
      toast.success('Name updated')
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to update name')
      throw e
    }
  }

  const themeOptions = [
    { id: 'dark',  icon: Moon,   label: 'Dark' },
    { id: 'light', icon: Sun,    label: 'Light' },
    { id: 'auto',  icon: Sunset, label: 'Auto (sunset)' },
  ] as const

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-[var(--text)] mb-1">Settings</h1>
        <p className="text-[var(--text-muted)] text-sm">Customise your learning experience</p>
      </div>

      {/* Appearance */}
      <Section title="Appearance">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
              {resolvedTheme === 'dark' ? <Moon size={15} className="text-[var(--text-muted)]" /> : <Sun size={15} className="text-[var(--text-muted)]" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text)]">Theme</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {theme === 'auto' ? 'Switches automatically at sunset' : `${resolvedTheme === 'dark' ? 'Dark' : 'Light'} mode active`}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {themeOptions.map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTheme(id)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all',
                  theme === id ? 'border-purple-400 bg-purple-500/10 text-purple-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-white/20 hover:text-[var(--text)]'
                )}>
                <Icon size={18} />
                {label}
                {theme === id && <Check size={11} className="text-purple-400" />}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <Row icon={Bell} label="Daily reminder" description="Receive a reminder to study every day"
          right={<Toggle checked={notifications} onChange={setNotifications} />} />
      </Section>

      {/* Learning */}
      <Section title="Learning">
        <Row icon={Volume2} label="Sound effects" description="Play sounds on correct/wrong answers"
          right={<Toggle checked={soundFx} onChange={setSoundFx} />} />
        <Row icon={Volume2} label="Auto-play audio" description="Automatically read new sentences aloud"
          right={<Toggle checked={autoPlay} onChange={setAutoPlay} />} />
        <div className="flex items-center gap-4 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <Target size={15} className="text-[var(--text-muted)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text)]">Daily XP goal</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">XP you want to earn per day</p>
          </div>
          <div className="flex gap-1.5">
            {(['10', '20', '30'] as const).map(g => (
              <button key={g} onClick={() => setDailyGoal(g)}
                className={cn('w-10 h-8 rounded-lg text-xs font-semibold border transition-all',
                  dailyGoal === g ? 'border-cyan-400 text-cyan-400 bg-cyan-400/10' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-white/20')}>
                {g}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* App */}
      <Section title="App">
        <InstallAppButton />
      </Section>

      {/* History */}
      <Section title="History">
        <button onClick={() => navigate('/history')}
          className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors">
          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <BookOpen size={15} className="text-[var(--text-muted)]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-[var(--text)]">Session history</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">View and retry past sessions</p>
          </div>
          <ChevronRight size={16} className="text-[var(--text-muted)]" />
        </button>
      </Section>

      {/* Profile */}
      <Section title="Profile">
        {user && (
          <EditableNameRow currentName={user.name} onSave={handleSaveName} />
        )}
        <div className="flex items-center gap-4 px-4 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <User size={15} className="text-[var(--text-muted)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text)]">Email</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{user?.email}</p>
          </div>
        </div>
        <ChangePasswordRow />
      </Section>

      {/* Account & Security */}
      <Section title="Account & Security">
        <Link to="/terms" className="flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors">
          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <FileText size={15} className="text-[var(--text-muted)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text)]">Terms of Service</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Read our terms and conditions</p>
          </div>
          <ChevronRight size={16} className="text-[var(--text-muted)]" />
        </Link>
        <Link to="/privacy" className="flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors">
          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <Shield size={15} className="text-[var(--text-muted)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text)]">Privacy Policy</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">How we handle your data</p>
          </div>
          <ChevronRight size={16} className="text-[var(--text-muted)]" />
        </Link>
      </Section>

      {/* Logout */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => void handleLogout()}
        disabled={loggingOut}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl border border-red-500/25 bg-red-500/5 text-red-400 font-semibold text-sm hover:bg-red-500/10 hover:border-red-500/40 transition-all disabled:opacity-50 mt-2"
      >
        <LogOut size={17} />
        {loggingOut ? 'Signing out…' : 'Sign out'}
      </motion.button>

      <p className="text-center text-xs text-[var(--text-muted)] mt-6">Anglish Me · v1.0.0</p>
    </div>
  )
}
