import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle } from 'lucide-react'
import { cn } from '../lib/utils'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { playCorrect, playWrong } from '../lib/sounds'
import type { Ex } from '../lib/lessonData'

const TYPE_LABEL: Record<Ex['type'], string> = {
  multiple_choice: 'Multiple choice',
  translation: 'Translation',
  fill_blank: 'Fill in the blank',
  write: 'Write your answer',
}

// Normalise a free-text answer so matching ignores case, surrounding spaces,
// hyphen-vs-space (twenty-three = twenty three) and trailing punctuation.
function normalize(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[-\u2013\u2014]/g, ' ')      // hyphens -> space
    .replace(/[.,!?;:]/g, '')    // strip sentence punctuation
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim()
}

function matchesWriteAnswer(value: string, ex: Ex) {
  const accepted = [ex.answer, ...(ex.accept ?? [])].map(normalize)
  return accepted.includes(normalize(value))
}

export function ExerciseQuestion({
  ex,
  stageLabel,
  stageColor,
  onAnswer,
}: {
  ex: Ex
  stageLabel: string
  stageColor: string
  onAnswer: (correct: boolean) => void
}) {
  const isWrite = ex.type === 'write'

  // Multiple-choice state
  const [selected, setSelected] = useState<string | null>(null)
  // Write state
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)

  const confirmed = isWrite ? checked : selected !== null
  const isCorrect = isWrite ? matchesWriteAnswer(value, ex) : selected === ex.answer

  const handleSelect = (opt: string) => {
    if (confirmed) return
    setSelected(opt)
    if (opt === ex.answer) playCorrect()
    else playWrong()
  }

  const handleCheck = () => {
    if (checked || !value.trim()) return
    setChecked(true)
    const correct = matchesWriteAnswer(value, ex)
    if (correct) playCorrect()
    else playWrong()
    onAnswer(correct)
  }

  useEffect(() => {
    if (!isWrite && selected !== null) onAnswer(selected === ex.answer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  return (
    <>
      <Card className="mb-5">
        <div className={cn('text-xs font-semibold uppercase tracking-wide mb-2', stageColor.split(' ')[0])}>
          {stageLabel} · {TYPE_LABEL[ex.type]}
        </div>
        <h2 className="text-lg font-bold text-[var(--text)] leading-snug">{ex.question}</h2>
      </Card>

      {isWrite ? (
        <div className="mb-6">
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCheck() }}
            disabled={checked}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Type your answer here…"
            className={cn(
              'w-full p-4 rounded-xl border bg-[var(--bg-elev)] text-base font-medium outline-none transition-all duration-200',
              !checked   ? 'border-[var(--border)] text-[var(--text)] focus:border-purple-400' :
              isCorrect  ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400' :
                           'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
            )}
          />

          {!checked ? (
            <Button className="w-full mt-3" size="lg" disabled={!value.trim()} onClick={handleCheck}>
              Check answer
            </Button>
          ) : !isCorrect && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Correct answer: <span className="font-bold text-green-500">{ex.answer}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2.5 mb-6">
          {ex.options.map(opt => {
            const isSelected = selected === opt
            const isRight = confirmed && opt === ex.answer
            const isWrong = confirmed && isSelected && opt !== ex.answer
            return (
              <button
                key={opt}
                disabled={confirmed}
                onClick={() => handleSelect(opt)}
                className={cn(
                  'w-full text-left p-4 rounded-xl border transition-all duration-200 text-sm font-medium',
                  isRight    ? 'bg-green-500/15 border-green-500 text-green-600 dark:text-green-400' :
                  isWrong    ? 'bg-red-500/15 border-red-500 text-red-600 dark:text-red-400' :
                  isSelected ? 'bg-purple-500/15 border-purple-400 text-[var(--text)]' :
                               'bg-[var(--bg-elev)] border-[var(--border)] text-[var(--text-muted)] hover:border-white/25 hover:text-[var(--text)]',
                  confirmed && !isRight && !isWrong ? 'text-[var(--text-muted)] opacity-60' : '',
                )}
              >
                <div className="flex items-center justify-between">
                  <span>{opt}</span>
                  {isRight && <CheckCircle size={18} className="text-green-500 flex-shrink-0" />}
                  {isWrong && <XCircle size={18} className="text-red-500 flex-shrink-0" />}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {confirmed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-4 rounded-xl border mb-6 text-sm',
            isCorrect ? 'bg-green-500/8 border-green-500/25' : 'bg-red-500/8 border-red-500/25',
          )}
        >
          <div className={cn('font-bold mb-1 flex items-center gap-2', isCorrect ? 'text-green-500' : 'text-red-500')}>
            {isCorrect ? <><CheckCircle size={16} /> Correct!</> : <><XCircle size={16} /> Incorrect</>}
          </div>
          <p className="text-[var(--text-muted)] leading-relaxed">{ex.explanation}</p>
        </motion.div>
      )}
    </>
  )
}
