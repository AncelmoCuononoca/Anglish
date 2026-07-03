import { useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { BookOpen, ChevronRight, Volume2, Loader2, Lightbulb, Download, Lock } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { cn } from '../lib/utils'
import { getLesson } from '../lib/lessonData'
import { canDownloadPdf } from '../lib/plans'
import { API_BASE as API } from '../lib/apiBase'

// ── Printable PDF (browser print → "Save as PDF"). No library, no API cost. ─────
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildLessonPrintHtml(lesson: ReturnType<typeof getLesson>): string {
  const sections = lesson.sections.map((sec) => {
    let inner = sec.title ? `<h2>${escHtml(sec.title)}</h2>` : ''
    if (sec.content) inner += `<p>${escHtml(sec.content)}</p>`
    if (sec.examples?.length) {
      inner += '<ul>' + sec.examples.map((e) => {
        const main = e.contraction
          ? `${escHtml(e.full)} &rarr; <strong>${escHtml(e.contraction)}</strong>`
          : `<strong>${escHtml(e.full)}</strong>`
        const tr = e.translation ? ` <span class="tr">— ${escHtml(e.translation)}</span>` : ''
        return `<li>${main}${tr}</li>`
      }).join('') + '</ul>'
    }
    if (sec.sentences?.length) {
      inner += '<ul>' + sec.sentences.map((s) => `<li>${escHtml(s)}</li>`).join('') + '</ul>'
    }
    return `<section>${inner}</section>`
  }).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(lesson.title)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a2e;margin:40px;line-height:1.6}
    .brand{color:#7F77DD;font-weight:800;letter-spacing:.5px;font-size:13px;text-transform:uppercase}
    h1{font-size:26px;margin:6px 0 2px}
    .meta{color:#666;font-size:13px;margin-bottom:22px}
    .tags span{display:inline-block;border:1px solid #ddd;border-radius:6px;padding:2px 8px;font-size:12px;margin-right:6px;color:#555}
    section{margin:16px 0;padding:16px 18px;border:1px solid #eee;border-radius:12px;page-break-inside:avoid}
    h2{font-size:17px;margin:0 0 8px}
    ul{margin:8px 0 0;padding-left:20px} li{margin:4px 0}
    .tr{color:#888}
    footer{margin-top:28px;color:#999;font-size:11px;text-align:center}
    @media print{body{margin:20px}}
  </style></head>
  <body>
    <div class="brand">Anglish Me</div>
    <h1>${escHtml(lesson.title)}</h1>
    <div class="tags"><span>${escHtml(lesson.level)}</span><span>${escHtml(lesson.topic)}</span><span>Week ${lesson.week} · Day ${lesson.day}</span></div>
    <div class="meta">Downloadable lesson</div>
    ${sections}
    <footer>Anglish Me · Your English journey</footer>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
  </body></html>`
}

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
  const { session, user } = useAuth()
  const [section, setSection] = useState(0)
  const lesson = getLesson(id)
  const token = session?.access_token
  const allowPdf = canDownloadPdf(user?.plan)

  const downloadPdf = useCallback(() => {
    const w = window.open('', '_blank')
    if (!w) return // popup blocked
    w.document.write(buildLessonPrintHtml(lesson))
    w.document.close()
  }, [lesson])

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
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <BookOpen size={16} />
            <span>{lesson.duration}</span>
          </div>
          {allowPdf ? (
            <button
              onClick={downloadPdf}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10 transition-all"
            >
              <Download size={13} /> PDF
            </button>
          ) : (
            <Link
              to="/plans"
              title="Downloadable PDFs are a Super feature"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
            >
              <Lock size={12} /> PDF
            </Link>
          )}
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
