import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import {
  Zap, Mic, MessageSquare, Trophy, BookOpen, Star,
  ChevronRight, Globe, Brain, Target, Flame,
} from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
}

const features = [
  { icon: Mic, color: '#7F77DD', title: 'Speaking', desc: 'Practice pronunciation with a native-accent AI avatar in real-time voice conversations.' },
  { icon: Brain, color: '#00D4FF', title: 'Adaptive Lessons', desc: 'Grammar, exercises, and shadowing that adjust to your level and unlock daily.' },
  { icon: MessageSquare, color: '#00FF88', title: 'Chat Tutor', desc: 'Ask questions, get corrections and explanations instantly - 24/7 AI support.' },
  { icon: Trophy, color: '#FFD700', title: 'Gamified Progress', desc: 'Earn XP, maintain streaks, unlock badges and compete in the weekly leaderboard.' },
  { icon: Target, color: '#FF006E', title: '6 Levels · One Year', desc: 'From A1 Beginner to C2 Mastery - a structured path from zero to fluency.' },
  { icon: Globe, color: '#7F77DD', title: 'Live Classes', desc: 'Schedule 1-on-1 sessions with Anselmo Aldair or certified native tutors via WhatsApp.' },
]

const levels = [
  { code: 'A1', name: 'Beginner', color: '#00FF88' },
  { code: 'A2', name: 'Elementary', color: '#00D4FF' },
  { code: 'B1', name: 'Intermediate', color: '#7F77DD' },
  { code: 'B2', name: 'Upper Intermediate', color: '#FF006E' },
  { code: 'C1', name: 'Advanced', color: '#FFD700' },
  { code: 'C2', name: 'Mastery', color: '#FF6B35' },
]

