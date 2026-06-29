import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'dark' | 'light' | 'auto'

interface ThemeCtx {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  setTheme: (t: Theme) => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'dark', resolvedTheme: 'dark', setTheme: () => {} })

// Approximate sunset hour (local) per IANA timezone prefix
const SUNSET_BY_TZ: Record<string, number> = {
  'Africa/Luanda':    18,
  'Europe/Lisbon':    20,
  'America/Sao_Paulo': 18,
  'America/Fortaleza': 17,
  'America/Manaus':   18,
  'America/Belem':    18,
}

function getSunsetHour(): number {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  // exact match
  if (SUNSET_BY_TZ[tz]) return SUNSET_BY_TZ[tz]
  // prefix match (e.g. America/*)
  const prefix = Object.keys(SUNSET_BY_TZ).find(k => tz.startsWith(k.split('/')[0]))
  if (prefix) return SUNSET_BY_TZ[prefix]
  // fallback: 19h
  return 19
}

function isDaytime(): boolean {
  const h = new Date().getHours()
  const sunset = getSunsetHour()
  return h >= 6 && h < sunset
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('anglish-theme') as Theme) ?? 'dark'
  })

  const resolvedTheme: 'dark' | 'light' =
    theme === 'auto' ? (isDaytime() ? 'light' : 'dark') : theme

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }, [resolvedTheme])

  // Auto mode: re-check every minute
  useEffect(() => {
    if (theme !== 'auto') return
    const id = setInterval(() => {
      document.documentElement.setAttribute('data-theme', isDaytime() ? 'light' : 'dark')
    }, 60_000)
    return () => clearInterval(id)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('anglish-theme', t)
  }

  return <Ctx.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
