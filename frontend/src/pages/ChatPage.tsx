import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, RotateCcw, CheckCircle, XCircle, Volume2, Languages, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../lib/AuthContext'
import { buildFocus } from '../lib/focus'
import toast from 'react-hot-toast'
import { cn } from '../lib/utils'
import { API_BASE as API } from '../lib/apiBase'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface Correction {
  has_errors: boolean
  corrected: string
  errors: { original: string; correction: string; explanation: string }[]
  overall_feedback: string
}

interface ChatUsage {
  used: number
  limit: number
  locked: boolean
  resetAt: string
}

const suggestedQuestions = [
  "How do I use 'have been' vs 'was'?",
  "What's the difference between 'make' and 'do'?",
  "How do I form the Present Perfect?",
  "Explain prepositions of time (in, on, at)",
  "What's a phrasal verb? Give me examples.",
]

// Per-message TTS button with speed toggle
function TtsButton({ text, token }: { text: string; token?: string }) {
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
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, voice: 'alloy', speed: slow ? 0.62 : 1.0 }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url) }
      setPlaying(true)
      await audio.play()
    } catch { toast.error('Audio unavailable') }
    finally { setLoading(false) }
  }, [text, token])

  return (
    <button
      onClick={() => void speak()}
      disabled={loading}
      title={playing ? (isSlow ? 'Reading slowly - tap for normal' : 'Reading at normal speed - tap for slow') : '1st tap = normal · 2nd = slow'}
      className={cn(
        'flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all mt-1.5',
        playing
          ? isSlow ? 'border-gold/50 text-gold animate-pulse' : 'border-cyan/50 text-cyan animate-pulse'
          : 'border-white/5 text-slate-500 hover:text-cyan hover:border-cyan/20'
      )}
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <Volume2 size={11} />}
      {playing ? (isSlow ? '🐢' : '▶') : ''}
    </button>
  )
}

// Translate button for any text in the input or bubble
function TranslateButton({ getText, token, onResult }: {
  getText: () => string
  token?: string
  onResult: (translated: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const translate = async () => {
    const text = getText().trim()
    if (!text) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/chat/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      })
      const data = await res.json() as { translation?: string }
      if (data.translation) onResult(data.translation)
    } catch { toast.error('Translation failed') }
    finally { setLoading(false) }
  }
  return (
    <button
      onClick={() => void translate()}
      disabled={loading}
      title="Translate PT↔EN"
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-white/5 text-slate-500 hover:text-purple hover:border-purple/20 transition-all"
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <Languages size={11} />}
    </button>
  )
}

