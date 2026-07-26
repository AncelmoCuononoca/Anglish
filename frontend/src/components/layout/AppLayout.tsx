import { useEffect, useRef } from 'react'
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
  // <main> is the scroll container (not the window), so we can actually hide the
  // scroll indicator on iOS — the window's own indicator is an OS overlay CSS
  // can't touch. `show-page-scrollbar` on <html> re-enables it on Lessons only.
  const mainRef = useRef<HTMLElement>(null)

  // New page → jump to the top (window-scroll did this for free before).
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [pathname])
  // Show the scroll indicator only on the Lessons tab (shows list progress).
  useEffect(() => {
    document.documentElement.classList.toggle('show-page-scrollbar', pathname.startsWith('/lessons'))
    return () => document.documentElement.classList.remove('show-page-scrollbar')
  }, [pathname])

  // First run: a student with no goal picks one before entering the app.
  if (user && user.role !== 'admin' && !user.goal) {
    return <Onboarding />
  }

  // Suspended or expired students get a renewal notice instead of the page -
  // except on Plans / Profile / Settings, so they can still renew or get help.
  const reason = accessReason(user)
  const blocked = reason !== null && !isAllowedWhenBlocked(pathname)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      {/* Desktop: left sidebar. Mobile: bottom icon bar. */}
      <Sidebar />
      <main ref={mainRef}
        className="app-scroll flex-1 ml-0 md:ml-64 h-full overflow-y-auto overflow-x-hidden pb-[calc(3rem+env(safe-area-inset-bottom))] md:pb-0">
        <InstallBanner />
        {blocked ? <AccessLockedNotice reason={reason} accessEnd={user?.access_end} /> : <Outlet />}
      </main>
      <BottomNav />
    </div>
  )
}
