import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { ExerciseQuestion } from '../components/ExerciseQuestion'
import {
  CheckCircle, XCircle, ChevronRight, Trophy, Star, Flame,
  RotateCcw, BookOpen, ArrowLeft, Lock, Zap,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { saveSession } from './SessionHistoryPage'
import { getLesson, type Ex } from '../lib/lessonData'
import {
  saveProgress, loadProgress, clearProgress,
  getMaxStage, advanceMaxStage,
  getMistakes, addMistake, clearMistake,
} from '../lib/exerciseProgress'
import { addXp } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function shuffleExOptions(ex: Ex): Ex {
  return { ...ex, options: shuffle(ex.options) }
}

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGES = [
  { stage: 1 as const, label: 'Beginner',     emoji: '📚', color: 'purple', desc: '10 foundation exercises' },
  { stage: 2 as const, label: 'Intermediate', emoji: '🎯', color: 'cyan',   desc: '10 advanced exercises' },
  { stage: 3 as const, label: 'Expert',       emoji: '🔥', color: 'yellow', desc: '10 expert exercises' },
]

const STAGE_PILL: Record<number, string> = {
  1: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
  2: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10',
  3: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
}

// ─── Shared small components ──────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className={cn('text-xl font-black', color)}>{value}</div>
      <div className="text-xs text-[var(--text-muted)] mt-0.5">{label}</div>
    </div>
  )
}

function BackToLessons() {
  return (
    <Link to="/lessons"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors mb-6">
      <ArrowLeft size={15} /> Back to Lessons
    </Link>
  )
}

// ─── Stage Selection Screen ───────────────────────────────────────────────────
function StageSelect({ lessonTitle, maxStage, mistakesCount, onSelect, onSelectMistakes }: {
  lessonTitle: string
  maxStage: number
  mistakesCount: number
  onSelect: (stage: 1 | 2 | 3) => void
  onSelectMistakes: () => void
}) {
  return (
    <div className="p-6 md:p-8 max-w-xl">
      <BackToLessons />
      <div className="mb-8">
        <h1 className="text-2xl font-black text-[var(--text)] mb-1">{lessonTitle}</h1>
        <p className="text-[var(--text-muted)] text-sm">Choose a stage to practice</p>
      </div>

      <div className="space-y-3">
        {STAGES.map(({ stage, label, emoji, desc, color }) => {
          const unlocked = stage <= maxStage + 1
          const completed = stage <= maxStage
          return (
            <motion.button
              key={stage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (stage - 1) * 0.08 }}
              disabled={!unlocked}
              onClick={() => onSelect(stage)}
              className={cn(
                'w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-all',
                unlocked
                  ? completed
                    ? 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-500/50'
                    : `border-${color}-400/30 bg-${color}-500/5 hover:bg-${color}-500/10 hover:border-${color}-400/50`
                  : 'border-[var(--border)] bg-[var(--bg-card)] opacity-40 cursor-not-allowed'
              )}
            >
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0', !unlocked && 'grayscale opacity-50')}>
                {unlocked ? emoji : <Lock size={20} className="text-[var(--text-muted)]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className={cn('font-bold text-base', !unlocked ? 'text-[var(--text-muted)]' : 'text-[var(--text)]')}>{label}</p>
                  {completed && <span className="text-xs text-green-500 font-semibold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">✓ Done</span>}
                  {!unlocked && <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-elev)] border border-[var(--border)] px-2 py-0.5 rounded-full">Locked</span>}
                </div>
                <p className="text-xs text-[var(--text-muted)]">{desc}</p>
              </div>
              {unlocked && <ChevronRight size={18} className="text-[var(--text-muted)] flex-shrink-0" />}
            </motion.button>
          )
        })}
      </div>

      {/* Mistakes Review section */}
      <div className="mt-6 pt-5 border-t border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--text)]">Mistakes Review</h3>
          <span className={cn(
            'text-sm font-bold px-2.5 py-0.5 rounded-full border',
            mistakesCount > 0
              ? 'text-red-400 border-red-400/30 bg-red-400/10'
              : 'text-green-500 border-green-500/30 bg-green-500/10',
          )}>
            {mistakesCount} {mistakesCount === 1 ? 'error' : 'errors'}
          </span>
        </div>
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          disabled={mistakesCount === 0}
          onClick={onSelectMistakes}
          className={cn(
            'w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-all',
            mistakesCount > 0
              ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/50 cursor-pointer'
              : 'border-green-500/30 bg-green-500/5 opacity-80 cursor-not-allowed',
          )}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
            {mistakesCount > 0 ? '⚡' : '✅'}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn('font-bold text-base mb-0.5', mistakesCount > 0 ? 'text-[var(--text)]' : 'text-green-500')}>
              {mistakesCount > 0 ? `Fix ${mistakesCount} mistake${mistakesCount !== 1 ? 's' : ''}` : 'No mistakes - great work!'}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {mistakesCount > 0
                ? `${Math.ceil(mistakesCount / 10)} block${Math.ceil(mistakesCount / 10) !== 1 ? 's' : ''} · up to 10 questions each · 50% XP bonus`
                : 'Keep practising to stay error-free'}
            </p>
          </div>
          {mistakesCount > 0 && <ChevronRight size={18} className="text-[var(--text-muted)] flex-shrink-0" />}
        </motion.button>
      </div>

      {maxStage === 0 && (
        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          Complete each stage to unlock the next one.
        </p>
      )}
    </div>
  )
}

