import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, RotateCcw, Mic, AlertCircle, Sparkles } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getMistakes, resolveMistake, type SpeakingMistake } from '../lib/speakingApi'
import { cn } from '../lib/utils'

const CATEGORY_COLORS: Record<string, string> = {
  grammar: '#7F77DD', vocabulary: '#00D4FF', pronunciation: '#FF6B35',
  word_order: '#FF006E', other: '#94a3b8',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  // Always include the numeric date so it's clear WHICH day, not just "Today".
  const numeric = d.toLocaleDateString(undefined, {
    day: '2-digit', month: 'short',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
  if (sameDay(d, today)) return `Today · ${numeric}`
  if (sameDay(d, yest)) return `Yesterday · ${numeric}`
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function SpeakingReviewPage() {
  const { session } = useAuth()
  const [mistakes, setMistakes] = useState<SpeakingMistake[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open'>('open')

  const load = useCallback(async () => {
    setLoading(true)
    setMistakes(await getMistakes(session?.access_token))
    setLoading(false)
  }, [session])

  useEffect(() => { void load() }, [load])

  const toggle = async (m: SpeakingMistake) => {
    setMistakes(prev => prev.map(x => x.id === m.id ? { ...x, resolved: !x.resolved } : x))
    await resolveMistake(m.id, !m.resolved, session?.access_token)
  }

  const shown = mistakes.filter(m => filter === 'all' || !m.resolved)
  const openCount = mistakes.filter(m => !m.resolved).length

  // Group by calendar day
  const groups: { label: string; items: SpeakingMistake[] }[] = []
  for (const m of shown) {
    const label = fmtDate(m.created_at)
    const g = groups.find(x => x.label === label)
    if (g) g.items.push(m); else groups.push({ label, items: [m] })
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <Link to="/speaking" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-6">
        <ArrowLeft size={15} /> Back to Speaking
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white mb-1 flex items-center gap-2"><Mic size={20} className="text-purple" /> Speaking Mistakes</h1>
          <p className="text-slate-400 text-sm">Errors the tutors corrected - review them by date and study.</p>
        </div>
        <div className="flex gap-2">
          {(['open', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('text-xs px-3 py-1.5 rounded-lg border transition-all capitalize',
                filter === f ? 'border-purple/40 text-purple bg-purple/10' : 'border-white/10 text-slate-400')}>
              {f === 'open' ? `To review (${openCount})` : 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm py-20 text-center">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-6xl mb-4">{filter === 'open' ? '🌟' : '🎤'}</div>
          <h2 className="text-xl font-black text-white mb-2">{filter === 'open' ? 'Nothing to review!' : 'No mistakes yet'}</h2>
          <p className="text-slate-400 max-w-xs text-sm">
            {filter === 'open'
              ? 'You\'ve reviewed all your speaking mistakes. Keep practicing!'
              : 'Have a conversation in Speaking and your corrections will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <div key={group.label}>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{group.label}</h2>
              <div className="space-y-3">
                {group.items.map(m => {
                  const color = CATEGORY_COLORS[m.category ?? 'other'] ?? CATEGORY_COLORS.other
                  return (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className={cn('rounded-2xl border p-4 transition-all',
                        m.resolved ? 'border-white/5 bg-bg-card/40 opacity-60' : 'border-white/10 bg-bg-card')}>
                      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                            style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                            {(m.category ?? 'other').replace('_', ' ')}
                          </span>
                          {m.tutor && <span className="text-[11px] text-slate-500 capitalize">{m.tutor}</span>}
                          <span className="text-[11px] text-slate-600">{fmtTime(m.created_at)}</span>
                        </div>
                        <button onClick={() => void toggle(m)}
                          className={cn('flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all',
                            m.resolved ? 'border-white/10 text-slate-400 hover:text-white' : 'border-green/30 text-green hover:bg-green/10')}>
                          {m.resolved ? <><RotateCcw size={12} /> Reopen</> : <><Check size={12} /> Got it</>}
                        </button>
                      </div>
                      <div className="flex items-start gap-2 mb-1.5">
                        <AlertCircle size={14} className="text-pink mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-slate-400 line-through decoration-pink/50">{m.mistake}</p>
                      </div>
                      <div className="flex items-start gap-2 mb-2">
                        <Check size={14} className="text-green mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-white font-medium">{m.correction}</p>
                      </div>
                      {m.explanation && (
                        <div className="flex items-start gap-2 mt-2 pt-2 border-t border-white/5">
                          <Sparkles size={13} className="text-cyan mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-slate-400 leading-relaxed">{m.explanation}</p>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
