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
  { icon: Target, color: '#FF006E', title: '6 Levels · 36 Months', desc: 'From A1 Beginner to C2 Mastery - a structured path from zero to fluency.' },
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
      <section className="relative pt-32 pb-24 px-6">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-[400px] h-[400px] bg-cyan/6 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative">
          <motion.div
            initial="hidden" animate="show" variants={fadeUp}
            className="inline-flex items-center gap-2 bg-purple/10 border border-purple/20 rounded-full px-4 py-1.5 text-sm text-purple mb-6"
          >
            <Flame size={14} />
            <span>The #1 AI English Platform for Portuguese Speakers</span>
          </motion.div>

          <motion.h1
            custom={1} initial="hidden" animate="show" variants={fadeUp}
            className="text-5xl md:text-7xl font-black leading-tight mb-6"
          >
            Master English{' '}
            <span className="text-gradient-purple-cyan">with AI</span>
            <br />
            in 6 Months
          </motion.h1>

          <motion.p
            custom={2} initial="hidden" animate="show" variants={fadeUp}
            className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10"
          >
            From A1 Beginner to C2 Mastery - gamified daily lessons, real-time voice AI,
            live tutors, and a community that keeps you on streak.
          </motion.p>

          <motion.div
            custom={3} initial="hidden" animate="show" variants={fadeUp}
            className="flex flex-col sm:flex-row gap-4 justify-center"
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
            className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto"
          >
            {[
              { value: '12k+', label: 'Active Learners' },
              { value: '6', label: 'Proficiency Levels' },
              { value: '98%', label: 'Completion Rate' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-black text-gradient-purple-cyan">{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Hero preview card */}
        <motion.div
          custom={5} initial="hidden" animate="show" variants={fadeUp}
          className="max-w-3xl mx-auto mt-16"
        >
          <div className="bg-bg-card border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-pink/60" />
                <div className="w-3 h-3 rounded-full bg-gold/60" />
                <div className="w-3 h-3 rounded-full bg-green/60" />
              </div>
              <span className="text-xs text-slate-500">Anglish Me - Lesson 3 · Week 1</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-bg-elevated rounded-xl p-4 border border-purple/20">
                <div className="text-xs text-purple font-semibold mb-2 uppercase tracking-wide">Today's Lesson</div>
                <div className="text-white font-bold mb-1">Verb To Be - Contractions</div>
                <div className="text-sm text-slate-400 mb-3">Learn how to use I'm, You're, It's naturally</div>
                <div className="flex gap-2">
                  <span className="text-xs bg-green/10 text-green border border-green/20 rounded-lg px-2 py-1">+50 XP</span>
                  <span className="text-xs bg-purple/10 text-purple border border-purple/20 rounded-lg px-2 py-1">8 exercises</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="bg-bg-elevated rounded-xl p-3 border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Daily Streak</span>
                    <span className="text-xs text-gold font-bold">🔥 14 days</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-gold to-pink rounded-full" style={{ width: '70%' }} />
                  </div>
                </div>
                <div className="bg-bg-elevated rounded-xl p-3 border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Weekly XP</span>
                    <span className="text-xs text-cyan font-bold">840 / 1000 XP</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full xp-bar-fill rounded-full" style={{ width: '84%' }} />
                  </div>
                </div>
                <div className="bg-bg-elevated rounded-xl p-3 border border-white/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-purple-cyan flex items-center justify-center text-sm">🎯</div>
                  <div>
                    <div className="text-xs text-white font-medium">Speaking Practice</div>
                    <div className="text-xs text-slate-400">8 / 10 min today</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
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
            <p className="text-slate-400 text-lg">6 structured levels · 6 months each · unlock as you progress</p>
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
                    <div className="text-xs text-slate-400 mt-0.5">Module {i + 1} · 6 months minimum</div>
                  </div>
                  <BookOpen size={16} className="ml-auto text-slate-600" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">
              Loved by <span className="text-gradient-purple-cyan">12,000+ Learners</span>
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
                name: 'Monthly', price: '$19', per: '/month',
                color: '#7F77DD', features: ['Current level access', 'Speaking (10 min/day)', 'Chat with limit', 'Daily lessons', 'Gamification & ranking'],
                cta: 'Start Monthly',
              },
              {
                name: 'Annual', price: '$149', per: '/year', badge: 'Most Popular',
                color: '#00D4FF', features: ['Everything in Monthly', '2 months FREE', 'Unlimited Chat', 'Priority support', 'Download lessons'],
                cta: 'Get Annual - Save 35%',
              },
              {
                name: 'Power All Access', price: '$399', per: 'one-time',
                color: '#FFD700', features: ['All 6 levels unlocked', 'Unlimited Speaking', 'Unlimited Chat', 'Live class credits', 'Lifetime access'],
                cta: 'Get Lifetime Access',
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
              <p className="text-slate-400 mb-8">Join 12,000+ learners who are already on their journey to fluency.</p>
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
