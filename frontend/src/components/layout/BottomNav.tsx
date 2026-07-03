import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, Mic, MessageSquare,
  Calendar, Trophy, User, CreditCard, ShieldCheck,
  Settings, MoreHorizontal, X, Users,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../lib/store'
import { hasFamilyPlan } from '../../lib/plans'

// Mobile-only bottom navigation (Duolingo-style: icon-only). The four most-used
// destinations sit in the bar; everything else lives behind a "More" (•••) sheet
// so the app fits any phone width.
const PRIMARY = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/lessons',   icon: BookOpen,        label: 'Lessons' },
  { to: '/speaking',  icon: Mic,             label: 'Speaking' },
  { to: '/chat',      icon: MessageSquare,   label: 'Chat' },
]

const MORE = [
  { to: '/schedule',    icon: Calendar,   label: 'Live Class' },
  { to: '/leaderboard', icon: Trophy,     label: 'Ranking' },
  { to: '/profile',     icon: User,       label: 'Profile' },
  { to: '/plans',       icon: CreditCard, label: 'Plans' },
  { to: '/settings',    icon: Settings,   label: 'Settings' },
]

export function BottomNav() {
  const user = useAppStore((s) => s.user)
  const { pathname } = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)

  // Items shown in the "More" sheet (Family for family plans, Admin for admins).
  const moreItems = [
    ...MORE,
    ...(hasFamilyPlan(user?.plan) ? [{ to: '/family', icon: Users, label: 'Family' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/admin', icon: ShieldCheck, label: 'Admin Panel' }] : []),
  ]
  const moreActive = moreItems.some((i) => pathname.startsWith(i.to))

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-card/95 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-16">
          {PRIMARY.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
                  isActive ? 'text-purple' : 'text-slate-400'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={24} strokeWidth={isActive ? 2.6 : 2} />
                  <span className="w-6 h-1 rounded-full" style={{ background: isActive ? 'var(--accent, #7F77DD)' : 'transparent' }} />
                </>
              )}
            </NavLink>
          ))}

          <button
            type="button"
            aria-label="More"
            onClick={() => setSheetOpen(true)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
              moreActive || sheetOpen ? 'text-purple' : 'text-slate-400'
            )}
          >
            <MoreHorizontal size={24} strokeWidth={moreActive ? 2.6 : 2} />
            <span className="w-6 h-1 rounded-full" style={{ background: moreActive ? 'var(--accent, #7F77DD)' : 'transparent' }} />
          </button>
        </div>
      </nav>

      {sheetOpen && createPortal(
        <AnimatePresence>
          <motion.div
            className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
          >
            <motion.div
              className="w-full bg-bg-card border-t border-white/10 rounded-t-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
              initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-sm font-bold text-white">Menu</span>
                <button onClick={() => setSheetOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {moreItems.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setSheetOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border transition-all',
                        isActive
                          ? 'bg-purple/20 border-purple/50 text-white'
                          : 'bg-bg-elevated border-white/10 text-slate-300'
                      )
                    }
                  >
                    <Icon size={22} />
                    <span className="text-[11px] font-semibold">{label}</span>
                  </NavLink>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
