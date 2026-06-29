import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Ban, CalendarX, CreditCard } from 'lucide-react'
import type { User } from '../../types'

export type AccessReason = 'suspended' | 'expired' | null

// Mirrors the backend requireActiveAccess check. Admins and students with no
// access_end (free / lifetime) are never blocked. A suspended account, or one
// whose paid window (access_end) has passed, is locked out.
export function accessReason(user: User | null): AccessReason {
  if (!user || user.role === 'admin') return null
  if (user.suspended) return 'suspended'
  const today = new Date().toISOString().slice(0, 10)
  if (user.access_end && user.access_end < today) return 'expired'
  return null
}

// Routes a blocked student may still reach - so they can renew or get help.
const ALLOWED_WHEN_BLOCKED = ['/plans', '/profile', '/settings']
export function isAllowedWhenBlocked(pathname: string): boolean {
  return ALLOWED_WHEN_BLOCKED.some(p => pathname.startsWith(p))
}

// Full-screen renewal notice shown in place of the page content.
export function AccessLockedNotice({ reason, accessEnd }: { reason: AccessReason; accessEnd?: string | null }) {
  const suspended = reason === 'suspended'
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className="max-w-md w-full text-center bg-bg-card border border-white/10 rounded-3xl p-8"
      >
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: suspended ? '#FF006E18' : '#FFB02018', border: `1px solid ${suspended ? '#FF006E40' : '#FFB02040'}` }}
        >
          {suspended ? <Ban size={30} className="text-pink" /> : <CalendarX size={30} style={{ color: '#FFB020' }} />}
        </div>

        <h1 className="text-xl font-black text-white mb-2">
          {suspended ? 'Account suspended' : 'Your access has ended'}
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-1">
          {suspended
            ? 'Your account is paused. Please talk to your coach to reactivate it.'
            : 'Your paid period is over. Renew your plan to keep learning - your progress, streak and XP are safe.'}
        </p>
        {!suspended && accessEnd && (
          <p className="text-xs text-slate-600 mb-5">Access ended on {accessEnd}</p>
        )}

        <div className="mt-6 space-y-2.5">
          {!suspended && (
            <Link
              to="/plans"
              className="w-full flex items-center justify-center gap-2 bg-gradient-purple-cyan text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              <CreditCard size={17} /> Renew my plan
            </Link>
          )}
          <Link
            to="/profile"
            className="w-full flex items-center justify-center gap-2 border border-white/10 text-slate-300 font-semibold py-3 rounded-xl hover:border-white/20 hover:text-white transition-colors"
          >
            <Lock size={16} /> View my profile
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
