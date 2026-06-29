import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mic, MicOff, Phone, PhoneOff, Volume2, Loader2, Lock, Send, Users, BookMarked, Sparkles, Languages, Check, X, RotateCcw, ChevronRight, Pencil, Trophy } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { useAuth } from '../lib/AuthContext'
import toast from 'react-hot-toast'
import { cn } from '../lib/utils'
import {
  getUsage, incrementUsage, analyzeConversation, groupRespond,
  getTodayTopic, fmtClock, type Usage,
} from '../lib/speakingApi'
import { buildFocus } from '../lib/focus'

// '' → caminhos relativos /api (proxy do Vite, sem CORS). Produção define VITE_API_URL.
const API = import.meta.env.VITE_API_URL || ''

const avatars = [
  { id: 'emma',    name: 'Emma',    accent: 'American English',    flag: '🇺🇸', voice: 'nova',    color: '#7F77DD', photo: '/tutors/emma.png',    desc: 'Warm & natural · Great for beginners' },
  { id: 'justin',  name: 'Justin',  accent: 'British English',     flag: '🇬🇧', voice: 'fable',   color: '#00D4FF', photo: '/tutors/justin.png',  desc: 'RP British · Polished & precise' },
  { id: 'adele',   name: 'Adele',   accent: 'British English',     flag: '🇬🇧', voice: 'shimmer', color: '#FF006E', photo: '/tutors/adele.png',   desc: 'Elegant British · Conversational' },
  { id: 'liam',    name: 'Liam',    accent: 'Australian English',  flag: '🇦🇺', voice: 'echo',    color: '#00FF88', photo: '/tutors/liam.png',    desc: 'Relaxed Aussie · Friendly & casual' },
  { id: 'thandi',  name: 'Thandi',  accent: 'South African English', flag: '🇿🇦', voice: 'shimmer', color: '#FFD700', photo: '/tutors/thandi.png',  desc: 'Confident SA accent · Clear delivery' },
  { id: 'aiko',    name: 'Aiko',    accent: 'Japanese English',    flag: '🇯🇵', voice: 'nova',    color: '#FF6B35', photo: '/tutors/aiko.png',    desc: 'Polite & precise · Perfect pace' },
  { id: 'priya',   name: 'Priya',   accent: 'Indian English',      flag: '🇮🇳', voice: 'shimmer', color: '#9B5DE5', photo: '/tutors/priya.png',   desc: 'Lively Indian English · Expressive' },
  { id: 'anselmo', name: 'Anselmo', accent: 'EN/PT Coach',         flag: '🇦🇴', voice: 'onyx',    color: '#00D4FF', photo: '/tutors/anselmo.png', desc: 'Founder · Bilingual PT/EN coach' },
]
type Tutor = typeof avatars[0]
const byId = (id: string) => avatars.find(a => a.id === id) ?? avatars[0]

type Message = { role: 'user' | 'assistant'; text: string; tutor?: string; audioUrl?: string }
type CallState = 'idle' | 'connecting' | 'active' | 'ending'
type Session = { access_token: string } | null

// fetch with a hard timeout so a hung request can never freeze the UI ("loading
// forever"). Aborts after `ms`.
async function fetchWithTimeout(url: string, opts: RequestInit, ms = 25000): Promise<Response> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(id) }
}

// Fetch the TTS audio (no autoplay). Returns a ready Audio + its object URL,
// so callers can play it sequentially and keep the url for a replay button.
async function fetchTts(text: string, voice: string, token?: string): Promise<{ audio: HTMLAudioElement; url: string } | null> {
  try {
    const res = await fetchWithTimeout(`${API}/api/speaking/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, voice }),
    }, 25000)
    if (!res.ok) return null
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    return { audio: new Audio(url), url }
  } catch { return null }
}

// Turn a getUserMedia failure into a clear, actionable message (silent failure
// is why "the button does nothing" - the mic was simply blocked).
// Request the mic safely. On an insecure origin (e.g. http://<LAN-IP> on a phone)
// navigator.mediaDevices is undefined - throw a clear, named error instead of a
// cryptic TypeError so micError() can explain how to fix it (open via https://).
async function getMicStream(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const e = new Error('Microphone needs a secure (https) connection')
    e.name = 'InsecureContextError'
    throw e
  }
  return navigator.mediaDevices.getUserMedia({ audio: true })
}

function micError(err: unknown) {
  const name = err instanceof Error ? err.name : ''
  console.error('Microphone error:', err)
  if (name === 'InsecureContextError') {
    toast.error('Para usar o microfone no telemóvel, abre a app por https:// (ligação segura), não http://. No PC usa localhost.', { duration: 9000 })
  } else if (name === 'NotAllowedError' || name === 'SecurityError') {
    toast.error('Microfone bloqueado. Clica no ícone 🎤/cadeado na barra de endereço e escolhe "Permitir", depois recarrega.', { duration: 7000 })
  } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    toast.error('Nenhum microfone encontrado neste dispositivo.', { duration: 6000 })
  } else if (name === 'NotReadableError') {
    toast.error('O microfone está a ser usado por outra app. Fecha-a e tenta de novo.', { duration: 6000 })
  } else {
    toast.error(`Não consegui aceder ao microfone${name ? ` (${name})` : ''}.`, { duration: 6000 })
  }
}

// Pick a recording format the device actually supports. iOS Safari only supports
// audio/mp4 (m4a) - NOT webm/ogg - so we must include it and name the upload with
// the matching extension, or Whisper rejects the file ("could not transcribe").
const REC_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus', 'audio/ogg']
function pickRecorderMime(): string | undefined {
  for (const m of REC_MIMES) {
    try { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m } catch { /* noop */ }
  }
  return undefined
}
function extForMime(mime: string): string {
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

// Play one audio to completion. ALWAYS resolves - on end, on error, or after a
// safety timeout - so a sequential playback loop can never hang.
function playFully(audio: HTMLAudioElement, maxMs = 30000): Promise<void> {
  return new Promise<void>(resolve => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(finish)
    setTimeout(finish, maxMs)
  })
}

// ─── Per-message actions: replay audio + translate to Portuguese ──────────────
function MessageActions({ text, audioUrl, voice, token }: {
  text: string; audioUrl?: string; voice: string; token?: string
}) {
  const [translated, setTranslated] = useState<string | null>(null)
  const [tLoading, setTLoading] = useState(false)
  const [replaying, setReplaying] = useState(false)

  const replay = async () => {
    setReplaying(true)
    try {
      // Reuse the cached audio if we have it, otherwise re-synthesize.
      if (audioUrl) { await playFully(new Audio(audioUrl)) }
      else { const tts = await fetchTts(text, voice, token); if (tts) await playFully(tts.audio) }
    } finally { setReplaying(false) }
  }

  const translate = async () => {
    if (translated) { setTranslated(null); return } // toggle off
    setTLoading(true)
    try {
      const res = await fetchWithTimeout(`${API}/api/chat/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      }, 20000)
      const data = await res.json() as { translation?: string }
      setTranslated(data.translation?.trim() || '-')
    } catch { toast.error('Tradução falhou') }
    finally { setTLoading(false) }
  }

  return (
    <>
      <div className="flex items-center gap-1.5 mt-1.5">
        <button onClick={() => void replay()} disabled={replaying}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-cyan transition-colors">
          {replaying ? <Loader2 size={11} className="animate-spin" /> : <Volume2 size={11} />} Listen
        </button>
        <button onClick={() => void translate()} disabled={tLoading}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-purple transition-colors">
          {tLoading ? <Loader2 size={11} className="animate-spin" /> : <Languages size={11} />} PT
        </button>
      </div>
      {translated && (
        <p className="mt-1 text-xs text-slate-400 italic border-l-2 border-purple/30 pl-2">{translated}</p>
      )}
    </>
  )
}

// ─── Talk → Pronunciation Practice (listen · repeat · confirm · grade) ─────────────────────────────────────────────
type PracticeKind = 'repeat' | 'translate'
type PracticeItem = {
  kind: PracticeKind
  say: string          // what the tutor SPEAKS (English to repeat, or Portuguese to translate)
  sayLang: 'en' | 'pt'
  answers: string[]    // acceptable English answers (answers[0] is shown as the model answer)
  hard?: boolean
}

