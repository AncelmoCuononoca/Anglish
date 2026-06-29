import { useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { BookOpen, ChevronRight, Volume2, Loader2, Lightbulb } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { cn } from '../lib/utils'
import { getLesson } from '../lib/lessonData'

const API = import.meta.env.VITE_API_URL || '' // '' → relativo /api (proxy Vite, sem CORS)

// Per-text TTS button with speed toggle (odd taps = slow, even = normal)
function SpeakButton({ text, token }: { text: string; token?: string }) {
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [isSlow, setIsSlow] = useState(false)
  const playCountRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setPlaying(false) }
    const slow = playCountRef.current % 2 === 1
    setIsSlow(slow)
    playCountRef.current += 1
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/speaking/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text, voice: 'alloy', speed: slow ? 0.62 : 1.0 }),
      })
      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url) }
      setPlaying(true)
      await audio.play()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [text, token])

  return (
    <button onClick={() => void speak()} disabled={loading}
      title={isSlow ? 'Tap again for normal speed' : 'Tap again for slow speed'}
      className={cn(
        'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all',
        playing
          ? isSlow ? 'border-yellow-400/50 text-yellow-400 bg-yellow-400/10 animate-pulse'
                   : 'border-cyan-400/50 text-cyan-400 bg-cyan-400/10 animate-pulse'
          : 'border-[var(--border)] text-[var(--text-muted)] hover:text-cyan-400 hover:border-cyan-400/30'
      )}>
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
      {playing ? (isSlow ? '🐢 Slow' : '▶ Playing') : 'Listen'}
    </button>
  )
}

export function LessonPage() {
  const { id = 'w1d4' } = useParams()
  const { session } = useAuth()
  const [section, setSection] = useState(0)
  const lesson = getLesson(id)
  const token = session?.access_token

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-6">
        <Link to="/dashboard" className="hover:text-[var(--text)]">Dashboard</Link>
        <ChevronRight size={14} />
        <Link to="/lessons" className="hover:text-[var(--text)]">Lições</Link>
        <ChevronRight size={14} />
        <span className="text-[var(--text)]">{lesson.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-400/20 rounded-lg px-2 py-1">{lesson.level}</span>
            <span className="text-xs bg-green-500/10 text-green-500 border border-green-500/20 rounded-lg px-2 py-1">+{lesson.xp} XP</span>
            <span className="text-xs bg-[var(--bg-elev)] text-[var(--text-muted)] border border-[var(--border)] rounded-lg px-2 py-1">{lesson.topic}</span>
          </div>
          <h1 className="text-2xl font-black text-[var(--text)]">{lesson.title}</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">Week {lesson.week} · Day {lesson.day}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <BookOpen size={16} />
          <span>{lesson.duration}</span>
        </div>
      </div>

      {/* Section progress */}
      <div className="flex gap-1.5 mb-8">
        {lesson.sections.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
            i <= section ? 'bg-gradient-to-r from-purple-500 to-cyan-400' : 'bg-[var(--border)]'
          }`} />
        ))}
      </div>

      {/* Section content */}
      <motion.div key={`${id}-${section}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        {(() => {
          const sec = lesson.sections[section]
          if (!sec) return null

          if (sec.type === 'intro') {
            return (
              <Card>
                <h2 className="font-bold text-[var(--text)] text-lg mb-3">{sec.title}</h2>
                <p className="text-[var(--text-muted)] mb-6">{sec.content}</p>
                {sec.examples && sec.examples.length > 0 && (
                  <div className="space-y-2">
                    {sec.examples.map(({ full, contraction, translation }) => (
                      <div key={full} className="flex items-center gap-3 p-3 bg-[var(--bg-elev)] rounded-xl">
                        <div className="flex-1 min-w-0">
                          {contraction
                            ? <>
                                <span className="text-[var(--text-muted)] text-sm line-through mr-3">{full}</span>
                                <span className="text-[var(--text)] font-semibold">{contraction}</span>
                              </>
                            : <>
                                <span className="text-[var(--text)] font-medium">{full}</span>
                                {translation && <span className="text-[var(--text-muted)] text-sm ml-2">- {translation}</span>}
                              </>
                          }
                        </div>
                        <SpeakButton text={contraction ?? full} token={token} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          }

          if (sec.type === 'tip') {
            return (
              <Card className="border-yellow-400/20">
                <h2 className="font-bold text-[var(--text)] text-lg mb-3 flex items-center gap-2">
                  <Lightbulb size={20} className="text-yellow-400" /> {sec.title}
                </h2>
                <p className="text-[var(--text)] leading-relaxed text-base">{sec.content}</p>
                <div className="mt-4">
                  <SpeakButton text={sec.content ?? ''} token={token} />
                </div>
              </Card>
            )
          }

          if (sec.type === 'examples') {
            return (
              <Card>
                <h2 className="font-bold text-[var(--text)] text-lg mb-5">{sec.title}</h2>
                <div className="space-y-4">
                  {sec.sentences?.map((s) => (
                    <div key={s} className="p-4 bg-[var(--bg-elev)] rounded-xl border border-cyan-400/10">
                      <p className="text-[var(--text)] font-medium leading-relaxed mb-3">{s}</p>
                      <SpeakButton text={s} token={token} />
                    </div>
                  ))}
                </div>
              </Card>
            )
          }

          return null
        })()}
      </motion.div>

      {/* Nav */}
      <div className="flex items-center justify-between mt-8">
        <Button variant="ghost" onClick={() => setSection(s => Math.max(0, s - 1))} disabled={section === 0}>
          Back
        </Button>
        {section < lesson.sections.length - 1 ? (
          <Button onClick={() => setSection(s => s + 1)}>
            Next <ChevronRight size={16} />
          </Button>
        ) : (
          <Link to={`/exercises/${id}`}>
            <Button>Start Exercises <ChevronRight size={16} /></Button>
          </Link>
        )}
      </div>
    </div>
  )
}