const testimonials = [
  { name: 'Maria S.', flag: '🇦🇴', level: 'B1', text: 'Consegui falar inglês fluente em 8 meses. O Speaking é incrível - parece falar com uma pessoa real!', stars: 5 },
  { name: 'João P.', flag: '🇧🇷', level: 'A2', text: 'As lições diárias e o streak mantiveram-me motivado. Já nunca tinha conseguido manter consistência assim.', stars: 5 },
  { name: 'Luísa F.', flag: '🇵🇹', level: 'C1', text: 'Passei de B2 a C1 em 5 meses usando o modo Memória Muscular. Recomendo a toda a gente.', stars: 5 },
  { name: 'Pedro M.', flag: '🇦🇴', level: 'A2', text: 'As chamadas com o tutor deram-me confiança para falar no trabalho. Nunca pensei que ia gostar tanto de estudar.', stars: 5 },
  { name: 'Carla N.', flag: '🇧🇷', level: 'B2', text: 'O chat de IA corrige-me na hora e explica o porquê. É como ter um professor disponível a qualquer hora.', stars: 5 },
  { name: 'Tomás R.', flag: '🇵🇹', level: 'B1', text: 'Estudo 10 minutos por dia no telemóvel e já noto a diferença nas reuniões em inglês.', stars: 5 },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-white overflow-x-hidden">
      {/* Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-purple-cyan flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-gradient-purple-cyan">Anglish Me</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#levels" className="hover:text-white transition-colors">Levels</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-white transition-colors">Reviews</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/auth?mode=login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/auth?mode=register">
              <Button size="sm">Start Free</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden min-h-[90vh] flex items-center">
        {/* Founders photo, large, bleeds to the right edge, blended into the page with gradients */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9 }}
          className="absolute inset-0 lg:left-auto lg:right-0 lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2 lg:w-[66%] lg:h-auto pointer-events-none"
        >
          <img
            src="/founders/founders-office-dark.jpg"
            alt="Anselmo Aldair and the Anglish Me teaching team"
            className="w-full h-full object-cover opacity-20 lg:h-auto lg:object-contain lg:opacity-100"
          />
          {/* left edge melts into the page background */}
          <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/40 lg:from-bg lg:via-bg/20 lg:to-transparent" />
          {/* top & bottom edges melt into the page background */}
          <div className="absolute inset-0 bg-gradient-to-b from-bg via-transparent to-bg" />
        </motion.div>

        {/* Glow accent */}
        <div className="absolute top-0 -left-32 w-[600px] h-[600px] bg-purple/10 rounded-full blur-[140px] pointer-events-none" />

        {/* Copy */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full py-20">
          <div className="max-w-xl text-center lg:text-left">
            <motion.div
              initial="hidden" animate="show" variants={fadeUp}
              className="inline-flex items-center gap-2 bg-purple/10 border border-purple/20 rounded-full px-4 py-1.5 text-sm text-purple mb-6 backdrop-blur-sm"
            >
              <Flame size={14} />
              <span>The #1 AI English Platform for Portuguese Speakers</span>
            </motion.div>

            <motion.h1
              custom={1} initial="hidden" animate="show" variants={fadeUp}
              className="text-4xl md:text-6xl lg:text-7xl font-black leading-tight mb-6 drop-shadow-lg"
            >
              Master English{' '}
              <span className="text-gradient-purple-cyan">with AI</span>
              <br />
              in 1 Year
            </motion.h1>

            <motion.p
              custom={2} initial="hidden" animate="show" variants={fadeUp}
              className="text-lg md:text-xl text-slate-300 max-w-xl mx-auto lg:mx-0 mb-10"
            >
              From A1 Beginner to C2 Mastery - gamified daily lessons, real-time voice AI,
              live tutors, and a community that keeps you on streak.
            </motion.p>

            <motion.div
              custom={3} initial="hidden" animate="show" variants={fadeUp}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link to="/auth?mode=register">
                <Button size="lg" className="w-full sm:w-auto">
                  Start Learning Free <ChevronRight size={18} />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  See How It Works
                </Button>
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div
              custom={4} initial="hidden" animate="show" variants={fadeUp}
              className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto lg:mx-0"
            >
              {[
                { value: '12', label: 'Active Learners' },
                { value: '6', label: 'Proficiency Levels' },
                { value: '88%', label: 'Completion Rate' },
              ].map(({ value, label }) => (
                <div key={label} className="text-center lg:text-left">
                  <div className="text-3xl font-black text-gradient-purple-cyan">{value}</div>
                  <div className="text-xs text-slate-500 mt-1">{label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">
              Everything You Need to <span className="text-gradient-cyan-green">Become Fluent</span>
            </h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              A complete learning system - not just a chatbot.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, color, title, desc }, i) => (
              <motion.div
                key={title}
                custom={i * 0.05}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                variants={fadeUp}
                className="bg-bg-card border border-white/5 rounded-2xl p-6 card-hover"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${color}18`, border: `1px solid ${color}30` }}
                >
                  <Icon size={22} style={{ color }} />
                </div>
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Levels */}
      <section id="levels" className="py-24 px-6 bg-bg-card/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">
              Your Path from <span className="text-gradient-purple-cyan">Zero to Mastery</span>
            </h2>
            <p className="text-slate-400 text-lg">6 structured levels · A1 to C2 · unlock as you progress</p>
          </div>
          <div className="relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-purple/0 via-purple/30 to-purple/0 hidden md:block" />
            <div className="grid md:grid-cols-2 gap-4">
              {levels.map(({ code, name, color }, i) => (
                <motion.div
                  key={code}
                  custom={i * 0.08}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className={`bg-bg-card border border-white/5 rounded-2xl p-5 flex items-center gap-4 card-hover ${i % 2 === 1 ? 'md:translate-y-8' : ''}`}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 font-black text-lg"
                    style={{ background: `${color}15`, border: `2px solid ${color}40`, color }}
                  >
                    {code}
                  </div>
                  <div>
                    <div className="font-bold text-white">{name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Level {i + 1} · unlocks as you progress</div>
                  </div>
                  <BookOpen size={16} className="ml-auto text-slate-600" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Founders / real teachers */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
            className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl order-2 lg:order-1"
          >
            <img
              src="/founders/founders-outdoor.jpg"
              alt="Anselmo Aldair and the Anglish Me team"
              className="w-full h-full object-cover"
            />
          </motion.div>
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
            className="order-1 lg:order-2"
          >
            <div className="inline-flex items-center gap-2 bg-cyan/10 border border-cyan/20 rounded-full px-4 py-1.5 text-sm text-cyan mb-5">
              <Star size={14} /> Real people, real results
            </div>
            <h2 className="text-4xl font-black mb-4">
              Not just an app, a <span className="text-gradient-purple-cyan">team behind you</span>
            </h2>
            <p className="text-slate-400 text-lg mb-6 leading-relaxed">
              Founded by Anselmo Aldair in Angola, Anglish Me blends AI-powered practice with real
              human coaching. Get 24/7 AI tutors for speaking and chat, plus live 1-on-1 sessions
              with certified teachers whenever you need a human touch.
            </p>
            <ul className="space-y-3">
              {[
                'Learn at your own pace with daily AI lessons',
                'Book live classes with real tutors on WhatsApp',
                'A coach and community that keep you accountable',
              ].map((t) => (
                <li key={t} className="flex items-center gap-3 text-slate-300">
                  <span className="w-6 h-6 rounded-full bg-green/15 border border-green/30 flex items-center justify-center text-green text-sm flex-shrink-0">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">
              Loved by <span className="text-gradient-purple-cyan">Real Learners</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map(({ name, flag, level, text, stars }) => (
              <div key={name} className="bg-bg-card border border-white/5 rounded-2xl p-6">
                <div className="flex mb-3">
                  {Array.from({ length: stars }).map((_, i) => (
                    <Star key={i} size={14} className="text-gold fill-gold" />
                  ))}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-5">"{text}"</p>
                <div className="flex items-center gap-2">
                  <div className="text-xl">{flag}</div>
                  <div>
                    <div className="text-sm font-semibold text-white">{name}</div>
                    <div className="text-xs text-slate-500">Level {level}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-bg-card/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">
              Simple, <span className="text-gradient-purple-cyan">Honest Pricing</span>
            </h2>
            <p className="text-slate-400">No hidden fees. Cancel anytime.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                name: 'Basic', price: '€25', per: '/month',
                color: '#7F77DD', features: ['Current level access', 'Speaking practice (7 min)', 'Chat with AI', 'Lessons unlock 1 per day', 'Progress tracking'],
                cta: 'Start with Basic',
              },
              {
                name: 'Super', price: '€45', per: '/month', badge: 'Most Popular',
                color: '#00D4FF', features: ['Everything in Basic', 'Daily call with tutor', 'Unlimited Chat', 'Up to 2 lessons per day', 'Downloadable lessons (PDF)'],
                cta: 'Get Super',
              },
              {
                name: 'Power All Access', price: '€960', per: 'for 2 years',
                color: '#FFD700', features: ['All 6 levels unlocked', 'Daily call with tutor', 'Unlimited Chat & Speaking', '2 years of full access', 'All future updates'],
                cta: 'Get Power Access',
              },
            ].map(({ name, price, per, badge, color, features, cta }) => (
              <div
                key={name}
                className="bg-bg-card rounded-2xl p-6 flex flex-col"
                style={{ border: `1px solid ${color}30` }}
              >
                {badge && (
                  <div className="text-xs font-bold text-bg bg-cyan rounded-full px-3 py-1 w-fit mb-3" style={{ background: color }}>
                    {badge}
                  </div>
                )}
                <div className="text-white font-bold text-lg mb-1">{name}</div>
                <div className="mb-5">
                  <span className="text-4xl font-black" style={{ color }}>{price}</span>
                  <span className="text-slate-400 text-sm"> {per}</span>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-0.5" style={{ color }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/auth?mode=register">
                  <Button className="w-full" style={{ background: color, color: '#0D1B2A' }}>{cta}</Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-glow rounded-3xl" />
            <div className="relative bg-bg-card border border-purple/20 rounded-3xl p-12">
              <h2 className="text-4xl font-black mb-4">
                Ready to Start Speaking <span className="text-gradient-purple-cyan">English Fluently?</span>
              </h2>
              <p className="text-slate-400 mb-8">Join the learners who are already on their journey to fluency.</p>
              <Link to="/auth?mode=register">
                <Button size="lg">
                  Create Free Account <ChevronRight size={18} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-purple-cyan flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <span className="font-bold text-gradient-purple-cyan">Anglish Me</span>
          </div>
          <p className="text-sm text-slate-600">© 2025 Anglish Me · Founded by Anselmo Aldair · Angola 🇦🇴</p>
          <div className="flex gap-4 text-sm text-slate-500">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