// 10 starters (A1/A2) - words, phrases, and a few PT→EN translations - then 5 harder (B1).
const PRACTICE_ITEMS: PracticeItem[] = [
  { kind: 'repeat',    say: 'apple',                            sayLang: 'en', answers: ['apple'] },
  { kind: 'repeat',    say: 'beautiful',                        sayLang: 'en', answers: ['beautiful'] },
  { kind: 'repeat',    say: 'Good morning! How are you?',       sayLang: 'en', answers: ['good morning how are you'] },
  { kind: 'translate', say: 'Bom dia',                          sayLang: 'pt', answers: ['good morning'] },
  { kind: 'repeat',    say: 'I would like a cup of coffee.',    sayLang: 'en', answers: ['i would like a cup of coffee', 'i would like a coffee'] },
  { kind: 'translate', say: 'Eu gosto de aprender inglês',      sayLang: 'pt', answers: ['i like to learn english', 'i like learning english'] },
  { kind: 'repeat',    say: 'Wednesday',                        sayLang: 'en', answers: ['wednesday'] },
  { kind: 'repeat',    say: 'What time is it?',                 sayLang: 'en', answers: ['what time is it'] },
  { kind: 'translate', say: 'Onde fica a estação?',             sayLang: 'pt', answers: ['where is the station', 'where is the train station'] },
  { kind: 'repeat',    say: 'Nice to meet you!',               sayLang: 'en', answers: ['nice to meet you'] },
  // ── 5 harder challenges (B1) ──
  { kind: 'repeat',    say: "I've been studying English for two years.", sayLang: 'en', answers: ["i've been studying english for two years", 'i have been studying english for two years'], hard: true },
  { kind: 'translate', say: 'Se eu tivesse tempo, viajaria mais.',       sayLang: 'pt', answers: ['if i had time i would travel more'], hard: true },
  { kind: 'repeat',    say: 'entrepreneur',                              sayLang: 'en', answers: ['entrepreneur'], hard: true },
  { kind: 'repeat',    say: 'Could you tell me how to get to the airport?', sayLang: 'en', answers: ['could you tell me how to get to the airport'], hard: true },
  { kind: 'translate', say: 'Apesar da chuva, fomos passear.',          sayLang: 'pt', answers: ['despite the rain we went for a walk', 'in spite of the rain we went for a walk'], hard: true },
]

type Grade = 'correct' | 'almost' | 'wrong'
// A finished round logged in the history (so the student can review / retry it).
type CompletedSet = { setNumber: number; score: number; total: number; items: PracticeItem[]; wrongItems: PracticeItem[]; at: number }
const normalizeAns = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim()

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

// Best match ratio (0..1) of what the student said vs any acceptable answer.
function bestSimilarity(said: string, answers: string[]): number {
  const s = normalizeAns(said)
  let best = 0
  for (const ans of answers) {
    const a = normalizeAns(ans)
    const ratio = 1 - levenshtein(s, a) / Math.max(s.length, a.length, 1)
    if (ratio > best) best = ratio
  }
  return best
}

// "Simple" words: missing/extra/wrong ones count only as a minor slip (→ almost),
// never as a fatal error. Articles, prepositions, conjunctions, and be-verbs.
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'for', 'and', 'or', 'but',
  'with', 'from', 'by', 'as', 'is', 'are', 'am', 'was', 'were', 'be', 'been',
])
const BE_VERBS = new Set(['be', 'is', 'are', 'am', 'was', 'were', 'been', 'being'])

// Crude stem so tense/plural variants (study/studied/studying, train/trains)
// register as the SAME root → a near-miss, not a different word.
const stem = (w: string) => w.replace(/(ing|ed|es|s|d)$/, '')

// A substitution is "minor" (→ almost) when the words are clearly related:
// same stem (tense/plural), both be-verbs, or just a few letters off.
function isMinorSub(a: string, b: string): boolean {
  if (a === b) return false
  if (BE_VERBS.has(a) && BE_VERBS.has(b)) return true
  const sa = stem(a), sb = stem(b)
  if (sa.length >= 3 && sa === sb) return true
  const d = levenshtein(a, b)
  return d <= 2 && Math.max(a.length, b.length) >= 4
}

// Word-level edit alignment (match / substitute / missing / extra) so we can
// judge EACH difference individually instead of one blunt similarity score.
type WordOp = { type: 'match' | 'sub' | 'del' | 'ins'; a?: string; b?: string }
function alignWords(said: string[], expected: string[]): WordOp[] {
  const m = said.length, n = expected.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const cost = said[i - 1] === expected[j - 1] ? 0 : 1
    dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1)
  }
  const ops: WordOp[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (said[i - 1] === expected[j - 1] ? 0 : 1)) {
      ops.push(said[i - 1] === expected[j - 1]
        ? { type: 'match', a: said[i - 1], b: expected[j - 1] }
        : { type: 'sub', a: said[i - 1], b: expected[j - 1] })
      i--; j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: 'del', a: said[i - 1] }); i-- // extra word the student said
    } else {
      ops.push({ type: 'ins', b: expected[j - 1] }); j-- // word that is MISSING
    }
  }
  return ops.reverse()
}

// Is the expected answer a question? (works for both kinds - `say` is the English
// phrase for "repeat" and the Portuguese sentence for "translate".)
const isQuestionItem = (item: PracticeItem) => /\?\s*$/.test(item.say)

// The canonical answer to SHOW, with a "?" appended for questions.
function canonicalAnswer(item: PracticeItem): string {
  const a = item.answers[0]
  return isQuestionItem(item) && !/[?.!]$/.test(a.trim()) ? `${a}?` : a
}

// Rigorous, detail-sensitive grading:
//  • exact match → correct (unless a question's "?" is missing → almost)
//  • only minor slips (function word, tense/plural, a few letters) → almost
//  • a missing/wrong IMPORTANT word, or a big difference → wrong (no retry)
function gradeAnswer(saidRaw: string, item: PracticeItem): Grade {
  // Compare against the closest acceptable answer.
  const bestAns = item.answers.reduce((best, ans) =>
    bestSimilarity(saidRaw, [ans]) >= bestSimilarity(saidRaw, [best]) ? ans : best, item.answers[0])
  const said = normalizeAns(saidRaw).split(/\s+/).filter(Boolean)
  const expected = normalizeAns(bestAns).split(/\s+/).filter(Boolean)
  if (said.length === 0) return 'wrong'

  let major = 0, minor = 0
  for (const op of alignWords(said, expected)) {
    if (op.type === 'match') continue
    if (op.type === 'sub') {
      // related words (tense/spelling) OR one simple word swapped for another → minor
      const fnSwap = FUNCTION_WORDS.has(op.a!) && FUNCTION_WORDS.has(op.b!)
      isMinorSub(op.a!, op.b!) || fnSwap ? minor++ : major++
    }
    else if (op.type === 'ins') { FUNCTION_WORDS.has(op.b!) ? minor++ : major++ } // missing word
    else { FUNCTION_WORDS.has(op.a!) ? minor++ : major++ } // extra word
  }

  // Question typed/spoken without its "?" is a detail slip → almost.
  const questionMarkMissing = isQuestionItem(item) && !/\?/.test(saidRaw)

  if (major > 0) return 'wrong'                       // important word off / big difference
  if (minor === 0) return questionMarkMissing ? 'almost' : 'correct'
  if (minor <= 2) return 'almost'                     // a couple of small slips
  return 'wrong'                                      // too many slips → wrong
}

// English feedback that uses the student's name (spoken + written after grading).
// When grade is 'almost' on the first try, the correct answer is intentionally
// NOT revealed - the student must find the detail themselves on the retry.
function makeFeedback(g: Grade, name: string, answer: string, isRetry = false): string {
  if (g === 'correct') {
    const opts = [`Perfect, ${name}! That's exactly right.`, `Excellent, ${name}! Spot on.`, `Great job, ${name}! Nice and clear.`]
    return opts[Math.floor(Math.random() * opts.length)]
  }
  if (g === 'almost' && !isRetry) return `Almost, ${name}! Pay attention to every detail - listen again and try once more.`
  return `The correct answer is "${answer}", ${name}. Keep practising - you'll get it!`
}

