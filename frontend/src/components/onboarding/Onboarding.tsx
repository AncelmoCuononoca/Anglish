import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Check, Loader2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../lib/AuthContext'
import { saveGoal } from '../../lib/auth'
import { WORK_CATEGORIES, buildGoalDetail, type WorkCategory } from '../../lib/onboardingGoals'
import type { LearnerGoal } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'why' | 'stats' | 'method' | 'work' | 'custom'
type MethodId = 'no_way_out' | 'muscle_memory' | 'shadowing'

// ─── Static data ──────────────────────────────────────────────────────────────
// Each WHY option maps directly to a LearnerGoal so no separate "goal" step is needed.
const WHY_OPTIONS: {
  id: string; emoji: string; title: string; desc: string
  goal: LearnerGoal; needsWork: boolean
}[] = [
  { id: 'career',     goal: 'work',   needsWork: true,  emoji: '💼', title: 'Quero ser promovido e ganhar mais',        desc: 'O inglês é o que separa o cargo que tenho do que mereço' },
  { id: 'abroad',     goal: 'travel', needsWork: false, emoji: '✈️', title: 'Quero trabalhar ou viver fora do país',    desc: 'Angola é o meu ponto de partida, não o meu limite' },
  { id: 'shame',      goal: 'daily',  needsWork: false, emoji: '😰', title: 'Tenho vergonha de falar com estrangeiros', desc: 'Fico bloqueado quando preciso de comunicar em inglês' },
  { id: 'global',     goal: 'work',   needsWork: true,  emoji: '💰', title: 'Quero aceder a oportunidades globais',     desc: 'Contratos, clientes e parceiros internacionais' },
  { id: 'study',      goal: 'school', needsWork: false, emoji: '🎓', title: 'Quero estudar no exterior',                desc: 'Bolsa de estudo, universidade ou curso fora do país' },
  { id: 'family',     goal: 'daily',  needsWork: false, emoji: '👨‍👩‍👧', title: 'Quero dar um futuro melhor à minha família', desc: 'Que os meus filhos vejam que valeu a pena' },
  { id: 'notlimited', goal: 'daily',  needsWork: false, emoji: '⛓️', title: 'Recuso ser mais um dos acorrentados',       desc: 'Não vou ficar para trás enquanto o mundo avança em inglês' },
]

const STATS = [
  {
    emoji: '🌍', color: '#7F77DD',
    number: '1,5 Mil Milhões',
    title: 'Pessoas falam inglês no mundo',
    desc: 'Quem fala inglês tem acesso a qualquer pessoa, em qualquer país.',
    source: 'Ethnologue, 2023',
  },
  {
    emoji: '💰', color: '#00FF88',
    number: '+40%',
    title: 'É quanto mais ganham os bilingues',
    desc: 'O inglês é um aumento de salário que ninguém te pode tirar.',
    source: 'LinkedIn Workforce Report, 2022',
  },
  {
    emoji: '🌐', color: '#00D4FF',
    number: '90%',
    title: 'Do conteúdo da internet está em inglês',
    desc: 'Sem inglês, só acedes a 10% do conhecimento disponível no mundo.',
    source: 'Internet World Stats, 2023',
  },
  {
    emoji: '🧠', color: '#FFB020',
    number: 'Neurociência',
    title: 'Comprova: o teu cérebro pode aprender',
    desc: 'Neuroplasticidade significa que aprender inglês aumenta a massa cinzenta e melhora a memória, em qualquer idade.',
    source: 'Nature Neuroscience, 2004',
  },
] as const

const METHODS: {
  id: MethodId; emoji: string; name: string; tagline: string; desc: string; badge: string; color: string
}[] = [
  {
    id: 'no_way_out',
    emoji: '🔒', color: '#7F77DD',
    name: 'No Way Out',
    tagline: 'Imersão total. Sem rede de segurança.',
    desc: 'O teu cérebro é forçado a criar novos caminhos neurais porque não tem outra saída. Lições, exercícios, conversas: tudo em inglês. Assim como uma criança aprende, por necessidade, não por obrigação.',
    badge: 'Imersão total',
  },
  {
    id: 'muscle_memory',
    emoji: '🧠', color: '#00FF88',
    name: 'Muscle Memory',
    tagline: 'Neuroplasticidade: reprograma o teu cérebro',
    desc: 'Cada vez que repetes um padrão correcto, o circuito neural fortalece-se. Com repetição estratégica, o inglês sai automático, sem esforço consciente.',
    badge: 'Apoiado pela neurociência',
  },
  {
    id: 'shadowing',
    emoji: '🎙️', color: '#00D4FF',
    name: 'Shadowing',
    tagline: 'Ouves um nativo e repetes em tempo real',
    desc: 'O método dos melhores intérpretes simultâneos do mundo. O teu cérebro processa ritmo, pronúncia e entoação ao mesmo tempo. Sotaque natural, fluência acelerada.',
    badge: 'Técnica dos tradutores profissionais',
  },
]

