import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { ExerciseQuestion } from '../components/ExerciseQuestion'
import { ChevronRight, Trophy, Zap, BookOpen, ArrowLeft, AlertCircle } from 'lucide-react'
import { cn } from '../lib/utils'
import { getLesson, type Ex } from '../lib/lessonData'
import { getAllMistakes, clearMistake, getAllMistakesCount } from '../lib/exerciseProgress'
import { addXp } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'

// ─── Extended exercise type with lesson context ────────────────────────────────
interface LabeledEx extends Ex {
  lessonId: string
  lessonTitle: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function shuffleOptions(ex: LabeledEx): LabeledEx {
  return { ...ex, options: shuffle(ex.options) }
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className={cn('text-xl font-black', color)}>{value}</div>
      <div className="text-xs text-[var(--text-muted)] mt-0.5">{label}</div>
    </div>
  )
}

// ─── Screens ──────────────────────────────────────────────────────────────────
function EmptyMistakes() {
  return (
    <div className="p-6 md:p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-6xl mb-4">🌟</div>
      <h2 className="text-2xl font-black text-[var(--text)] mb-2">No mistakes!</h2>
      <p className="text-[var(--text-muted)] mb-6 max-w-xs">
        You have no recorded mistakes across any lesson. Keep up the great work!
      </p>
      <Link to="/lessons">
        <Button><BookOpen size={16} /> Back to Lessons</Button>
      </Link>
    </div>
  )
}