// ─── Web-Audio success/almost/wrong sounds (no audio files needed) ────────────
let _audioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!_audioCtx) _audioCtx = new Ctor()
    return _audioCtx
  } catch { return null }
}
function beep(freq: number, startAt: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) {
  const ctx = getAudioCtx(); if (!ctx) return
  const t0 = ctx.currentTime + startAt
  const osc = ctx.createOscillator(); const g = ctx.createGain()
  osc.type = type; osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(t0); osc.stop(t0 + dur + 0.03)
}
// Rising C–E–G–C arpeggio - the "addictive" success ding.
function playSuccessSound() { beep(523.25, 0, 0.13); beep(659.25, 0.1, 0.13); beep(783.99, 0.2, 0.13); beep(1046.5, 0.3, 0.3) }
function playAlmostSound() { beep(523.25, 0, 0.13); beep(587.33, 0.12, 0.22) }
function playWrongSound() { beep(196, 0, 0.22, 'sawtooth', 0.13); beep(155.56, 0.18, 0.3, 'sawtooth', 0.13) }

// ─── Practice mode (the new "Talk") ───────────────────────────────────────────
function PracticeMode({ avatar, session, locked, onTimeSpent, userName, level, focus, userId }: {
  avatar: Tutor; session: Session; locked: boolean
  onTimeSpent: (mode: 'pushtotalk', seconds: number) => void
  userName: string; level: string; focus?: string; userId: string
}) {
  type Phase = 'idle' | 'recording' | 'processing' | 'confirm' | 'result' | 'done'
  type RoundType = 'set' | 'repeat' | 'mistakes'
  const storageKey = `practice:${userId}`
  const historyKey = `practiceHistory:${userId}`
  // Per-item outcome (the single source of truth for the score). idx → result.
  type Outcome = Record<number, 'correct' | 'wrong'>
  // Load saved progress - or fall back to the static seed set.
  const initial = (() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const s = JSON.parse(raw) as { idx?: number; results?: Outcome; items?: PracticeItem[]; setNumber?: number; roundType?: RoundType }
        if (Array.isArray(s.items) && s.items.length >= 1)
          return { idx: s.idx ?? 0, results: s.results ?? {}, items: s.items, setNumber: s.setNumber ?? 1, roundType: s.roundType ?? 'set' as RoundType }
      }
    } catch { /* corrupt - ignore */ }
    return { idx: 0, results: {} as Outcome, items: PRACTICE_ITEMS, setNumber: 1, roundType: 'set' as RoundType }
  })()
  const loadHistory = (): CompletedSet[] => {
    try {
      const raw = localStorage.getItem(historyKey)
      if (raw) {
        const h = JSON.parse(raw)
        // Normalise score = total − errors (repairs older entries saved with a buggy score).
        if (Array.isArray(h)) return h.map((e: CompletedSet) => ({ ...e, score: Math.max(0, (e.total ?? 0) - (e.wrongItems?.length ?? 0)) }))
      }
    } catch { /* ignore */ }
    return []
  }
  const [items, setItems] = useState<PracticeItem[]>(initial.items)
  const [idx, setIdx] = useState(initial.idx)
  const [phase, setPhase] = useState<Phase>('idle')
  const [draft, setDraft] = useState('')        // editable transcription
  const [grade, setGrade] = useState<Grade | null>(null)
  const [feedback, setFeedback] = useState('')
  const [results, setResults] = useState<Outcome>(initial.results)
  const [setNumber, setSetNumber] = useState(initial.setNumber)
  const [generating, setGenerating] = useState(false)
  const [retryAfterAlmost, setRetryAfterAlmost] = useState(false)
  const [roundType, setRoundType] = useState<RoundType>(initial.roundType)
  const [history, setHistory] = useState<CompletedSet[]>(loadHistory)
  const [showHistory, setShowHistory] = useState(false)  // persistent "sets & errors" panel

  const total = items.length
  const item = items[idx]
  // Derived from `results` so they can NEVER drift apart: an item is either correct
  // or an error, and score + errors always add up.
  const score = Object.values(results).filter(r => r === 'correct').length
  const wrongItems = items.filter((_, i) => results[i] === 'wrong')

  // Persist progress so the student resumes exactly where they stopped.
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ idx, results, items, setNumber, roundType })) } catch { /* quota - ignore */ }
  }, [idx, results, items, setNumber, roundType, storageKey])

  // Persist the completed-sets history.
  useEffect(() => {
    try { localStorage.setItem(historyKey, JSON.stringify(history)) } catch { /* quota - ignore */ }
  }, [history, historyKey])

  // Ask GPT for a fresh 15-item set tailored to the student's level.
  const generateNewSet = useCallback(async (): Promise<PracticeItem[] | null> => {
    const token = session?.access_token
    if (!token) return null
    setGenerating(true)
    try {
      const res = await fetchWithTimeout(`${API}/api/speaking/practice-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ level, seed: Date.now(), focus }),
      }, 30000)
      if (!res.ok) return null
      const data = await res.json() as { items?: PracticeItem[] }
      return (data.items && data.items.length >= 5) ? data.items : null
    } catch { return null }
    finally { setGenerating(false) }
  }, [session, level, focus])

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recStartRef = useRef(0)
  const pressingRef = useRef(false)
  const liveRef = useRef(true)
  const promptAudioRef = useRef<HTMLAudioElement | null>(null)
  const fbAudioRef = useRef<HTMLAudioElement | null>(null)

  const stopStream = () => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch { /* noop */ }
    streamRef.current = null
  }
  const stopAudio = () => {
    try { promptAudioRef.current?.pause() } catch { /* noop */ }
    try { fbAudioRef.current?.pause() } catch { /* noop */ }
  }

  // Speak the prompt for the current item (English to repeat, or Portuguese to
  // translate). Listening-first: the text stays HIDDEN until after grading.
  const speakPrompt = useCallback(async () => {
    const token = session?.access_token
    if (!token || !liveRef.current) return
    const tts = await fetchTts(item.say, avatar.voice, token)
    if (!tts || !liveRef.current) return
    stopAudio(); promptAudioRef.current = tts.audio
    void playFully(tts.audio)
  }, [item.say, session, avatar.voice]) // eslint-disable-line

  // liveRef true on (re)mount - StrictMode-safe (see note in the other modes).
  useEffect(() => {
    liveRef.current = true
    return () => { liveRef.current = false; stopStream(); stopAudio() }
  }, [])

  // Save a pronunciation mistake directly to My Mistakes (no GPT needed).
  const savePracticeMistake = useCallback(async (said: string) => {
    const token = session?.access_token
    if (!token) return
    try {
      await fetchWithTimeout(`${API}/api/speaking/practice-mistake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ said, answer: canonicalAnswer(item), prompt: item.say, tutor: avatar.id }),
      }, 10000)
    } catch { /* non-critical - don't show an error toast */ }
  }, [item.say, session, avatar.id]) // eslint-disable-line

  // New item OR new set/round → reset state and auto-play the prompt. Depending on
  // `items` too means loading a new round (idx still 0) still re-triggers the speak.
  useEffect(() => {
    setPhase('idle'); setDraft(''); setGrade(null); setFeedback(''); setRetryAfterAlmost(false)
    void speakPrompt()
  }, [idx, items]) // eslint-disable-line

  const startRecording = async () => {
    if (locked || phase === 'processing') return
    if (mediaRef.current || pressingRef.current) return
    pressingRef.current = true
    stopAudio()
    try {
      const stream = await getMicStream()
      streamRef.current = stream
      if (!pressingRef.current) { stopStream(); return }
      const mimeType = pickRecorderMime()
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(); mediaRef.current = mr; recStartRef.current = Date.now(); setPhase('recording')
    } catch (err) { pressingRef.current = false; stopStream(); micError(err) }
  }

  const stopRecording = () => {
    pressingRef.current = false
    if (!mediaRef.current) { stopStream(); return }
    const elapsed = (Date.now() - recStartRef.current) / 1000
    const mr = mediaRef.current
    mediaRef.current = null
    mr.onstop = async () => {
      stopStream(); setPhase('processing')
      if (elapsed >= 1) onTimeSpent('pushtotalk', elapsed)
      const blobType = mr.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: blobType })
      const fd = new FormData(); fd.append('audio', blob, `speech.${extForMime(blobType)}`)
      try {
        const token = session?.access_token
        if (!token) { setPhase('idle'); toast.error('Sessão expirada - recarrega a página.'); return }
        const res = await fetchWithTimeout(`${API}/api/speaking/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }, 30000)
        if (!res.ok) { setPhase('idle'); toast.error('Não consegui transcrever. Tenta de novo.'); return }
        const { text } = await res.json() as { text: string }
        if (!liveRef.current) return
        if (!text?.trim()) { setPhase('idle'); toast('Não percebi - fala mais perto e segura o botão enquanto falas.', { icon: '🎤', duration: 4000 }); return }
        setDraft(text.trim()); setPhase('confirm')
      } catch { setPhase('idle'); toast.error('Erro ao processar a fala. Tenta de novo.') }
    }
    try { mr.stop() } catch { stopStream() }
  }

  const confirmAnswer = async () => {
    const g = gradeAnswer(draft, item)
    setGrade(g); setPhase('result')
    if (g === 'correct') playSuccessSound()
    else if (g === 'almost' && !retryAfterAlmost) playAlmostSound()
    else playWrongSound()
    // Record THIS item's outcome (overwrites on a retry). Only 'correct' counts;
    // anything else (wrong, or an almost not yet fixed) is an error for this round.
    setResults(prev => ({ ...prev, [idx]: g === 'correct' ? 'correct' : 'wrong' }))
    // Save to My Mistakes only once it's a confirmed miss: wrong outright, or a failed retry.
    if (g === 'wrong' || (retryAfterAlmost && g !== 'correct')) {
      void savePracticeMistake(draft)
    }
    const fb = makeFeedback(g, userName, canonicalAnswer(item), retryAfterAlmost)
    setFeedback(fb)
    // The tutor SPEAKS the feedback too - keeps the listening practice going.
    const token = session?.access_token
    if (token) {
      const tts = await fetchTts(fb, avatar.voice, token)
      if (tts && liveRef.current) { stopAudio(); fbAudioRef.current = tts.audio; void playFully(tts.audio) }
    }
  }

  // Log a finished NUMBERED set into the history (once). Repeats/mistakes rounds aren't logged.
  const finishCurrent = () => {
    if (roundType !== 'set') return
    setHistory(prev => prev.some(h => h.setNumber === setNumber)
      ? prev
      : [...prev, { setNumber, score, total, items, wrongItems, at: Date.now() }])
  }
  const next = () => { if (idx + 1 >= total) { finishCurrent(); setPhase('done') } else setIdx(i => i + 1) }
  const retry = () => { setDraft(''); setGrade(null); setFeedback(''); setRetryAfterAlmost(true); setPhase('idle'); void speakPrompt() }

  // Load a list of items as the current round (shared by all the "start" helpers).
  const loadRound = (roundItems: PracticeItem[], type: RoundType) => {
    // Copy so the array identity always changes → the [idx, items] effect always
    // re-fires (even when repeating the very same set), resetting + speaking item 1.
    setItems([...roundItems]); setIdx(0); setResults({}); setRoundType(type)
    setRetryAfterAlmost(false); setShowHistory(false); setPhase('idle')
  }
  // After finishing a set, generate the NEXT set with AI (so it's never the same again).
  const startNextSet = async () => {
    const fresh = await generateNewSet()
    if (!fresh) { toast.error('Não consegui gerar novos exercícios. Tenta de novo.'); return }
    setSetNumber(n => n + 1); loadRound(fresh, 'set')
  }
  // Replay the SAME set (no new history entry).
  const restartSame = () => loadRound(items, 'repeat')
  // Drill ONLY the errors - repeat them until they're all right.
  const startMistakesRound = (mItems: PracticeItem[]) => { if (mItems.length) loadRound(mItems, 'mistakes') }
  // Repeat a previously completed set from the history.
  const repeatHistorySet = (h: CompletedSet) => loadRound(h.items, 'repeat')

  // All errors across every completed set, de-duplicated - the "Errors" pool to drill.
  const allErrors = Array.from(new Map(history.flatMap(h => h.wrongItems).map(it => [it.say, it])).values())

  // Shared list of completed sets (used on the summary screen AND the history panel).
  const completedList = (
    <div className="space-y-1.5">
      {history.slice().reverse().map(h => (
        <div key={h.setNumber} className="flex items-center gap-2 bg-bg-elevated rounded-xl px-3 py-2">
          <Check size={14} className="text-green flex-shrink-0" />
          <span className="text-sm text-slate-200 flex-1">Set {h.setNumber}</span>
          <span className="text-xs text-slate-400">{h.score}/{h.total}</span>
          <button onClick={() => repeatHistorySet(h)}
            className="text-xs px-2.5 py-1 rounded-lg border border-white/10 text-slate-300 hover:border-purple/40 hover:text-white transition-all">
            Repeat
          </button>
          {h.wrongItems.length > 0 && (
            <button onClick={() => startMistakesRound(h.wrongItems)}
              className="text-xs px-2.5 py-1 rounded-lg border border-pink/30 text-pink hover:bg-pink/10 transition-all">
              Errors ({h.wrongItems.length})
            </button>
          )}
        </div>
      ))}
    </div>
  )

  // ── Persistent panel: completed sets + a pool of all errors to drill ──────────
  if (showHistory) {
    return (
      <div className="flex flex-col h-full overflow-y-auto py-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">Completed & errors</h3>
          <button onClick={() => setShowHistory(false)}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:border-purple/40 hover:text-white transition-all">
            ← Back to practice
          </button>
        </div>

        {allErrors.length > 0 && (
          <button onClick={() => startMistakesRound(allErrors)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-pink text-white font-semibold hover:scale-[1.02] transition-all mb-4">
            <RotateCcw size={16} /> Practice all my errors ({allErrors.length})
          </button>
        )}

        <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Completed sets</p>
        {history.length > 0 ? completedList : (
          <p className="text-sm text-slate-500 py-6 text-center">No completed sets yet. Finish a set and it shows up here - ready to repeat or drill its errors.</p>
        )}
        <p className="text-[11px] text-slate-600 mt-4 text-center">Tip: “My mistakes” lists every correction to read. Here you re-practise them. 🔁</p>
      </div>
    )
  }

  // ── Summary screen ──
  if (phase === 'done') {
    const pct = total ? Math.round((score / total) * 100) : 0
    const color = pct >= 70 ? '#00FF88' : pct >= 40 ? '#FFD700' : '#FF006E'
    const isMistakes = roundType === 'mistakes'
    return (
      <div className="flex flex-col items-center h-full overflow-y-auto py-6 gap-4">
        <Trophy size={44} className={pct >= 70 ? 'text-green' : 'text-gold'} />
        <h3 className="text-xl font-black text-white text-center">
          {isMistakes ? `Error review done, ${userName}!` : `Practice complete, ${userName}!`}
        </h3>
        <p className="text-4xl font-black" style={{ color }}>{score} / {total}</p>
        <p className="text-slate-400 text-sm max-w-xs text-center">
          {wrongItems.length === 0 ? (isMistakes ? 'You fixed them all - brilliant! 🎯' : 'Flawless round - amazing! 🌟')
            : pct >= 70 ? 'Great work - almost there! 💪'
            : pct >= 40 ? 'Good effort! Drill the errors below to lock them in. 🔁'
            : 'Keep going - repeat the errors below to improve. 🔁'}
        </p>

        {/* Drill only the errors of THIS round */}
        {wrongItems.length > 0 && (
          <button onClick={() => startMistakesRound(wrongItems)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink text-white font-semibold hover:scale-105 transition-all">
            <RotateCcw size={16} /> Practice errors ({wrongItems.length})
          </button>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => void startNextSet()} disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple text-white font-semibold hover:scale-105 transition-all disabled:opacity-60">
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? 'Generating new set…' : 'New set'}
          </button>
          <button onClick={restartSame}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 text-slate-200 hover:border-purple/40 transition-all">
            <RotateCcw size={16} /> {isMistakes ? 'Repeat errors' : 'Repeat this set'}
          </button>
        </div>

        {/* Completed-sets history - review or retry any past set */}
        {history.length > 0 && (
          <div className="w-full max-w-sm mt-3 border-t border-white/10 pt-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 text-center">Completed sets</p>
            {completedList}
          </div>
        )}

        <p className="text-[11px] text-slate-500 mt-1">Your progress is saved automatically.</p>
      </div>
    )
  }

  const enteredHardStage = roundType === 'set' && item.hard && idx > 0 && !items[idx - 1].hard

  return (
    <div className="flex flex-col h-full">
      {/* progress */}
      <div className="mb-4">
        <div className="flex justify-between items-center text-xs mb-1.5">
          <span className="text-slate-400">
            {roundType === 'mistakes' ? '🔁 Error practice' : item.hard ? '🔥 Challenge' : 'Practice'}
            {roundType === 'set' ? ` · Set ${setNumber}` : ''} · {idx + 1} / {total}
          </span>
          <span className="text-slate-500">Score: <span className="text-gold font-semibold">{score}</span></span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-purple to-cyan transition-all" style={{ width: `${(idx / total) * 100}%` }} />
        </div>
        {(history.length > 0 || allErrors.length > 0) && (
          <button onClick={() => setShowHistory(true)}
            className="mt-2 ml-auto flex items-center gap-1 text-[11px] text-slate-500 hover:text-purple transition-colors">
            <Trophy size={11} /> Completed & errors
            {allErrors.length > 0 && <span className="text-pink">· {allErrors.length} to fix</span>}
          </button>
        )}
      </div>

      {enteredHardStage && <p className="text-center text-sm text-gold mb-3">🔥 Level up! 5 harder challenges - you’ve got this, {userName}!</p>}

      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 min-h-[210px]">
        {/* instruction - the prompt text stays hidden until the result (listening first) */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            {item.kind === 'translate' ? 'Listen in Portuguese · say it in English' : 'Listen · then repeat'}
          </span>
          <button onClick={() => void speakPrompt()} disabled={phase === 'recording' || phase === 'processing'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-slate-200 hover:border-purple/40 hover:text-white transition-all disabled:opacity-40">
            <Volume2 size={16} /> Hear {item.kind === 'translate' ? 'the sentence' : 'it'} again
          </button>
        </div>

        {/* result indicator + feedback */}
        {phase === 'result' && grade && (
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-2">
            <div className={cn('w-16 h-16 rounded-full flex items-center justify-center',
              grade === 'correct' ? 'bg-green/20' : grade === 'almost' ? 'bg-gold/20' : 'bg-pink/20')}>
              {grade === 'wrong' ? <X size={30} className="text-pink" /> : <Check size={30} className={grade === 'correct' ? 'text-green' : 'text-gold'} />}
            </div>
            <p className={cn('text-sm font-medium max-w-sm', grade === 'correct' ? 'text-green' : grade === 'almost' ? 'text-gold' : 'text-pink')}>{feedback}</p>
            {/* Show correct answer only when correct or definitively wrong - never during an "almost" first attempt */}
            {(grade === 'correct' || grade === 'wrong' || (grade === 'almost' && retryAfterAlmost)) && (
              <p className="text-xs text-slate-400">Answer: <span className="text-white font-semibold">{canonicalAnswer(item)}</span></p>
            )}
          </motion.div>
        )}

        {/* editable transcription */}
        {phase === 'confirm' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm flex flex-col gap-2">
            <span className="text-xs text-slate-500 flex items-center gap-1 justify-center"><Pencil size={11} /> You said (edit if it's wrong):</span>
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void confirmAnswer() }} autoFocus
              className="bg-bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-center text-white outline-none focus:border-purple/40" />
            <button onClick={() => void confirmAnswer()} disabled={!draft.trim()}
              className="mt-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-green text-bg font-bold hover:scale-[1.02] transition-all disabled:opacity-40">
              <Check size={16} /> Confirm
            </button>
          </motion.div>
        )}
      </div>

      {/* action row */}
      <div className="flex flex-col items-center gap-3 mt-2">
        {phase === 'result' ? (
          <div className="flex items-center gap-3">
            {grade === 'almost' && !retryAfterAlmost && (
              <button onClick={retry} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 text-slate-200 hover:border-purple/40 transition-all">
                <RotateCcw size={15} /> Try again
              </button>
            )}
            <button onClick={next} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple text-white font-semibold hover:scale-105 transition-all">
              {idx + 1 >= total ? 'Finish' : 'Next'} <ChevronRight size={16} />
            </button>
          </div>
        ) : phase === 'confirm' ? (
          <p className="text-xs text-slate-500">Confirm or edit your answer above</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {locked ? 'Daily limit reached' : phase === 'recording' ? '🔴 Recording… release when done' : phase === 'processing' ? 'Processing…' : 'Hold and say it out loud'}
            </p>
            <button
              onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void startRecording() }}
              onPointerUp={e => { try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ } stopRecording() }}
              onPointerCancel={stopRecording}
              disabled={phase === 'processing' || locked}
              className={cn('w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 select-none touch-none',
                locked ? 'bg-bg-elevated opacity-50 cursor-not-allowed'
                  : phase === 'recording' ? 'bg-pink scale-110 shadow-[0_0_30px_rgba(255,0,110,0.5)]'
                  : phase === 'processing' ? 'bg-bg-elevated opacity-60'
                  : 'bg-purple hover:scale-105 shadow-[0_0_20px_rgba(127,119,221,0.4)]')}>
              {locked ? <Lock size={20} className="text-white" />
                : phase === 'processing' ? <Loader2 size={22} className="text-white animate-spin" />
                : phase === 'recording' ? <MicOff size={22} className="text-white" />
                : <Mic size={22} className="text-white" />}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Realtime (WebRTC phone call) ─────────────────────────────────────────────
function RealtimeMode({ avatar, level, topic, session, usage, focus, onTimeSpent, onSessionEnd }: {
  avatar: Tutor; level: string; topic?: string; session: Session; usage: Usage | null; focus?: string
  onTimeSpent: (mode: 'realtime', seconds: number) => void
  onSessionEnd: (messages: Message[], tutor: string, mode: string) => void
}) {
  const [callState, setCallState] = useState<CallState>('idle')
  const [transcript, setTranscript] = useState<Message[]>([])
  const [speaking, setSpeaking] = useState<'user' | 'ai' | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null) // dedicated handle → mic ALWAYS released
  const audioRef = useRef<HTMLAudioElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef = useRef(transcript)
  transcriptRef.current = transcript

  // Phone Call is weekly: `locked` once the week's call is used; each call may
  // last up to `callBudget` seconds.
  const locked = usage?.phonecall.locked ?? false
  const callBudget = usage?.phonecall.callSeconds ?? 300

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript])

  // Fully close the WebRTC connection so the OpenAI Realtime session STOPS
  // billing. Closing the peer connection + stopping the mic tracks ends the
  // session server-side. Must run on end, on unmount, and on tab close.
  const teardown = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    try { dcRef.current?.close() } catch { /* noop */ }
    try {
      pcRef.current?.getSenders().forEach(s => { try { s.track?.stop() } catch { /* noop */ } })
      pcRef.current?.close()
    } catch { /* noop */ }
    // Stop the mic stream directly too - the red recording dot only goes off when
    // EVERY track ends, and relying on the senders alone has left it on before.
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()) } catch { /* noop */ }
    micStreamRef.current = null
    pcRef.current = null
    dcRef.current = null
    if (audioRef.current) audioRef.current.srcObject = null
  }, [])

  const endCall = useCallback((reason?: 'limit') => {
    const spent = startRef.current ? (Date.now() - startRef.current) / 1000 : 0
    startRef.current = 0
    setCallState('ending')
    teardown()
    if (spent >= 1) onTimeSpent('realtime', spent)
    onSessionEnd(transcriptRef.current, avatar.id, 'realtime')
    if (reason === 'limit') toast('⏱️ Phone Call time is up - your next one unlocks next week!', { icon: '👋' })
    setTimeout(() => { setCallState('idle'); setTranscript([]); setSpeaking(null); setElapsed(0) }, 500)
  }, [avatar.id, onTimeSpent, onSessionEnd, teardown])

  const startCall = useCallback(async () => {
    if (pcRef.current) return // a call is already open - never open a second one
    setCallState('connecting')
    try {
      const tokenRes = await fetch(`${API}/api/speaking/realtime-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ level, avatar: avatar.id, topic, focus }),
      })
      if (!tokenRes.ok) {
        const errBody = await tokenRes.json().catch(() => ({})) as { error?: string }
        throw new Error(errBody.error ?? 'Token failed')
      }
      const { value: ephemeralKey, model } = await tokenRes.json() as { value: string; model: string }

      const pc = new RTCPeerConnection()
      pcRef.current = pc
      pc.ontrack = e => { if (audioRef.current) audioRef.current.srcObject = e.streams[0] }
      const stream = await getMicStream()
      micStreamRef.current = stream // keep a direct handle so teardown can always stop it
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.onmessage = e => {
        try {
          const ev = JSON.parse(e.data as string) as {
            type: string; delta?: string; transcript?: string
            item?: { content?: { transcript?: string }[] }
          }
          if (ev.type === 'input_audio_buffer.speech_started') setSpeaking('user')
          if (ev.type === 'input_audio_buffer.speech_stopped') setSpeaking(null)
          if (ev.type === 'response.audio.delta') setSpeaking('ai')
          if (ev.type === 'response.audio.done') setSpeaking(null)
          if (ev.type === 'conversation.item.input_audio_transcription.completed' && ev.transcript) {
            setTranscript(prev => [...prev, { role: 'user', text: ev.transcript! }])
          }
          if (ev.type === 'response.text.done' && ev.delta) {
            setTranscript(prev => [...prev, { role: 'assistant', text: ev.delta! }])
          }
          if (ev.type === 'response.content_part.done' && ev.item?.content?.[0]?.transcript) {
            setTranscript(prev => {
              const last = prev[prev.length - 1]
              if (last?.role === 'assistant') return prev
              return [...prev, { role: 'assistant', text: ev.item!.content![0].transcript! }]
            })
          }
        } catch { /* ignore */ }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const sdpRes = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })
      if (!sdpRes.ok) { console.error('SDP failed:', sdpRes.status, await sdpRes.text().catch(() => '')); throw new Error('SDP exchange failed') }
      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

      startRef.current = Date.now()
      setCallState('active')
      setTranscript([{ role: 'assistant', text: `Connected! I'm ${avatar.name}.${topic ? ` Let's talk about ${topic}.` : ''} 🎤` }])

      // Live timer + auto-stop when the daily allowance runs out
      timerRef.current = setInterval(() => {
        const s = (Date.now() - startRef.current) / 1000
        setElapsed(s)
        if (s >= callBudget) endCall('limit')
      }, 1000)
    } catch (err) {
      console.error('Realtime call error:', err)
      const msg = err instanceof Error ? err.message : 'Could not start call'
      toast.error(msg.length < 90 ? msg : 'Could not start call. Please try again.')
      setCallState('idle')
    }
  }, [avatar, level, topic, session, focus, callBudget, endCall])

  // Leaving the page / switching mode while a call is open must close it,
  // otherwise the Realtime session keeps billing in the background.
  useEffect(() => {
    const onLeave = () => teardown()
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('beforeunload', onLeave)
      if (pcRef.current) {
        const spent = startRef.current ? (Date.now() - startRef.current) / 1000 : 0
        if (spent >= 1) onTimeSpent('realtime', spent)
      }
      teardown()
    }
  }, [teardown, onTimeSpent])

  return (
    <div className="flex flex-col h-full">
      <audio ref={audioRef} autoPlay className="hidden" />
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[180px]">
        {callState === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-24 h-24 rounded-full overflow-hidden mb-3 relative"
              style={{ boxShadow: `0 0 0 3px ${avatar.color}55, 0 0 40px ${avatar.color}30` }}>
              <img src={avatar.photo} alt={avatar.name} className="w-full h-full object-cover" />
            </div>
            {locked ? (
              <p className="text-slate-400 text-sm">You've used your Phone Call this week. It renews next week! 🌙</p>
            ) : (
              <>
                <p className="text-slate-400 text-sm">Press <span className="text-green font-semibold">Call</span> to talk with {avatar.name}</p>
                <p className="text-slate-600 text-xs mt-1">1 call per week · up to {fmtClock(callBudget)} · OpenAI Realtime</p>
              </>
            )}
          </div>
        )}
        {callState === 'connecting' && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={28} className="text-cyan animate-spin" />
            <p className="text-slate-400 text-sm">Connecting to {avatar.name}…</p>
          </div>
        )}
        {(callState === 'active' || callState === 'ending') && (
          <>
            {transcript.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                  msg.role === 'assistant' ? 'bg-bg-elevated text-[var(--text)] rounded-tl-sm'
                    : 'bg-purple/20 text-white border border-purple/25 rounded-tr-sm')}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
            {speaking === 'ai' && (
              <div className="flex justify-start">
                <div className="bg-bg-elevated rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                  {[0,1,2,3].map(i => (
                    <motion.span key={i} className="w-1 h-4 bg-cyan rounded-full"
                      animate={{ scaleY: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.1 }} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex flex-col items-center gap-3">
        {callState === 'active' ? (
          <>
            <div className="flex items-center gap-2 text-xs text-green">
              <span className="w-2 h-2 rounded-full bg-green animate-pulse" />
              Live · {fmtClock(elapsed)} / {fmtClock(callBudget)}
            </div>
            <button onClick={() => endCall()}
              className="w-16 h-16 rounded-full bg-pink flex items-center justify-center shadow-[0_0_30px_rgba(255,0,110,0.4)] hover:scale-105 transition-all">
              <PhoneOff size={22} className="text-white" />
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {callState === 'connecting' ? 'Connecting…' : locked ? 'Renews next week' : 'Phone-call-like AI conversation'}
            </p>
            <button onClick={() => void startCall()} disabled={callState === 'connecting' || locked}
              className={cn('w-16 h-16 rounded-full flex items-center justify-center transition-all',
                locked ? 'bg-bg-elevated opacity-50 cursor-not-allowed'
                  : callState === 'connecting' ? 'bg-bg-elevated opacity-60'
                  : 'bg-green hover:scale-105 shadow-[0_0_30px_rgba(0,255,136,0.4)]')}>
              {locked ? <Lock size={20} className="text-white" />
                : callState === 'connecting' ? <Loader2 size={22} className="text-white animate-spin" />
                : <Phone size={22} className="text-white" />}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Group chat (text / push-to-talk, multiple tutors) ────────────────────────
function GroupMode({ tutors, level, topic, session, locked, focus, onTimeSpent, onSessionEnd }: {
  tutors: Tutor[]; level: string; topic?: string; session: Session; locked: boolean; focus?: string
  onTimeSpent: (mode: 'group', seconds: number) => void
  onSessionEnd: (messages: Message[], tutor: string, mode: string) => void
}) {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant', tutor: tutors[0]?.id,
    text: `Hey! We're ${tutors.map(t => t.name).join(', ')}. ${topic ? `Let's chat about ${topic}!` : "Let's chat!"} 👋`,
  }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null) // dedicated handle so the mic ALWAYS gets released
  const chunksRef = useRef<Blob[]>([])
  const recStartRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const msgsRef = useRef(messages)
  msgsRef.current = messages
  const liveRef = useRef(true)
  const audiosRef = useRef<HTMLAudioElement[]>([])

  const stopStream = () => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch { /* noop */ }
    streamRef.current = null
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  // On leaving: stop the loop, silence any playing/queued audio (so tutors don't
  // keep "talking by themselves"), ALWAYS free the mic, and analyze the convo.
  // liveRef MUST be reset true on (re)mount - see WhisperMode note. StrictMode's
  // setup→cleanup→setup otherwise leaves it false and the voice turn bails silently.
  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
      audiosRef.current.forEach(a => { try { a.pause() } catch { /* noop */ } })
      audiosRef.current = []
      stopStream()
      onSessionEnd(msgsRef.current, tutors.map(t => t.id).join('+'), 'group')
    }
  }, []) // eslint-disable-line

  const send = async (userText: string) => {
    if (!userText.trim() || busy) return
    const withUser: Message[] = [...msgsRef.current, { role: 'user', text: userText }]
    setMessages(withUser); setInput(''); setBusy(true)
    try {
      const token = session?.access_token
      if (!token) { toast.error('Sessão expirada - recarrega a página.'); return }
      const replies = await groupRespond({
        messages: withUser.map(m => ({ role: m.role, content: m.tutor ? `${byId(m.tutor).name}: ${m.text}` : m.text })),
        tutors: tutors.map(t => t.id), level, topic, focus,
      }, token)
      if (!replies.length) { toast.error('Os tutores não responderam. Tenta de novo.'); return }
      // Sequential: fetch each tutor's audio, show the bubble, play to completion,
      // THEN move to the next. No more overlapping voices.
      for (const r of replies) {
        if (!liveRef.current) break
        const t = byId(r.tutor)
        const tts = await fetchTts(r.text, t.voice, token)
        if (!liveRef.current) break
        setMessages(prev => [...prev, { role: 'assistant', text: r.text, tutor: r.tutor, audioUrl: tts?.url }])
        if (tts) { audiosRef.current.push(tts.audio); await playFully(tts.audio) }
      }
    } catch { toast.error('Erro no chat de grupo. Tenta de novo.') }
    finally { setBusy(false) }
  }

  const pressingRef = useRef(false)
  const startRecording = async () => {
    if (locked) { toast.error('Daily limit reached.'); return }
    if (mediaRef.current || pressingRef.current) return
    pressingRef.current = true
    try {
      const stream = await getMicStream()
      streamRef.current = stream
      if (!pressingRef.current) { stopStream(); return }
      const mimeType = pickRecorderMime()
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(); mediaRef.current = mr; recStartRef.current = Date.now(); setRecording(true)
    } catch (err) { pressingRef.current = false; stopStream(); micError(err) }
  }
  const stopRecording = () => {
    pressingRef.current = false
    if (!mediaRef.current) { stopStream(); return }
    const elapsed = (Date.now() - recStartRef.current) / 1000
    const mr = mediaRef.current
    mediaRef.current = null // free it so the next press can record
    mr.onstop = async () => {
      stopStream() // release mic - final chunk was already flushed by mr.stop()
      setRecording(false); setBusy(true)
      if (elapsed >= 1) onTimeSpent('group', elapsed)
      const blobType = mr.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: blobType })
      const fd = new FormData(); fd.append('audio', blob, `speech.${extForMime(blobType)}`)
      try {
        const token = session?.access_token
        if (!token) { setBusy(false); toast.error('Sessão expirada - recarrega a página.'); return }
        const res = await fetchWithTimeout(`${API}/api/speaking/transcribe`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
        }, 30000)
        if (!res.ok) { setBusy(false); toast.error('Não consegui transcrever. Tenta de novo.'); return }
        const { text } = await res.json() as { text: string }
        setBusy(false)
        if (!liveRef.current) return
        if (text?.trim()) await send(text)
        else toast('Não percebi - fala mais perto e segura o botão enquanto falas.', { icon: '🎤', duration: 5000 })
      } catch { setBusy(false); toast.error('Erro ao transcrever. Tenta de novo.') }
    }
    try { mr.stop() } catch { stopStream() }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[200px]">
        {messages.map((msg, i) => {
          const t = msg.tutor ? byId(msg.tutor) : null
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && t && (
                <img src={t.photo} alt={t.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
                  style={{ boxShadow: `0 0 0 1.5px ${t.color}60` }} />
              )}
              <div className={cn('max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                msg.role === 'assistant' ? 'bg-bg-elevated text-[var(--text)] rounded-tl-sm'
                  : 'bg-purple/20 text-white border border-purple/25 rounded-tr-sm')}>
                {msg.role === 'assistant' && t && (
                  <span className="block text-[11px] font-semibold mb-0.5" style={{ color: t.color }}>{t.name}</span>
                )}
                {msg.text}
                {msg.role === 'assistant' && t && (
                  <MessageActions text={msg.text} audioUrl={msg.audioUrl} voice={t.voice} token={session?.access_token} />
                )}
              </div>
            </motion.div>
          )
        })}
        {busy && (
          <div className="flex justify-start"><div className="bg-bg-elevated rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
            <Loader2 size={13} className="text-cyan animate-spin" /><span className="text-xs text-slate-400">Tutors are replying…</span>
          </div></div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2">
        <button
          onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void startRecording() }}
          onPointerUp={e => { try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ } stopRecording() }}
          onPointerCancel={stopRecording}
          disabled={busy || locked}
          className={cn('w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all select-none touch-none',
            locked ? 'bg-bg-elevated opacity-50' : recording ? 'bg-pink scale-110' : 'bg-purple hover:scale-105')}>
          {locked ? <Lock size={16} className="text-white" /> : recording ? <MicOff size={16} className="text-white" /> : <Mic size={16} className="text-white" />}
        </button>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void send(input) }}
          placeholder="Type a message to the group…"
          className="flex-1 bg-bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[var(--text)] outline-none focus:border-purple/40" />
        <button onClick={() => void send(input)} disabled={busy || !input.trim()}
          className="w-11 h-11 rounded-full bg-cyan flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:scale-105 transition-all">
          <Send size={16} className="text-bg" />
        </button>
      </div>
    </div>
  )
}