const METHOD_LABELS: Record<MethodId, string> = {
  no_way_out: 'No Way Out',
  muscle_memory: 'Muscle Memory',
  shadowing: 'Shadowing',
}

const PROGRESS: Record<Step, number> = {
  why: 12, stats: 37, method: 62, work: 88, custom: 88,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const slide = (dir: 1 | -1) => ({
  initial:    { opacity: 0, x: 40 * dir },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0, x: -40 * dir },
  transition: { duration: 0.22, ease: 'easeOut' as const },
})

// ─── Component ────────────────────────────────────────────────────────────────
export function Onboarding() {
  const { user, refresh } = useAuth()
  const [step, setStep]             = useState<Step>('why')
  const [dir,  setDir]              = useState<1 | -1>(1)
  const [goal, setGoal]             = useState<LearnerGoal | null>(null)
  const [needsWork, setNeedsWork]   = useState(false)
  const [method, setMethod]         = useState<MethodId | null>(null)
  const [category, setCategory]     = useState<WorkCategory | null>(null)
  const [customText, setCustomText] = useState('')
  const [search, setSearch]         = useState('')
  const [saving, setSaving]         = useState(false)

  const go   = (s: Step) => { setDir(1);  setStep(s) }
  const back = (s: Step) => { setDir(-1); setStep(s) }

  const withMethod = (detail: string | null): string | null => {
    if (!method) return detail
    const tag = `[${METHOD_LABELS[method]}]`
    return detail ? `${tag} ${detail}` : tag
  }

  const finish = async (g: LearnerGoal, detail: string | null) => {
    setSaving(true)
    try {
      await saveGoal(g, withMethod(detail))
      await refresh()
    } catch {
      toast.error('Não consegui guardar. Tenta novamente.')
      setSaving(false)
    }
  }

  const afterMethod = () => {
    if (!method || !goal) return
    if (needsWork) go('work')
    else void finish(goal, null)
  }

  const filteredCats = search.trim()
    ? WORK_CATEGORIES.map(c => ({
        ...c,
        areas: c.areas.filter(a =>
          a.label.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(c => c.areas.length > 0)
    : WORK_CATEGORIES

  const firstName = user?.name?.split(' ')[0] ?? ''

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] overflow-hidden">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-white/5 z-50">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg,#7F77DD,#00D4FF)' }}
          animate={{ width: `${PROGRESS[step]}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-start pt-8 px-5 pb-8 max-w-lg mx-auto w-full">

        {/* Angli mascot */}
        <motion.img
          src="/mascot/angli.png"
          alt="Angli"
          className="w-20 h-20 object-contain mb-4 flex-shrink-0"
          style={{ filter: 'drop-shadow(0 4px 16px rgba(0,170,255,0.4))' }}
          key={step}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        />

        <AnimatePresence mode="wait">

          {/* ── STEP 1: WHY (implicitly sets goal - replaces separate goal step) */}
          {step === 'why' && (
            <motion.div key="why" {...slide(dir)} className="w-full">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-black text-[var(--text)] leading-tight mb-2">
                  {firstName ? `${firstName}, porque` : 'Porque'} decides aprender inglês{' '}
                  <span className="text-transparent bg-clip-text"
                    style={{ backgroundImage: 'linear-gradient(90deg,#7F77DD,#00D4FF)' }}>
                    AGORA?
                  </span>
                </h1>
                <p className="text-[var(--text-muted)] text-sm">
                  Escolhe o que mais se parece contigo. Sê honesto, vamos adaptar tudo ao teu objectivo.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {WHY_OPTIONS.map((o, i) => (
                  <motion.button
                    key={o.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => {
                      setGoal(o.goal)
                      setNeedsWork(o.needsWork)
                      go('stats')
                    }}
                    className="text-left flex items-center gap-3.5 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-purple-400/50 hover:bg-purple-500/5 active:scale-[0.98] transition-all"
                  >
                    <span className="text-2xl flex-shrink-0">{o.emoji}</span>
                    <div>
                      <div className="font-bold text-[var(--text)] text-sm leading-snug">{o.title}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">{o.desc}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: STATS ────────────────────────────────────────────────── */}
          {step === 'stats' && (
            <motion.div key="stats" {...slide(dir)} className="w-full">
              <button onClick={() => back('why')}
                className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-5">
                <ArrowLeft size={15} /> Voltar
              </button>

              <div className="mb-6 text-center">
                <h1 className="text-2xl font-black text-[var(--text)] leading-tight mb-2">
                  O inglês não é uma opção.{' '}
                  <span className="text-transparent bg-clip-text"
                    style={{ backgroundImage: 'linear-gradient(90deg,#7F77DD,#00D4FF)' }}>
                    É o filtro.
                  </span>
                </h1>
                <p className="text-[var(--text-muted)] text-sm">
                  Os números que os que chegam lá cima conhecem, e os outros ignoram.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 mb-5">
                {STATS.map((s, i) => (
                  <motion.div
                    key={s.title}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex gap-4 p-4 rounded-2xl border"
                    style={{ borderColor: `${s.color}30`, background: `${s.color}08` }}
                  >
                    <div className="flex-shrink-0 text-3xl">{s.emoji}</div>
                    <div className="min-w-0">
                      <div className="text-2xl font-black leading-none mb-1" style={{ color: s.color }}>
                        {s.number}
                      </div>
                      <div className="text-sm font-bold text-[var(--text)] leading-snug">{s.title}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{s.desc}</div>
                      <div className="text-[10px] mt-1.5 font-medium opacity-50" style={{ color: s.color }}>
                        Fonte: {s.source}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Angola callout */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
                className="flex gap-3 p-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 mb-6"
              >
                <span className="text-xl flex-shrink-0">🇦🇴</span>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  Em Angola, empresas como TotalEnergies, Chevron e De Beers{' '}
                  <strong className="text-amber-200">
                    exigem inglês para todos os cargos de gestão.
                  </strong>{' '}
                  É o filtro invisível que separa quem sobe de quem fica parado.
                </p>
              </motion.div>

              <button
                onClick={() => go('method')}
                className="w-full py-4 rounded-2xl font-black text-white text-base active:scale-[0.98] transition-all"
                style={{ background: 'linear-gradient(135deg,#7F77DD,#00D4FF)' }}
              >
                Quero fazer parte dos que chegam lá →
              </button>
            </motion.div>
          )}

          {/* ── STEP 3: METHOD ───────────────────────────────────────────────── */}
          {step === 'method' && (
            <motion.div key="method" {...slide(dir)} className="w-full">
              <button onClick={() => back('stats')}
                className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-5">
                <ArrowLeft size={15} /> Voltar
              </button>

              <div className="mb-6 text-center">
                <h1 className="text-2xl font-black text-[var(--text)] leading-tight mb-2">
                  Escolhe o teu{' '}
                  <span className="text-transparent bg-clip-text"
                    style={{ backgroundImage: 'linear-gradient(90deg,#7F77DD,#00D4FF)' }}>
                    método
                  </span>
                </h1>
                <p className="text-[var(--text-muted)] text-sm">
                  Toca em cada método para saberes mais. O Anglish Me combina os três, mas a tua escolha diz-nos onde focamos mais.
                </p>
              </div>

              <div className="space-y-3 mb-4">
                {METHODS.map((m, i) => (
                  <motion.button
                    key={m.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => setMethod(prev => prev === m.id ? null : m.id)}
                    className="w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.98]"
                    style={
                      method === m.id
                        ? { borderColor: `${m.color}80`, background: `${m.color}12` }
                        : { borderColor: 'var(--border)', background: 'var(--bg-card)' }
                    }
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0 mt-0.5">{m.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-black text-[var(--text)]">{m.name}</span>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: `${m.color}20`, color: m.color }}
                          >
                            {m.badge}
                          </span>
                        </div>
                        <div className="text-xs font-semibold" style={{ color: m.color }}>{m.tagline}</div>
                        {method === m.id && (
                          <div className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">{m.desc}</div>
                        )}
                      </div>
                      {method === m.id && (
                        <div
                          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                          style={{ background: m.color }}
                        >
                          <Check size={12} className="text-black" />
                        </div>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={afterMethod}
                disabled={!method}
                className="w-full py-4 rounded-2xl font-black text-white text-base active:scale-[0.98] transition-all disabled:opacity-30"
                style={{ background: method ? 'linear-gradient(135deg,#7F77DD,#00D4FF)' : 'rgba(255,255,255,0.08)' }}
              >
                {method
                  ? `Comprometer-me com ${METHOD_LABELS[method]} →`
                  : 'Escolhe o teu método para continuar'}
              </button>
            </motion.div>
          )}

          {/* ── STEP 4: WORK - categories & areas ────────────────────────────── */}
          {step === 'work' && (
            <motion.div key="work" {...slide(dir)} className="w-full">
              <button
                onClick={() => { category ? setCategory(null) : back('method') }}
                className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-5"
              >
                <ArrowLeft size={15} /> Voltar
              </button>

              <div className="mb-5">
                <h1 className="text-xl font-black text-[var(--text)] mb-1">
                  {category ? `${category.emoji} ${category.label}` : 'Em que área trabalhas?'}
                </h1>
                <p className="text-[var(--text-muted)] text-sm">
                  {category
                    ? 'Escolhe a função mais próxima da tua.'
                    : 'Escolhe a categoria ou pesquisa a tua profissão.'}
                </p>
              </div>

              {!category ? (
                <>
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Pesquisa a tua profissão…"
                      className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-purple-400/50"
                    />
                  </div>
                  <div className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-1">
                    {search.trim()
                      ? filteredCats.flatMap(c =>
                          c.areas.map(a => (
                            <button
                              key={a.id}
                              onClick={() => void finish('work', buildGoalDetail(c.label, a.label))}
                              disabled={saving}
                              className="text-left px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-purple-400/50 hover:bg-purple-500/5 transition-all text-sm text-[var(--text)] disabled:opacity-50"
                            >
                              <span className="mr-2">{c.emoji}</span>{a.label}
                              <span className="text-[var(--text-muted)] text-xs"> · {c.label}</span>
                            </button>
                          ))
                        )
                      : WORK_CATEGORIES.map(c => (
                          <button
                            key={c.id}
                            onClick={() => setCategory(c)}
                            className="flex items-center gap-3 text-left px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-purple-400/50 hover:bg-purple-500/5 transition-all"
                          >
                            <span className="text-2xl">{c.emoji}</span>
                            <span className="font-semibold text-[var(--text)] text-sm">{c.label}</span>
                          </button>
                        ))}
                    {!search.trim() && (
                      <button
                        onClick={() => go('custom')}
                        className="text-left px-4 py-3 rounded-xl border border-dashed border-[var(--border)] hover:border-purple-400/50 transition-all text-sm text-[var(--text-muted)]"
                      >
                        ✨ A minha área não está na lista, vou escrever
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
                  {category.areas.map(a => (
                    <button
                      key={a.id}
                      onClick={() => void finish('work', buildGoalDetail(category.label, a.label))}
                      disabled={saving}
                      className="text-left px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-purple-400/50 hover:bg-purple-500/5 transition-all text-sm text-[var(--text)] disabled:opacity-50"
                    >
                      {a.label}
                    </button>
                  ))}
                  <button
                    onClick={() => go('custom')}
                    className="text-left px-4 py-3 rounded-xl border border-dashed border-[var(--border)] hover:border-purple-400/50 transition-all text-sm text-[var(--text-muted)]"
                  >
                    ✨ Outra função em {category.label}, vou escrever
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── STEP 5: CUSTOM ───────────────────────────────────────────────── */}
          {step === 'custom' && (
            <motion.div key="custom" {...slide(dir)} className="w-full">
              <button onClick={() => back('work')}
                className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-5">
                <ArrowLeft size={15} /> Voltar
              </button>

              <div className="mb-5">
                <h1 className="text-xl font-black text-[var(--text)] mb-1">Descreve o teu objectivo</h1>
                <p className="text-[var(--text-muted)] text-sm">
                  Escreve com as tuas palavras. O teu coach vai personalizar tudo a partir daqui.
                </p>
              </div>

              <textarea
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                rows={4}
                autoFocus
                placeholder="Ex: Trabalho como coordenador de logística num porto"
                className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm text-[var(--text)] focus:outline-none focus:border-purple-400/50 resize-none placeholder:text-[var(--text-muted)]"
              />

              <button
                onClick={() => void finish(goal ?? 'other', customText.trim() || null)}
                disabled={saving || customText.trim().length < 2}
                className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white text-base active:scale-[0.98] transition-all disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg,#7F77DD,#00D4FF)' }}
              >
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                Começar a aprender
              </button>
            </motion.div>
          )}

        </AnimatePresence>

        {saving && step !== 'custom' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] mt-6"
          >
            <Loader2 size={15} className="animate-spin" /> A preparar as tuas aulas…
          </motion.div>
        )}
      </div>
    </div>
  )
}