function BlockDone({ blockNum, totalBlocks, corrected, blockSize, xp, remaining, onContinue, onStop }: {
  blockNum: number; totalBlocks: number; corrected: number; blockSize: number
  xp: number; remaining: number; onContinue: () => void; onStop: () => void
}) {
  const pct = Math.round((corrected / blockSize) * 100)
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="p-6 md:p-8 flex items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-md w-full">
        <div className="text-6xl mb-4">{pct === 100 ? '🌟' : pct >= 70 ? '💪' : '📈'}</div>
        <h2 className="text-2xl font-black text-[var(--text)] mb-2">Block {blockNum} of {totalBlocks} done!</h2>
        <p className="text-[var(--text-muted)] mb-5">{corrected}/{blockSize} corrected · {remaining} mistake{remaining !== 1 ? 's' : ''} left</p>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 mb-5">
          <div className="flex justify-around">
            <Stat label="Corrected" value={`${corrected}/${blockSize}`} color="text-green-500" />
            <Stat label="XP Bonus"  value={`+${xp}`}                    color="text-cyan-400" />
            <Stat label="Accuracy"  value={`${pct}%`}                   color="text-purple-400" />
            <Stat label="Left"      value={`${remaining}`}               color="text-red-400" />
          </div>
        </div>
        {remaining > 0 && (
          <div className="bg-[var(--bg-elev)] border border-[var(--border)] rounded-2xl p-4 mb-6 text-left">
            <p className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wide font-semibold">Next</p>
            <p className="text-sm text-[var(--text)] font-semibold">Block {blockNum + 1} · {Math.min(10, remaining)} questions</p>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button onClick={onStop} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-medium transition-all">
            Stop here
          </button>
          <Button onClick={onContinue} size="lg">⚡ Block {blockNum + 1} <ChevronRight size={16} /></Button>
        </div>
      </div>
    </motion.div>
  )
}

function AllDone({ totalCorrected, totalAttempted, totalXp, remainingMistakes }: {
  totalCorrected: number; totalAttempted: number; totalXp: number; remainingMistakes: number
}) {
  const allFixed = remainingMistakes === 0
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="p-6 md:p-8 flex items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-sm w-full">
        <div className="text-6xl mb-4">{allFixed ? '🏆' : totalCorrected > 0 ? '📈' : '💪'}</div>
        <h2 className="text-2xl font-black text-[var(--text)] mb-2">
          {allFixed ? 'All mistakes fixed!' : `${totalCorrected}/${totalAttempted} corrected`}
        </h2>
        <p className="text-[var(--text-muted)] mb-6">
          {allFixed
            ? 'Outstanding! You have no more recorded mistakes.'
            : `${remainingMistakes} mistake${remainingMistakes !== 1 ? 's' : ''} still need attention.`}
        </p>
        {totalXp > 0 && (
          <div className="flex items-center justify-center gap-2 bg-cyan-400/10 border border-cyan-400/20 rounded-2xl p-4 mb-6">
            <Zap size={18} className="text-cyan-400" />
            <span className="text-cyan-400 font-bold text-lg">+{totalXp} XP</span>
            <span className="text-[var(--text-muted)] text-sm">bonus earned</span>
          </div>
        )}
        <div className="flex gap-3 justify-center flex-wrap">
          <Link to="/lessons">
            <Button variant="secondary"><BookOpen size={15} /> Lessons</Button>
          </Link>
          <Link to="/dashboard">
            <Button>Dashboard <ChevronRight size={16} /></Button>
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

// ─── State ────────────────────────────────────────────────────────────────────
interface PageState {
  queue: LabeledEx[]
  blockStart: number
  exIdx: number
  answered: boolean
  correctedInBlock: number
  xpInBlock: number
  totalCorrected: number
  totalXp: number
  blockNum: number
  totalBlocks: number
}

type PageMode = 'loading' | 'empty' | 'review' | 'block-done' | 'all-done'

// ─── Main MistakesPage ────────────────────────────────────────────────────────
export function MistakesPage() {
  const { refresh } = useAuth()
  const [mode, setMode] = useState<PageMode>('loading')
  const [state, setState] = useState<PageState | null>(null)

  useEffect(() => {
    const allMistakes = getAllMistakes()
    if (allMistakes.length === 0) {
      setMode('empty')
      return
    }
    const queue: LabeledEx[] = allMistakes.flatMap(({ lessonId, exIds }) => {
      const lesson = getLesson(lessonId)
      const allExs = [...lesson.stage1, ...lesson.stage2, ...lesson.stage3]
      return allExs
        .filter(e => exIds.includes(e.id))
        .map(e => ({ ...e, lessonId, lessonTitle: lesson.title }))
    })
    if (queue.length === 0) { setMode('empty'); return }
    const shuffled = shuffle(queue.map(shuffleOptions))
    setState({
      queue: shuffled, blockStart: 0, exIdx: 0, answered: false,
      correctedInBlock: 0, xpInBlock: 0, totalCorrected: 0, totalXp: 0,
      blockNum: 1, totalBlocks: Math.ceil(shuffled.length / 10),
    })
    setMode('review')
  }, [])

  const handleAnswer = useCallback((correct: boolean, ex: LabeledEx) => {
    setState(prev => {
      if (!prev) return prev
      const next = { ...prev, answered: true }
      if (correct) {
        clearMistake(ex.lessonId, ex.id)
        next.correctedInBlock = prev.correctedInBlock + 1
        // 1 point per corrected mistake (review is capped by the daily limit in
        // addXp and never counts toward the streak).
        next.xpInBlock = prev.xpInBlock + 1
      }
      return next
    })
  }, [])

  const handleNext = useCallback(async () => {
    if (!state) return
    const blockSize = Math.min(10, state.queue.length - state.blockStart)
    if (state.exIdx < blockSize - 1) {
      setState(prev => prev ? ({ ...prev, exIdx: prev.exIdx + 1, answered: false }) : prev)
      return
    }
    // Block finished
    const newTotalCorrected = state.totalCorrected + state.correctedInBlock
    const newTotalXp = state.totalXp + state.xpInBlock
    if (state.xpInBlock > 0) { try { await addXp(state.xpInBlock); await refresh() } catch {} }
    setState(prev => prev ? ({ ...prev, totalCorrected: newTotalCorrected, totalXp: newTotalXp }) : prev)
    const hasMore = state.blockStart + 10 < state.queue.length
    if (hasMore) setMode('block-done')
    else setMode('all-done')
  }, [state, refresh])

  const continueToNextBlock = () => {
    setState(prev => prev ? ({
      ...prev,
      blockStart: prev.blockStart + 10,
      exIdx: 0, answered: false,
      correctedInBlock: 0, xpInBlock: 0,
      blockNum: prev.blockNum + 1,
    }) : prev)
    setMode('review')
  }

  // ─ Loading
  if (mode === 'loading') {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-muted)] text-sm">Loading mistakes…</div>
      </div>
    )
  }

  if (mode === 'empty') return <EmptyMistakes />

  if (!state) return null

  const blockSize = Math.min(10, state.queue.length - state.blockStart)
  const currentEx = state.queue[state.blockStart + state.exIdx]
  const remaining = getAllMistakesCount()

  if (mode === 'block-done') {
    return (
      <BlockDone
        blockNum={state.blockNum} totalBlocks={state.totalBlocks}
        corrected={state.correctedInBlock} blockSize={blockSize}
        xp={state.xpInBlock} remaining={remaining}
        onContinue={continueToNextBlock}
        onStop={() => setMode('all-done')}
      />
    )
  }

  if (mode === 'all-done') {
    return (
      <AllDone
        totalCorrected={state.totalCorrected}
        totalAttempted={state.queue.length}
        totalXp={state.totalXp}
        remainingMistakes={remaining}
      />
    )
  }

  // ─ Review mode
  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <Link to="/lessons" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors mb-6">
        <ArrowLeft size={15} /> Back to Lessons
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-[var(--text)]">Global Mistakes Review</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Block {state.blockNum} of {state.totalBlocks} · {remaining} total mistake{remaining !== 1 ? 's' : ''} remaining
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-xs font-semibold text-red-400">
          <AlertCircle size={12} />
          {remaining} left
        </div>
      </div>

      {/* Lesson badge */}
      {currentEx && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-elev)] border border-[var(--border)] px-2.5 py-1 rounded-full">
            📖 {currentEx.lessonTitle}
          </span>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--text-muted)]">{state.exIdx + 1} / {blockSize}</span>
        <span className="text-sm text-cyan-400 font-semibold">+{state.xpInBlock} XP bonus</span>
      </div>
      <div className="flex gap-1 mb-8">
        {Array.from({ length: blockSize }).map((_, i) => (
          <div key={i} className={cn('h-2 flex-1 rounded-full transition-all duration-500',
            i < state.exIdx ? 'bg-green-500' : i === state.exIdx ? 'bg-red-400' : 'bg-[var(--border)]')} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={`global-${state.blockNum}-${state.exIdx}`}
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.22 }}>
          {currentEx && (
            <ExerciseQuestion
              ex={currentEx}
              stageLabel="Mistakes"
              stageColor="text-red-400 border-red-400/30 bg-red-400/10"
              onAnswer={(correct) => handleAnswer(correct, currentEx)}
            />
          )}
          {state.answered && (
            <Button className="w-full" onClick={() => void handleNext()} size="lg">
              {state.exIdx < blockSize - 1
                ? <>Next <ChevronRight size={16} /></>
                : state.blockStart + 10 < state.queue.length
                  ? <>Block results <Trophy size={16} /></>
                  : <>See results <Trophy size={16} /></>}
            </Button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