export function ChatPage() {
  const { user, session } = useAuth()
  const token = session?.access_token
  const level = user?.level ?? 'A1'

  const [messages, setMessages] = useState<Message[]>([{
    id: '0',
    role: 'assistant',
    content: `Hi${user?.name ? ` ${user.name.split(' ')[0]}` : ''}! 👋 I'm your AI English tutor. Ask me anything about grammar, vocabulary, or just practise writing in English. I'm here to help! 🎯`,
    timestamp: new Date(),
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [correction, setCorrection] = useState<Correction | null>(null)
  const [correcting, setCorrecting] = useState(false)
  const [translatedInput, setTranslatedInput] = useState<string | null>(null)
  const [chatUsage, setChatUsage] = useState<ChatUsage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Load today's chat allowance for the progress bar
  useEffect(() => {
    if (!token) return
    fetch(`${API}/api/chat/usage`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setChatUsage(d as ChatUsage) })
      .catch(() => {})
  }, [token])

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    if (chatUsage?.locked) {
      toast('You have used today\'s messages. Come back tomorrow 🌅')
      return
    }
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTranslatedInput(null)
    setCorrection(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)
    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }])
    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: [...messages, userMsg].slice(-20).map(m => ({ role: m.role, content: m.content })),
          level,
          focus: buildFocus(user),
        }),
      })
      if (res.status === 429) {
        const body = await res.json().catch(() => null) as Partial<ChatUsage> | null
        setChatUsage({
          used: body?.used ?? chatUsage?.limit ?? 0,
          limit: body?.limit ?? chatUsage?.limit ?? 50,
          locked: true,
          resetAt: body?.resetAt ?? '',
        })
        toast('You have used today\'s messages. Come back tomorrow 🌅')
        setMessages(prev => prev.filter(m => m.id !== assistantId))
        return
      }
      if (!res.ok || !res.body) throw new Error()
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
          const d = line.slice(6)
          if (d === '[DONE]') break
          try {
            const obj = JSON.parse(d) as { delta?: string; chatUsage?: ChatUsage }
            if (obj.chatUsage) setChatUsage({ ...obj.chatUsage, locked: obj.chatUsage.used >= obj.chatUsage.limit })
            if (obj.delta) { full += obj.delta; setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: full } : m)) }
          } catch { /* */ }
        }
      }
    } catch {
      toast.error('Connection error. Is the backend running on port 4000?')
      setMessages(prev => prev.filter(m => m.id !== assistantId))
    } finally { setLoading(false) }
  }

  const correctText = async () => {
    if (!input.trim()) return
    setCorrecting(true)
    try {
      const res = await fetch(`${API}/api/chat/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: input, level }),
      })
      setCorrection(await res.json() as Correction)
    } catch { toast.error('Grammar check failed') }
    finally { setCorrecting(false) }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  return (
    <div className="flex flex-col h-screen bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-purple-cyan flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white">Chat Tutor</h1>
            <p className="text-xs text-slate-400">Grammar · Vocabulary · PT↔EN Translation</p>
          </div>
        </div>
        <button onClick={() => { setMessages([{ id: '0', role: 'assistant', content: 'New conversation! What do you want to practise today? 🎯', timestamp: new Date() }]); setCorrection(null) }}
          className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors">
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Daily message bar, fills as you chat; when full, come back tomorrow */}
      {chatUsage && (
        <div className="px-6 pt-2.5 pb-2 border-b border-white/5 bg-bg-card">
          <div className="max-w-3xl mx-auto h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                chatUsage.locked ? 'bg-pink' : 'bg-gradient-purple-cyan'
              )}
              initial={false}
              animate={{ width: `${Math.min(100, (chatUsage.used / Math.max(1, chatUsage.limit)) * 100)}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 1 && (
          <div className="max-w-2xl mx-auto">
            <p className="text-xs text-slate-500 mb-3 text-center">Suggestions</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestedQuestions.map(q => (
                <button key={q} onClick={() => void sendMessage(q)}
                  className="text-xs bg-bg-elevated border border-white/10 hover:border-purple/40 hover:text-purple rounded-xl px-3 py-2 text-slate-400 transition-all">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>

              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-purple-cyan flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-1">✦</div>
              )}

              <div className={cn(
                'rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[80%] whitespace-pre-wrap',
                msg.role === 'assistant' ? 'bg-bg-card border border-white/5 text-[var(--text)] rounded-tl-sm' : 'bg-purple text-white rounded-tr-sm'
              )}>
                {msg.content || (
                  <span className="flex gap-1 py-0.5">
                    {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                  </span>
                )}
                {/* TTS + Translate buttons below AI messages */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <TtsButton text={msg.content} token={token} />
                    <TranslateButton
                      getText={() => msg.content}
                      token={token}
                      onResult={t => toast(t, { duration: 8000, style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '400px' } })}
                    />
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-bg-elevated border border-white/10 flex items-center justify-center text-slate-300 text-sm font-bold flex-shrink-0 mt-1">
                  {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Grammar correction panel */}
      <AnimatePresence>
        {correction && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 bg-bg-card px-6 py-4 overflow-hidden">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-2">
                {correction.has_errors ? <XCircle size={15} className="text-pink flex-shrink-0" /> : <CheckCircle size={15} className="text-green flex-shrink-0" />}
                <span className="text-sm font-semibold text-white">
                  {correction.has_errors ? 'Corrections found' : 'Perfect! No mistakes.'}
                </span>
                <button onClick={() => setCorrection(null)} className="ml-auto text-slate-500 hover:text-white text-xs">✕</button>
              </div>
              {correction.has_errors && (
                <>
                  <div className="bg-green/5 border border-green/20 rounded-xl px-4 py-2 text-sm text-green mb-2">✓ {correction.corrected}</div>
                  {correction.errors.map((e, i) => (
                    <p key={i} className="text-xs text-slate-400">
                      <span className="line-through text-pink/80">{e.original}</span>{' → '}
                      <span className="text-green">{e.correction}</span>
                      <span className="text-slate-500"> · {e.explanation}</span>
                    </p>
                  ))}
                </>
              )}
              {correction.overall_feedback && <p className="text-xs text-slate-500 mt-2 italic">{correction.overall_feedback}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Translated input preview */}
      <AnimatePresence>
        {translatedInput && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 bg-bg-card px-6 py-3 overflow-hidden">
            <div className="max-w-3xl mx-auto flex items-center gap-3">
              <Languages size={14} className="text-purple flex-shrink-0" />
              <p className="text-sm text-slate-300 flex-1">{translatedInput}</p>
              <button onClick={() => { setInput(translatedInput); setTranslatedInput(null) }}
                className="text-xs text-purple hover:text-purple-light border border-purple/20 px-2 py-1 rounded-lg">Use</button>
              <button onClick={() => setTranslatedInput(null)} className="text-slate-500 hover:text-white text-xs">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="border-t border-white/5 bg-bg-card px-4 py-4">
        {chatUsage?.locked ? (
          <div className="max-w-3xl mx-auto text-center py-3">
            <p className="text-sm text-[var(--text)] font-semibold">You've used today's messages 🌅</p>
            <p className="text-xs text-slate-500 mt-1">Your chat renews automatically tomorrow. Come back then!</p>
          </div>
        ) : (
        <>
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Ask in English…" rows={1} style={{ resize: 'none' }}
              className="w-full bg-bg-elevated border border-white/10 focus:border-purple/50 focus:ring-1 focus:ring-purple/30 rounded-xl px-4 py-3 pr-24 text-sm text-white placeholder:text-slate-500 outline-none transition-all leading-relaxed"
              onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px' }} />

            {/* Check grammar button */}
            <button onClick={() => void correctText()} disabled={!input.trim() || correcting}
              className="absolute right-14 bottom-2.5 text-xs text-slate-500 hover:text-cyan disabled:opacity-30 transition-colors">
              {correcting ? <Loader2 size={12} className="animate-spin" /> : 'Check'}
            </button>

            {/* Translate input button */}
            <button
              onClick={() => {
                if (!input.trim()) return
                void (async () => {
                  try {
                    const res = await fetch(`${API}/api/chat/translate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ text: input }),
                    })
                    const data = await res.json() as { translation?: string }
                    if (data.translation) setTranslatedInput(data.translation)
                  } catch { toast.error('Translation failed') }
                })()
              }}
              disabled={!input.trim()}
              title="Translate PT↔EN"
              className="absolute right-3 bottom-2.5 text-slate-500 hover:text-purple disabled:opacity-30 transition-colors">
              <Languages size={14} />
            </button>
          </div>
          <Button onClick={() => void sendMessage()} loading={loading} disabled={!input.trim()}
            className="h-11 w-11 !p-0 rounded-xl flex-shrink-0">
            <Send size={16} />
          </Button>
        </div>
        <p className="text-center text-xs text-slate-600 mt-2">
          Enter = send · Shift+Enter = new line · Check = grammar · <Languages size={10} className="inline" /> = translate PT↔EN
        </p>
        </>
        )}
      </div>
    </div>
  )
}
