import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { signIn, signUp, signInWithGoogle } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

export function AuthPage() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    params.get('mode') === 'register' ? 'register' : 'login'
  )
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const navigate = useNavigate()

  // Show OAuth errors from callback redirect
  useEffect(() => {
    if (params.get('error') === 'oauth_failed') {
      toast.error('Google sign-in failed. Please try again.')
    }
  }, [params])

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      // Redirect handled by Supabase OAuth flow
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Google sign-in failed')
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'register') {
        await signUp(form.email, form.password, form.name)
        toast.success('Account created! Check your email to confirm.')
        setMode('login')
      } else {
        await signIn(form.email, form.password)
        navigate('/dashboard', { replace: true })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication error'
      if (msg.includes('Invalid login')) {
        toast.error('Invalid email or password')
      } else if (msg.includes('Email not confirmed')) {
        toast.error('Please confirm your email first')
      } else {
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-bg-card border-r border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-cyan/8 rounded-full blur-3xl" />
        </div>

        <Link to="/" className="flex items-center gap-2 relative">
          <img src="/mascot/logo.png" alt="Anglish Me" className="w-9 h-9 rounded-xl object-cover" />
          <span className="text-xl font-bold text-gradient-purple-cyan">Anglish Me</span>
        </Link>

        <div className="relative">
          <h2 className="text-4xl font-black text-white mb-4 leading-tight">
            Your journey to<br />
            <span className="text-gradient-purple-cyan">English fluency</span><br />
            starts here.
          </h2>
          <p className="text-slate-400 text-lg mb-10">
            Join 12,000+ learners mastering English with AI - at their own pace.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {['🎯 Adaptive Lessons', '🔥 Daily Streaks', '🎤 Voice AI', '🏆 Leaderboard', '📅 Live Classes'].map(f => (
              <span key={f} className="bg-bg-elevated border border-white/10 rounded-xl px-3 py-1.5 text-sm text-slate-300">{f}</span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 relative">
          <div className="flex -space-x-2">
            {['🇦🇴', '🇧🇷', '🇵🇹', '🇲🇿'].map((flag) => (
              <div key={flag} className="w-9 h-9 rounded-full bg-bg-elevated border-2 border-bg flex items-center justify-center text-base">
                {flag}
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">12,000+ learners</p>
            <p className="text-xs text-slate-500">across 4 countries</p>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden justify-center mb-8">
            <Link to="/" className="flex items-center gap-2">
              <img src="/mascot/logo.png" alt="Anglish Me" className="w-8 h-8 rounded-xl object-cover" />
              <span className="text-lg font-bold text-gradient-purple-cyan">Anglish Me</span>
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">
            {mode === 'login' ? 'Welcome back 👋' : 'Create your account'}
          </h1>
          <p className="text-slate-400 text-sm mb-8">
            {mode === 'login'
              ? 'Sign in to continue your learning journey.'
              : 'Start your path to English fluency today.'}
          </p>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-bg-elevated border border-white/10 hover:border-white/25 rounded-xl py-2.5 text-sm font-medium text-slate-300 hover:text-white transition-all mb-5"
          >
            {googleLoading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-slate-500">or with email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <Input
                label="Full Name"
                placeholder="Your name"
                icon={<User size={16} />}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="you@email.com"
              icon={<Mail size={16} />}
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
            {mode !== 'forgot' && (
              <div className="relative">
                <Input
                  label="Password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  icon={<Lock size={16} />}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 bottom-2.5 text-slate-400 hover:text-white"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-xs text-purple hover:text-purple-light"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-400">
            {mode === 'login' ? (
              <>Don't have an account?{' '}
                <button onClick={() => setMode('register')} className="text-purple hover:text-purple-light font-medium">
                  Sign up free
                </button>
              </>
            ) : mode === 'register' ? (
              <>Already have an account?{' '}
                <button onClick={() => setMode('login')} className="text-purple hover:text-purple-light font-medium">
                  Sign in
                </button>
              </>
            ) : (
              <button onClick={() => setMode('login')} className="text-purple hover:text-purple-light font-medium">
                ← Back to Sign In
              </button>
            )}
          </div>

          {mode === 'register' && (
            <p className="mt-4 text-center text-xs text-slate-600">
              By creating an account you agree to our{' '}
              <a href="#" className="text-purple/70 hover:text-purple">Terms</a> and{' '}
              <a href="#" className="text-purple/70 hover:text-purple">Privacy Policy</a>.
            </p>
          )}
        </motion.div>
      </div>
    </div>
  )
}
