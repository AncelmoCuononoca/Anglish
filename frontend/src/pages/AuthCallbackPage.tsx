import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { takePostLoginRedirect } from '../lib/auth'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        // Return to the deep link the user came from (e.g. a shared
        // /lessons/:id), stashed before the Google redirect. Default: dashboard.
        const dest = takePostLoginRedirect() ?? '/dashboard'
        navigate(dest, { replace: true })
      } else {
        navigate('/auth?error=oauth_failed', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <img src="/mascot/logo.png" alt="Anglish Me" className="w-12 h-12 rounded-xl object-cover animate-pulse" />
        <p className="text-slate-400 text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
