import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getProfile, notifyWelcome } from './auth'
import { useAppStore } from './store'
import { hydrateProgressFromServer, resetProgressSync } from './exerciseProgress'
import { hydratePracticeFromServer, resetPracticeSync } from './practiceSync'
import type { User } from '../types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session: null, user: null, loading: true, refresh: async () => {},
})

// Trigger the welcome-email check at most once per page load (the backend is
// the real source of truth for "send once"; this just avoids spamming it).
let welcomeChecked = false

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const setStoreUser = useAppStore(s => s.setUser)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { resetProgressSync(); resetPracticeSync(); setStoreUser(null); return }
    const profile = await getProfile()
    // Pull this account's lesson + speaking-practice progress from the server BEFORE
    // showing the app, so completed lessons/sets/mistakes appear identically on every
    // browser/device.
    await Promise.all([
      hydrateProgressFromServer().catch(() => {}),
      hydratePracticeFromServer().catch(() => {}),
    ])
    setStoreUser(profile)
    // First authenticated load of this page session → let the backend decide
    // whether to send the one-time welcome email (idempotent, skips old accounts).
    if (!welcomeChecked) { welcomeChecked = true; notifyWelcome() }
  }, [setStoreUser])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      loadProfile(newSession)
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const refresh = async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    await loadProfile(data.session)
  }

  const user = useAppStore(s => s.user)

  return (
    <AuthContext.Provider value={{ session, user, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