// ─── Usage meter ──────────────────────────────────────────────────────────────
function UsageMeter({ usage }: { usage: Usage | null }) {
  if (!usage) return null
  const bar = (m: { used: number; limit: number }, color: string) => (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (m.used / m.limit) * 100)}%`, background: color }} />
    </div>
  )
  return (
    <div className="bg-bg-card border border-white/5 rounded-2xl p-3.5 space-y-3">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Practice</h2>
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400 flex items-center gap-1"><Phone size={11} /> Phone Call <span className="text-slate-600">· weekly</span></span>
          <span className={usage.phonecall.locked ? 'text-pink' : 'text-green'}>{usage.phonecall.used} / {usage.phonecall.limit} this week</span>
        </div>
        {bar(usage.phonecall, usage.phonecall.locked ? '#FF006E' : '#00FF88')}
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400 flex items-center gap-1"><Mic size={11} /> Push to Talk</span>
          <span className={usage.pushtotalk.locked ? 'text-pink' : 'text-cyan'}>{fmtClock(usage.pushtotalk.used)} / {fmtClock(usage.pushtotalk.limit)}</span>
        </div>
        {bar(usage.pushtotalk, usage.pushtotalk.locked ? '#FF006E' : '#00D4FF')}
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400 flex items-center gap-1"><Users size={11} /> Group</span>
          <span className={usage.group.locked ? 'text-pink' : 'text-purple'}>{fmtClock(usage.group.used)} / {fmtClock(usage.group.limit)}</span>
        </div>
        {bar(usage.group, usage.group.locked ? '#FF006E' : '#9B5DE5')}
      </div>
      {usage.xpAwarded && (
        <p className="text-[11px] text-gold flex items-center gap-1"><Sparkles size={11} /> Daily speaking XP earned!</p>
      )}
    </div>
  )
}

// ─── Main SpeakingPage ────────────────────────────────────────────────────────
export function SpeakingPage() {
  const { user, session, refresh } = useAuth()
  const [selectedAvatar, setSelectedAvatar] = useState<Tutor>(avatars[0])
  const [groupSel, setGroupSel] = useState<string[]>(['emma', 'liam', 'priya'])
  const [mode, setMode] = useState<'realtime' | 'whisper' | 'group'>('whisper')
  const [usage, setUsage] = useState<Usage | null>(null)
  const [useTopic, setUseTopic] = useState(true)
  const [micBlocked, setMicBlocked] = useState(false)

  // Watch microphone permission so we can warn instead of failing silently.
  useEffect(() => {
    const anyNav = navigator as Navigator & { permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> } }
    anyNav.permissions?.query({ name: 'microphone' as PermissionName })
      .then(p => { setMicBlocked(p.state === 'denied'); p.onchange = () => setMicBlocked(p.state === 'denied') })
      .catch(() => { /* permissions API not available - ignore */ })
  }, [])
  // Use the token STRING (stable across renders) as the dependency - depending
  // on the `session` object would change identity every render and loop the effect.
  const token = session?.access_token
  const level = (user as { level?: string })?.level ?? 'A1'
  const userName = (((user as { name?: string })?.name) ?? '').trim().split(/\s+/)[0] || 'there'
  const dayTopic = getTodayTopic()
  const topic = useTopic ? dayTopic.topic : undefined

  const refreshUsage = useCallback(async () => {
    const u = await getUsage(token)
    if (u) setUsage(u)
  }, [token])

  useEffect(() => { void refreshUsage() }, [refreshUsage])

  const onTimeSpent = useCallback(async (m: 'realtime' | 'pushtotalk' | 'group', seconds: number) => {
    const u = await incrementUsage(m, seconds, token)
    if (u) {
      setUsage(u)
      if (u.xpEarned && u.xpEarned > 0) {
        toast.success(`🎉 +${u.xpEarned} XP for today's speaking practice!`)
        void refresh() // pull the new XP/streak into the profile shown everywhere
      }
    }
  }, [token, refresh])

  const onSessionEnd = useCallback(async (messages: Message[], tutor: string, m: string) => {
    const convo = messages.filter(x => x.text?.trim()).map(x => ({ role: x.role, content: x.text }))
    if (convo.filter(c => c.role === 'user').length === 0) return
    const found = await analyzeConversation({ messages: convo, tutor, mode: m, topic }, token)
    if (found.length > 0) toast(`📝 ${found.length} mistake${found.length > 1 ? 's' : ''} saved to review`, { icon: '✍️' })
  }, [token, topic])

  const toggleGroup = (id: string) => {
    setGroupSel(prev => prev.includes(id)
      ? (prev.length > 2 ? prev.filter(x => x !== id) : prev)
      : (prev.length < 4 ? [...prev, id] : prev))
  }

  const ptLocked = usage?.pushtotalk.locked ?? false
  const groupLocked = usage?.group.locked ?? false
  const groupTutors = groupSel.map(byId)
  const focus = buildFocus(user)   // personalizes the AI to the student's goal/field

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white mb-1">Speaking</h1>
          <p className="text-slate-400 text-sm">Real conversations with native-level AI tutors.</p>
        </div>
        <Link to="/speaking/review"
          className="flex items-center gap-2 text-sm px-3.5 py-2 rounded-xl border border-white/10 text-slate-300 hover:border-purple/40 hover:text-white transition-all">
          <BookMarked size={15} /> My mistakes
        </Link>
      </div>

      {/* Microphone blocked warning */}
      {micBlocked && (
        <div className="mb-6 rounded-2xl border border-pink/40 bg-pink/10 p-4 flex items-start gap-3">
          <Lock size={18} className="text-pink mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-white">O microfone está bloqueado</p>
            <p className="text-slate-400 mt-0.5">
              Clica no ícone 🎤 (ou no cadeado) na barra de endereço do browser, escolhe <b>“Permitir”</b> o microfone e recarrega a página. Sem isso, o Phone Call e o Push-to-Talk não conseguem ouvir-te.
            </p>
          </div>
        </div>
      )}

      {/* Topic of the day */}
      <div className="mb-6 rounded-2xl border border-purple/20 bg-purple/5 p-4 flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-xl bg-purple/15 flex items-center justify-center flex-shrink-0">
          <BookMarked size={16} className="text-purple" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Today's topic</p>
          <p className="text-sm font-semibold text-white">{useTopic ? dayTopic.topic : 'Free talk - any subject'}</p>
        </div>
        <button onClick={() => setUseTopic(v => !v)}
          className={cn('text-xs px-3 py-1.5 rounded-lg border transition-all',
            useTopic ? 'border-purple/40 text-purple bg-purple/10' : 'border-white/10 text-slate-400')}>
          {useTopic ? 'Switch to free talk' : 'Use today\'s topic'}
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          <UsageMeter usage={usage} />

          {/* Mode selector */}
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mode</h2>
            <div className="grid grid-cols-3 gap-2">
              {([['whisper', Mic, 'Talk'], ['realtime', Phone, 'Call'], ['group', Users, 'Group']] as const).map(([m, Icon, label]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn('p-2.5 rounded-xl border text-xs text-center transition-all',
                    mode === m ? 'border-purple bg-purple/10 text-purple font-semibold' : 'border-white/10 text-slate-400 hover:border-white/20')}>
                  <Icon size={14} className="mx-auto mb-1" />{label}
                </button>
              ))}
            </div>
          </div>

          {/* Tutor selector */}
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {mode === 'group' ? `Group (${groupSel.length}/4)` : 'Choose Tutor'}
            </h2>
            <div className="space-y-2">
              {avatars.map(av => {
                const active = mode === 'group' ? groupSel.includes(av.id) : selectedAvatar.id === av.id
                return (
                  <button key={av.id}
                    onClick={() => mode === 'group' ? toggleGroup(av.id) : setSelectedAvatar(av)}
                    className={cn('w-full text-left p-2.5 rounded-2xl border transition-all',
                      active ? 'border-2 bg-bg-elevated' : 'border-white/5 bg-bg-card hover:border-white/15')}
                    style={active ? { borderColor: av.color } : {}}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 relative" style={{ boxShadow: `0 0 0 2px ${av.color}40` }}>
                        <img src={av.photo} alt={av.name} className="w-full h-full object-cover" />
                        <span className="absolute -bottom-0.5 -right-0.5 text-[9px] leading-none bg-bg-card rounded-full w-3.5 h-3.5 flex items-center justify-center border border-white/10">{av.flag}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-white text-sm">{av.name}</p>
                        <p className="text-xs text-slate-500 truncate">{av.accent}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2">
          {mode !== 'group' && (
            <div className="rounded-2xl p-4 mb-4 flex items-center gap-4 border"
              style={{ background: `${selectedAvatar.color}10`, borderColor: `${selectedAvatar.color}30` }}>
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 relative" style={{ boxShadow: `0 0 0 2px ${selectedAvatar.color}40` }}>
                <img src={selectedAvatar.photo} alt={selectedAvatar.name} className="w-full h-full object-cover" />
                <span className="absolute bottom-0.5 right-0.5 text-xs leading-none bg-bg-card rounded-full w-5 h-5 flex items-center justify-center border border-white/10">{selectedAvatar.flag}</span>
              </div>
              <div>
                <p className="font-bold text-white">{selectedAvatar.name}</p>
                <p className="text-sm font-medium" style={{ color: selectedAvatar.color }}>{selectedAvatar.accent}</p>
                <p className="text-xs text-slate-500">{selectedAvatar.desc}</p>
              </div>
              <div className="ml-auto"><span className="text-xs bg-bg-elevated border border-white/10 rounded-lg px-2 py-1 text-slate-400">{level}</span></div>
            </div>
          )}

          <Card className="min-h-[340px] flex flex-col p-4">
            {/* Keyed so switching mode/tutor remounts the panel cleanly. No
                AnimatePresence mode="wait" here - it stalls the swap. */}
            <div
              key={`${mode}-${mode === 'group' ? groupSel.join('') : selectedAvatar.id}-${useTopic}`}
              className="flex flex-col h-full">
              {mode === 'realtime' ? (
                <RealtimeMode avatar={selectedAvatar} level={level} topic={topic} session={session}
                  usage={usage} focus={focus} onTimeSpent={onTimeSpent} onSessionEnd={onSessionEnd} />
              ) : mode === 'whisper' ? (
                <PracticeMode avatar={selectedAvatar} session={session}
                  locked={ptLocked} onTimeSpent={onTimeSpent} userName={userName}
                  level={level} focus={focus} userId={(user as { id?: string })?.id ?? 'anon'} />
              ) : (
                <GroupMode tutors={groupTutors} level={level} topic={topic} session={session}
                  locked={groupLocked} focus={focus} onTimeSpent={onTimeSpent} onSessionEnd={onSessionEnd} />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
