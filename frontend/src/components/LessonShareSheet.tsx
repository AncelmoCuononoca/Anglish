import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Share2, Copy, BookOpen } from 'lucide-react'
import { shareLesson, copyLink, lessonShareUrl, canNativeShare, type ShareableLesson } from '../lib/share'

type Lesson = ShareableLesson & { topic?: string; level?: string }

// A bottom sheet that slides up when a lesson is long-pressed. Its main action
// opens the phone's native share sheet (Facebook, Instagram, WhatsApp, Messages…)
// with a deep link back to the lesson.
export function LessonShareSheet({
  lesson, onClose,
}: {
  lesson: Lesson | null
  onClose: () => void
}) {
  const native = canNativeShare()

  return (
    <AnimatePresence>
      {lesson && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[61] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
          >
            <div className="mx-auto max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-2xl">
              {/* Grab handle */}
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--border)]" />

              {/* Lesson summary */}
              <div className="mb-4 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Share lesson
                </p>
                <p className="mt-0.5 truncate text-base font-black text-[var(--text)]">
                  {lesson.title}
                </p>
                {(lesson.level || lesson.topic) && (
                  <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                    {[lesson.level, lesson.topic].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {/* Primary: native share sheet */}
              <button
                onClick={() => { void shareLesson(lesson); onClose() }}
                className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-500 to-cyan-500 px-4 py-3.5 text-left text-white transition-transform active:scale-[0.98]"
              >
                <Share2 size={20} className="flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold">{native ? 'Share' : 'Copy link'}</p>
                  <p className="text-xs text-white/80">
                    {native ? 'Send to a friend, Facebook, Instagram…' : 'Copy the lesson link'}
                  </p>
                </div>
              </button>

              {/* Secondary actions */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                {native && (
                  <button
                    onClick={() => { void copyLink(lessonShareUrl(lesson.id)); onClose() }}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:border-purple-400/40"
                  >
                    <Copy size={16} /> Copy link
                  </button>
                )}
                <Link
                  to={`/lessons/${lesson.id}`}
                  onClick={onClose}
                  className={`flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:border-purple-400/40 ${native ? '' : 'col-span-2'}`}
                >
                  <BookOpen size={16} /> Open lesson
                </Link>
              </div>

              {/* Cancel */}
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-2xl px-3 py-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