// ─── Stage Gate (between stages) ─────────────────────────────────────────────
function StageGate({ stageCompleted, score, totalXp, wrongCount, onContinue, onFinish }: {
  stageCompleted: 1 | 2; score: number; totalXp: number; wrongCount: number
  onContinue: () => void; onFinish: () => void
}) {
  const next = STAGES[stageCompleted]
  const pct = Math.round((score / (stageCompleted * 10)) * 100)
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="p-6 md:p-8 flex items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-md w-full">
        <div className="text-6xl mb-4">{pct === 100 ? '🎉' : pct >= 70 ? '🙌' : '💪'}</div>
        <h2 className="text-2xl font-black text-[var(--text)] mb-2">Stage {stageCompleted} Complete!</h2>
        <p className="text-[var(--text-muted)] mb-5">{pct}% accuracy · +{totalXp} XP earned</p>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 mb-5">
          <div className="flex justify-around">
            <Stat label="Correct"   value={`${score}/${stageCompleted * 10}`} color="text-green-500" />
            <Stat label="Wrong"     value={`${wrongCount}`}                    color="text-red-500" />
            <Stat label="XP"        value={`+${totalXp}`}                      color="text-cyan-400" />
            <Stat label="Accuracy"  value={`${pct}%`}                          color="text-purple-400" />
          </div>
        </div>
        {next && (
          <div className="bg-[var(--bg-elev)] border border-[var(--border)] rounded-2xl p-4 mb-6 text-left">
            <p className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wide font-semibold">Next stage</p>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{next.emoji}</span>
              <div>
                <p className="text-[var(--text)] font-semibold">{next.label}</p>
                <p className="text-xs text-[var(--text-muted)]">{next.desc}</p>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button onClick={onFinish} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-white/20 text-sm font-medium transition-all">
            Stop here
          </button>
          <Button onClick={onContinue} size="lg">{next?.emoji} {next?.label} <ChevronRight size={16} /></Button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Completion Screen ────────────────────────────────────────────────────────
function CompletionScreen({ stagesCompleted, score, totalXp, totalEx, wrongExercises, onRetry, onRetryWrong }: {
  stagesCompleted: number; score: number; totalXp: number; totalEx: number
  wrongExercises: Ex[]; onRetry: () => void; onRetryWrong: () => void
}) {
  const pct = Math.round((score / Math.max(totalEx, 1)) * 100)
  const emoji = pct === 100 ? '🏆' : stagesCompleted === 3 ? '🔥' : stagesCompleted === 2 ? '🎯' : '✅'
  const title = pct === 100 ? 'Perfect!' : stagesCompleted === 3 ? 'Expert Unlocked!' : stagesCompleted === 2 ? 'Intermediate Done!' : 'Beginner Done!'
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="p-6 md:p-8 flex items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-md w-full">
        <div className="text-7xl mb-4">{emoji}</div>
        <h2 className="text-3xl font-black text-[var(--text)] mb-2">{title}</h2>
        <p className="text-[var(--text-muted)] mb-6">{stagesCompleted} stage{stagesCompleted > 1 ? 's' : ''} completed · {score}/{totalEx} correct</p>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 mb-5">
          <div className="flex justify-around">
            <Stat label="Correct"  value={`${score}/${totalEx}`}   color="text-green-500" />
            <Stat label="XP"       value={`+${totalXp}`}           color="text-cyan-400" />
            <Stat label="Accuracy" value={`${pct}%`}               color="text-purple-400" />
            <Stat label="Stages"   value={`${stagesCompleted}/3`}  color="text-yellow-400" />
          </div>
        </div>
        {wrongExercises.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            onClick={onRetryWrong}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-red-500/30 bg-red-500/8 hover:bg-red-500/12 hover:border-red-500/50 transition-all mb-3 text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
              <RotateCcw size={16} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-400">Redo {wrongExercises.length} mistake{wrongExercises.length > 1 ? 's' : ''}</p>
              <p className="text-xs text-[var(--text-muted)]">Retry only the questions you got wrong</p>
            </div>
            <ChevronRight size={16} className="text-red-400" />
          </motion.button>
        )}
        <div className="flex gap-3 justify-center flex-wrap mt-2">
          <button onClick={onRetry} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-white/20 text-sm font-medium transition-all">
            <RotateCcw size={14} /> Restart
          </button>
          <Link to="/lessons"><Button variant="secondary"><BookOpen size={15} /> Lessons</Button></Link>
          <Link to="/dashboard"><Button>Dashboard <ChevronRight size={16} /></Button></Link>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Retry Wrong Screen ───────────────────────────────────────────────────────
function RetryDoneScreen({ total, corrected, xpEarned, onDone }: {
  total: number; corrected: number; xpEarned: number; onDone: () => void
}) {
  const all = corrected === total
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="p-6 md:p-8 flex items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-sm w-full">
        <div className="text-6xl mb-4">{all ? '🌟' : corrected > 0 ? '📈' : '💪'}</div>
        <h2 className="text-2xl font-black text-[var(--text)] mb-2">{all ? 'All mistakes fixed!' : `${corrected}/${total} fixed`}</h2>
        <p className="text-[var(--text-muted)] mb-6">{all ? 'Great job - you corrected every mistake!' : 'Keep practising to improve your accuracy.'}</p>
        {xpEarned > 0 && (
          <div className="flex items-center justify-center gap-2 bg-cyan-400/10 border border-cyan-400/20 rounded-2xl p-4 mb-6">
            <Zap size={18} className="text-cyan-400" />
            <span className="text-cyan-400 font-bold text-lg">+{xpEarned} XP</span>
            <span className="text-[var(--text-muted)] text-sm">bonus earned</span>
          </div>
        )}
        <Button className="w-full" onClick={onDone} size="lg"><BookOpen size={16} /> Back to Results</Button>
      </div>
    </motion.div>
  )
}

// ─── Mistakes Block Done screen ───────────────────────────────────────────────
function MistakesBlockDone({ blockNum, totalBlocks, corrected, blockSize, xp, remaining, onContinue, onStop }: {
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
        <p className="text-[var(--text-muted)] mb-5">{corrected}/{blockSize} corrected · {remaining} mistake{remaining !== 1 ? 's' : ''} remaining</p>
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

// ─── Mistakes All Done screen ─────────────────────────────────────────────────
function MistakesAllDone({ totalCorrected, totalAttempted, totalXp, remainingMistakes, onBack }: {
  totalCorrected: number; totalAttempted: number; totalXp: number
  remainingMistakes: number; onBack: () => void
}) {
  const allFixed = remainingMistakes === 0
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="p-6 md:p-8 flex items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-sm w-full">
        <div className="text-6xl mb-4">{allFixed ? '🌟' : totalCorrected > 0 ? '📈' : '💪'}</div>
        <h2 className="text-2xl font-black text-[var(--text)] mb-2">
          {allFixed ? 'All mistakes fixed!' : `${totalCorrected}/${totalAttempted} corrected`}
        </h2>
        <p className="text-[var(--text-muted)] mb-6">
          {allFixed
            ? 'Perfect! No more mistakes for this lesson.'
            : `${remainingMistakes} mistake${remainingMistakes !== 1 ? 's' : ''} still need attention.`}
        </p>
        {totalXp > 0 && (
          <div className="flex items-center justify-center gap-2 bg-cyan-400/10 border border-cyan-400/20 rounded-2xl p-4 mb-6">
            <Zap size={18} className="text-cyan-400" />
            <span className="text-cyan-400 font-bold text-lg">+{totalXp} XP</span>
            <span className="text-[var(--text-muted)] text-sm">bonus earned</span>
          </div>
        )}
        <Button className="w-full" onClick={onBack} size="lg"><BookOpen size={16} /> Back to Exercises</Button>
      </div>
    </motion.div>
  )
}

// ─── Mistakes state ───────────────────────────────────────────────────────────
interface MistakesState {
  queue: Ex[]
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

const emptyMs: MistakesState = {
  queue: [], blockStart: 0, exIdx: 0, answered: false,
  correctedInBlock: 0, xpInBlock: 0, totalCorrected: 0, totalXp: 0, blockNum: 1, totalBlocks: 1,
}

// ─── Main ExercisesPage ───────────────────────────────────────────────────────
type Mode = 'select' | 'exercise' | 'gate' | 'retry' | 'retry-done' | 'done'
           | 'mistakes' | 'mistakes-block-done' | 'mistakes-all-done'

export function ExercisesPage() {
  const { id = 'w1d5' } = useParams()
  const { refresh } = useAuth()
  const lesson = getLesson(id)
  const allExercises = useMemo(() => [...lesson.stage1, ...lesson.stage2, ...lesson.stage3], [lesson])

  const [mode, setMode] = useState<Mode>('select')
  const [currentStage, setCurrentStage] = useState<1 | 2 | 3>(1)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [xpEarned, setXpEarned] = useState(0)
  const [wrongIds, setWrongIds] = useState<number[]>([])
  const [stagesCompleted, setStagesCompleted] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [maxStage, setMaxStage] = useState(() => getMaxStage(id))
  const [mistakesCount, setMistakesCount] = useState(() => getMistakes(id).length)

  // Retry wrong mode
  const [retryExercises, setRetryExercises] = useState<Ex[]>([])
  const [retryIdx, setRetryIdx] = useState(0)
  const [retryCorrected, setRetryCorrected] = useState(0)
  const [retryXp, setRetryXp] = useState(0)
  const [retryAnswered, setRetryAnswered] = useState(false)

  // Mistakes mode state
  const [ms, setMs] = useState<MistakesState>(emptyMs)

  const shuffledRef = useRef<Ex[]>([])

  const initStage = useCallback((stage: 1 | 2 | 3) => {
    const src = stage === 1 ? lesson.stage1 : stage === 2 ? lesson.stage2 : lesson.stage3
    shuffledRef.current = src.map(shuffleExOptions)
    setCurrentStage(stage)
    setCurrentIdx(0)
    setAnswered(false)
    setMode('exercise')
  }, [lesson])

  // Restore in-progress session
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const saved = loadProgress(id)
    if (saved && !saved.done) {
      setScore(saved.score)
      setXpEarned(saved.xpEarned)
      setWrongIds(saved.wrongIds)
      initStage(saved.stage)
      setCurrentIdx(saved.idx)
    }
  }, [id, initStage])

  // Refresh mistakes count when returning to select
  useEffect(() => {
    if (mode === 'select') setMistakesCount(getMistakes(id).length)
  }, [mode, id])

  // Persist progress during exercise
  useEffect(() => {
    if (mode !== 'exercise') return
    saveProgress(id, { stage: currentStage, idx: currentIdx, score, xpEarned, wrongIds, done: false })
  }, [id, mode, currentStage, currentIdx, score, xpEarned, wrongIds])

  // ── Handle answer (normal mode) ────────────────────────────────────────────
  const handleAnswer = useCallback((correct: boolean, ex: Ex) => {
    setAnswered(true)
    if (correct) {
      setScore(s => s + 1)
      setXpEarned(x => x + ex.xp)
    } else {
      setWrongIds(ids => ids.includes(ex.id) ? ids : [...ids, ex.id])
      addMistake(id, ex.id)
      setMistakesCount(getMistakes(id).length)
    }
  }, [id])

  // ── Finish session ─────────────────────────────────────────────────────────
  const finishSession = useCallback(async (xp: number, completed: number) => {
    clearProgress(id)
    try { await addXp(xp); await refresh() } catch {}
    saveSession({
      lessonId: id, lessonTitle: lesson.title,
      score: Math.round((score / Math.max(completed * 10, 1)) * 100),
      xpEarned: xp, stage: currentStage, stagesCompleted: completed,
    })
    setMode('done')
  }, [id, lesson.title, score, currentStage, refresh])

  // ── Next question / stage ──────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    const exercises = shuffledRef.current
    if (currentIdx < exercises.length - 1) {
      setCurrentIdx(i => i + 1)
      setAnswered(false)
    } else {
      const newCompleted = stagesCompleted + 1
      setStagesCompleted(newCompleted)
      advanceMaxStage(id, currentStage)
      setMaxStage(getMaxStage(id))
      if (currentStage < 3) setMode('gate')
      else void finishSession(xpEarned, newCompleted)
    }
  }, [currentIdx, stagesCompleted, currentStage, id, xpEarned, finishSession])

  const continueToNextStage = () => initStage((currentStage + 1) as 1 | 2 | 3)
  const finishEarly = () => { void finishSession(xpEarned, stagesCompleted) }

  const restart = () => {
    clearProgress(id)
    setScore(0); setXpEarned(0); setWrongIds([])
    setStagesCompleted(0); setAnswered(false)
    setMode('select')
  }

  // ── Redo mistakes (session mistakes) ──────────────────────────────────────
  const startRetryWrong = () => {
    const wrong = allExercises.filter(e => wrongIds.includes(e.id)).map(shuffleExOptions)
    setRetryExercises(shuffle(wrong))
    setRetryIdx(0); setRetryCorrected(0); setRetryXp(0); setRetryAnswered(false)
    setMode('retry')
  }

  const handleRetryAnswer = useCallback(async (correct: boolean, ex: Ex) => {
    setRetryAnswered(true)
    if (correct) {
      setRetryCorrected(c => c + 1)
      setRetryXp(x => x + Math.round(ex.xp * 0.5))
    }
  }, [])

  const handleRetryNext = useCallback(async () => {
    if (retryIdx < retryExercises.length - 1) {
      setRetryIdx(i => i + 1)
      setRetryAnswered(false)
    } else {
      if (retryXp > 0) { try { await addXp(retryXp); await refresh() } catch {} }
      setMode('retry-done')
    }
  }, [retryIdx, retryExercises.length, retryXp, refresh])

  // ── Persistent mistakes mode ───────────────────────────────────────────────
  const startMistakesMode = useCallback(() => {
    const mistakeIds = getMistakes(id)
    if (mistakeIds.length === 0) return
    const queue = shuffle(
      allExercises.filter(e => mistakeIds.includes(e.id)).map(shuffleExOptions)
    )
    const totalBlocks = Math.ceil(queue.length / 10)
    setMs({ queue, blockStart: 0, exIdx: 0, answered: false, correctedInBlock: 0, xpInBlock: 0, totalCorrected: 0, totalXp: 0, blockNum: 1, totalBlocks })
    setMode('mistakes')
  }, [id, allExercises])

  const handleMistakesAnswer = useCallback((correct: boolean, ex: Ex) => {
    setMs(prev => {
      const next = { ...prev, answered: true }
      if (correct) {
        clearMistake(id, ex.id)
        next.correctedInBlock = prev.correctedInBlock + 1
        next.xpInBlock = prev.xpInBlock + Math.round(ex.xp * 0.5)
      }
      return next
    })
  }, [id])

  const handleMistakesNext = useCallback(async () => {
    const blockSize = Math.min(10, ms.queue.length - ms.blockStart)
    if (ms.exIdx < blockSize - 1) {
      setMs(prev => ({ ...prev, exIdx: prev.exIdx + 1, answered: false }))
      return
    }
    // Block finished
    const newTotalCorrected = ms.totalCorrected + ms.correctedInBlock
    const newTotalXp = ms.totalXp + ms.xpInBlock
    if (ms.xpInBlock > 0) { try { await addXp(ms.xpInBlock); await refresh() } catch {} }
    setMs(prev => ({ ...prev, totalCorrected: newTotalCorrected, totalXp: newTotalXp }))
    setMistakesCount(getMistakes(id).length)

    const hasMore = ms.blockStart + 10 < ms.queue.length
    if (hasMore) setMode('mistakes-block-done')
    else setMode('mistakes-all-done')
  }, [ms, id, refresh])

  const continueToNextMistakesBlock = () => {
    setMs(prev => ({
      ...prev,
      blockStart: prev.blockStart + 10,
      exIdx: 0,
      answered: false,
      correctedInBlock: 0,
      xpInBlock: 0,
      blockNum: prev.blockNum + 1,
    }))
    setMode('mistakes')
  }

  const wrongExercises = useMemo(
    () => allExercises.filter(e => wrongIds.includes(e.id)),
    [allExercises, wrongIds]
  )

  // ══ RENDER ══════════════════════════════════════════════════════════════════

  if (mode === 'select') {
    return (
      <StageSelect
        lessonTitle={lesson.title}
        maxStage={maxStage}
        mistakesCount={mistakesCount}
        onSelect={stage => initStage(stage)}
        onSelectMistakes={startMistakesMode}
      />
    )
  }

  if (mode === 'gate') {
    return (
      <StageGate
        stageCompleted={currentStage as 1 | 2}
        score={score} totalXp={xpEarned} wrongCount={wrongIds.length}
        onContinue={continueToNextStage} onFinish={finishEarly}
      />
    )
  }

  if (mode === 'done') {
    return (
      <CompletionScreen
        stagesCompleted={stagesCompleted} score={score} totalXp={xpEarned}
        totalEx={stagesCompleted * 10} wrongExercises={wrongExercises}
        onRetry={restart} onRetryWrong={startRetryWrong}
      />
    )
  }

  if (mode === 'retry-done') {
    return (
      <RetryDoneScreen
        total={retryExercises.length} corrected={retryCorrected}
        xpEarned={retryXp} onDone={() => setMode('done')}
      />
    )
  }

  if (mode === 'mistakes-block-done') {
    const remaining = getMistakes(id).length
    return (
      <MistakesBlockDone
        blockNum={ms.blockNum} totalBlocks={ms.totalBlocks}
        corrected={ms.correctedInBlock} blockSize={Math.min(10, ms.queue.length - ms.blockStart)}
        xp={ms.xpInBlock} remaining={remaining}
        onContinue={continueToNextMistakesBlock}
        onStop={() => setMode('select')}
      />
    )
  }

  if (mode === 'mistakes-all-done') {
    return (
      <MistakesAllDone
        totalCorrected={ms.totalCorrected}
        totalAttempted={ms.queue.length}
        totalXp={ms.totalXp}
        remainingMistakes={getMistakes(id).length}
        onBack={() => setMode('select')}
      />
    )
  }

  // ── Retry wrong mode ────────────────────────────────────────────────────────
  if (mode === 'retry') {
    const retryEx = retryExercises[retryIdx]
    const stageCfg = STAGES.find(s => s.stage === Math.ceil((allExercises.findIndex(e => e.id === retryEx?.id) + 1) / 10)) ?? STAGES[0]
    return (
      <div className="p-6 md:p-8 max-w-2xl">
        <BackToLessons />
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-xs font-semibold text-red-400">
            <RotateCcw size={11} /> Redo Mistakes
          </div>
          <span className="text-xs text-[var(--text-muted)]">{lesson.title}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[var(--text-muted)]">{retryIdx + 1} / {retryExercises.length}</span>
          <span className="text-sm text-cyan-400 font-semibold">+{retryXp} XP bonus</span>
        </div>
        <div className="flex gap-1 mb-8">
          {retryExercises.map((_, i) => (
            <div key={i} className={cn('h-2 flex-1 rounded-full transition-all duration-500',
              i < retryIdx ? 'bg-green-500' : i === retryIdx ? 'bg-red-400' : 'bg-[var(--border)]')} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={`retry-${retryIdx}`}
            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.22 }}>
            {retryEx && (
              <ExerciseQuestion
                ex={retryEx}
                stageLabel={stageCfg.label}
                stageColor={STAGE_PILL[stageCfg.stage]}
                onAnswer={(correct) => void handleRetryAnswer(correct, retryEx)}
              />
            )}
            {retryAnswered && (
              <Button className="w-full" onClick={() => void handleRetryNext()} size="lg">
                {retryIdx < retryExercises.length - 1 ? <>Next <ChevronRight size={16} /></> : <>See results <Trophy size={16} /></>}
              </Button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // ── Mistakes review mode ────────────────────────────────────────────────────
  if (mode === 'mistakes') {
    const blockSize = Math.min(10, ms.queue.length - ms.blockStart)
    const currentEx = ms.queue[ms.blockStart + ms.exIdx]
    return (
      <div className="p-6 md:p-8 max-w-2xl">
        <BackToLessons />
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-xs font-semibold text-red-400">
            ⚡ Mistakes · Block {ms.blockNum}/{ms.totalBlocks}
          </div>
          <span className="text-xs text-[var(--text-muted)]">{lesson.title}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[var(--text-muted)]">{ms.exIdx + 1} / {blockSize}</span>
          <span className="text-sm text-cyan-400 font-semibold">+{ms.xpInBlock} XP bonus</span>
        </div>
        <div className="flex gap-1 mb-8">
          {Array.from({ length: blockSize }).map((_, i) => (
            <div key={i} className={cn('h-2 flex-1 rounded-full transition-all duration-500',
              i < ms.exIdx ? 'bg-green-500' : i === ms.exIdx ? 'bg-red-400' : 'bg-[var(--border)]')} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={`mistakes-${ms.blockNum}-${ms.exIdx}`}
            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.22 }}>
            {currentEx && (
              <ExerciseQuestion
                ex={currentEx}
                stageLabel="Mistakes"
                stageColor="text-red-400 border-red-400/30 bg-red-400/10"
                onAnswer={(correct) => handleMistakesAnswer(correct, currentEx)}
              />
            )}
            {ms.answered && (
              <Button className="w-full" onClick={() => void handleMistakesNext()} size="lg">
                {ms.exIdx < blockSize - 1
                  ? <>Next <ChevronRight size={16} /></>
                  : ms.blockStart + 10 < ms.queue.length
                    ? <>Block results <Trophy size={16} /></>
                    : <>See results <Trophy size={16} /></>}
              </Button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // ── Normal exercise mode ────────────────────────────────────────────────────
  const exercises = shuffledRef.current
  const ex = exercises[currentIdx]
  const stageCfg = STAGES[currentStage - 1]

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <BackToLessons />

      {/* Stage pills + mistakes badge */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-[var(--text-muted)] mr-1">{lesson.title}</span>
        {STAGES.map(s => (
          <button
            key={s.stage}
            disabled={s.stage > maxStage + 1 && s.stage !== currentStage}
            onClick={() => {
              if (s.stage <= maxStage + 1 && s.stage !== currentStage) {
                setAnswered(false)
                initStage(s.stage)
              }
            }}
            title={s.stage <= maxStage + 1 ? `Jump to ${s.label}` : 'Locked'}
            className={cn(
              'flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-all',
              s.stage === currentStage
                ? STAGE_PILL[s.stage]
                : s.stage <= maxStage
                  ? 'text-green-500 border-green-500/30 bg-green-500/10 hover:bg-green-500/20 cursor-pointer'
                  : s.stage === maxStage + 1
                    ? 'text-[var(--text-muted)] border-[var(--border)] hover:border-white/20 cursor-pointer'
                    : 'text-[var(--text-muted)] border-[var(--border)] opacity-40 cursor-not-allowed'
            )}>
            {s.stage < currentStage ? <CheckCircle size={11} /> : s.stage === currentStage ? <Flame size={11} /> : s.stage <= maxStage ? <CheckCircle size={11} /> : <Star size={11} />}
            {s.label}
          </button>
        ))}
        {/* Mistakes pill */}
        <button
          onClick={startMistakesMode}
          disabled={mistakesCount === 0}
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-all',
            mistakesCount > 0
              ? 'text-red-400 border-red-400/30 bg-red-400/10 hover:bg-red-400/20 cursor-pointer'
              : 'text-green-500 border-green-500/30 bg-green-500/10 cursor-default',
          )}
        >
          <XCircle size={11} />
          {mistakesCount > 0 ? `${mistakesCount} mistake${mistakesCount !== 1 ? 's' : ''}` : 'No mistakes'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--text-muted)]">{currentIdx + 1} / {exercises.length} · {stageCfg.label}</span>
        <span className="text-sm text-cyan-400 font-semibold">+{xpEarned} XP</span>
      </div>
      <div className="flex gap-1 mb-8">
        {exercises.map((_, i) => (
          <div key={i} className={cn('h-2 flex-1 rounded-full transition-all duration-500',
            i < currentIdx ? 'bg-green-500' : i === currentIdx ? 'xp-bar-fill' : 'bg-[var(--border)]')} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={`${currentStage}-${currentIdx}`}
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.22 }}>
          {ex && (
            <ExerciseQuestion
              ex={ex}
              stageLabel={stageCfg.label}
              stageColor={STAGE_PILL[currentStage]}
              onAnswer={(correct) => handleAnswer(correct, ex)}
            />
          )}
          {answered && (
            <Button className="w-full" onClick={handleNext} size="lg">
              {currentIdx < exercises.length - 1
                ? <>Next <ChevronRight size={16} /></>
                : currentStage < 3
                  ? <>Stage results <Trophy size={16} /></>
                  : <>Final results 🏆</>}
            </Button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
