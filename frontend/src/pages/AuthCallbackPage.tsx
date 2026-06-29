import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/auth?error=oauth_failed', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-purple-cyan flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">A</span>
        </div>
        <p className="text-slate-400 text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
