import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { InstallBanner } from './InstallBanner'
import { useAuth } from '../../lib/AuthContext'
import { accessReason, isAllowedWhenBlocked, AccessLockedNotice } from './AccessGate'
import { Onboarding } from '../onboarding/Onboarding'

export function AppLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  // First run: a student with no goal picks one before entering the app.
  if (user && user.role !== 'admin' && !user.goal) {
    return <Onboarding />
  }

  // Suspended or expired students get a renewal notice instead of the page -
  // except on Plans / Profile / Settings, so they can still renew or get help.
  const reason = accessReason(user)
  const blocked = reason !== null && !isAllowedWhenBlocked(pathname)

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop: left sidebar. Mobile: bottom icon bar. */}
      <Sidebar />
      <main className="flex-1 ml-0 md:ml-64 min-h-screen pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0 overflow-x-hidden">
        <InstallBanner />
        {blocked ? <AccessLockedNotice reason={reason} accessEnd={user?.access_end} /> : <Outlet />}
      </main>
      <BottomNav />
    </div>
  )
}
