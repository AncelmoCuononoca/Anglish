import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { XPBar } from '../gamification/XPBar'
import { StreakBadge } from '../gamification/StreakBadge'
import { useAppStore } from '../../lib/store'
import { hasFamilyPlan } from '../../lib/plans'
import {
  LayoutDashboard, BookOpen, Mic, MessageSquare,
  Calendar, Trophy, User, CreditCard, ShieldCheck,
  Settings, Users,
} from 'lucide-react'

const nav = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/lessons',     icon: BookOpen,         label: 'Lessons' },
  { to: '/speaking',    icon: Mic,              label: 'Speaking' },
  { to: '/chat',        icon: MessageSquare,    label: 'Chat' },
  { to: '/schedule',    icon: Calendar,         label: 'Live Class' },
  { to: '/leaderboard', icon: Trophy,           label: 'Ranking' },
  { to: '/profile',     icon: User,             label: 'Profile' },
  { to: '/plans',       icon: CreditCard,       label: 'Plans' },
]

export function Sidebar() {
  const user = useAppStore((s) => s.user)

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-bg-card border-r border-white/5 flex-col z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <img src="/mascot/logo.png" alt="Anglish Me" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-lg font-bold text-gradient-purple-cyan">Anglish Me</span>
        </div>
      </div>

      {/* User info */}
      {user && (
        <div className="px-4 py-4 border-b border-white/5">
          <div className="flex items-center gap-3 mb-3">
            {user.avatar_url
              ? <img src={user.avatar_url} alt={user.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              : <div className="w-10 h-10 rounded-full bg-gradient-purple-cyan flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
              <p className="text-xs text-slate-400">{user.level} · {user.level === 'A1' ? 'Beginner' : user.level}</p>
            </div>
          </div>
          <XPBar xp={user.xp} compact />
          <div className="mt-2">
            <StreakBadge streak={user.streak} size="sm" />
          </div>
        </div>
      )}

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-purple/15 text-purple border border-purple/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {hasFamilyPlan(user?.plan) && (
          <NavLink to="/family"
            className={({ isActive }) =>
              cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive ? 'bg-green/15 text-green border border-green/20' : 'text-slate-400 hover:text-white hover:bg-white/5')
            }
          >
            <Users size={18} />
            Family
          </NavLink>
        )}

        {user?.role === 'admin' && (
          <NavLink to="/admin"
            className={({ isActive }) =>
              cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 mt-2',
                isActive ? 'bg-pink/15 text-pink border border-pink/20' : 'text-slate-400 hover:text-pink hover:bg-pink/5')
            }
          >
            <ShieldCheck size={18} />
            Admin Panel
          </NavLink>
        )}
      </nav>

      {/* Bottom: Settings only - NO logout here */}
      <div className="px-3 pb-4 border-t border-white/5 pt-3">
        <NavLink to="/settings"
          className={({ isActive }) =>
            cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              isActive ? 'bg-purple/15 text-purple border border-purple/20' : 'text-slate-400 hover:text-white hover:bg-white/5')
          }
        >
          <Settings size={18} />
          Settings
        </NavLink>
        <p className="text-xs text-slate-600 text-center mt-3">© 2025 Anglish Me</p>
      </div>
    </aside>
  )
}
