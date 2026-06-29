import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, RotateCcw, CheckCircle, ChevronRight, Calendar } from 'lucide-react'
import { cn } from '../lib/utils'

export interface SessionRecord {
  id: string
  lessonId: string
  lessonTitle: string
  date: string          // ISO
  score: number         // 0–100
  xpEarned: number
  stage: 1 | 2 | 3
  stagesCompleted: number
}

const STORAGE_KEY = 'anglish-session-history'

export function saveSession(record: Omit<SessionRecord, 'id' | 'date'>) {
  const existing: SessionRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  const entry: SessionRecord = { ...record, id: Date.now().toString(), date: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing].slice(0, 100)))
}

export function getSessions(): SessionRecord[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
}

function scoreColor(s: number) {
  if (s >= 80) return 'text-green'
  if (s >= 50) return 'text-gold'
  return 'text-pink'
}

export function SessionHistoryPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [filter, setFilter] = useState<'all' | 'today' | 'week'>('all')

  useEffect(() => { setSessions(getSessions()) }, [])

  const today = new Date().toDateString()
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

  const filtered = sessions.filter(s => {
    if (filter === 'today') return new Date(s.date).toDateString() === today
    if (filter === 'week')  return new Date(s.date).getTime() >= weekAgo
    return true
  })

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white mb-1">Histórico de Sessões</h1>
        <p className="text-slate-400 text-sm">Vê e repete qualquer sessão anterior</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'today', 'week'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-4 py-1.5 rounded-xl text-xs font-medium border transition-all',
              filter === f ? 'border-purple bg-purple/10 text-purple' : 'border-white/10 text-slate-400 hover:border-white/20')}>
            {f === 'all' ? 'Tudo' : f === 'today' ? 'Hoje' : 'Esta semana'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Calendar size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma sessão {filter !== 'all' ? 'neste período' : 'ainda'}.</p>
          <Link to="/lessons" className="text-purple text-sm mt-2 block hover:underline">Começa agora →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="flex items-center gap-4 bg-bg-card border border-white/5 rounded-2xl p-4">
              <div className="w-10 h-10 rounded-xl bg-purple/10 border border-purple/20 flex items-center justify-center flex-shrink-0">
                <BookOpen size={16} className="text-purple" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{s.lessonTitle}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500">{formatDate(s.date)}</span>
                  <span className="text-slate-700">·</span>
                  <span className="text-xs text-cyan">+{s.xpEarned} XP</span>
                  <span className="text-slate-700">·</span>
                  <span className={cn('text-xs font-semibold', scoreColor(s.score))}>{s.score}%</span>
                  {s.stagesCompleted >= 2 && <span className="text-xs text-gold">★ Avançado</span>}
                  {s.stagesCompleted >= 3 && <span className="text-xs text-pink">★ Expert</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.score === 100 && <CheckCircle size={15} className="text-green" />}
                <Link to={`/exercises/${s.lessonId}`}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl px-3 py-1.5 transition-all">
                  <RotateCcw size={12} /> Repetir
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <Link to="/exercises/w1d4"
          className="inline-flex items-center gap-2 text-sm text-purple hover:text-purple-light border border-purple/20 hover:border-purple/40 rounded-xl px-4 py-2 transition-all">
          <BookOpen size={14} /> Ir para os exercícios de hoje <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  )
}
