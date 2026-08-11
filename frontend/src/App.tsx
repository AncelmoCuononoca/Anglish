import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ThemeProvider } from './lib/ThemeContext'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import { AuthPage } from './pages/AuthPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { DashboardPage } from './pages/DashboardPage'
import { LessonsListPage } from './pages/LessonsListPage'
import { LessonPage } from './pages/LessonPage'
import { ExercisesPage } from './pages/ExercisesPage'
import { SpeakingPage } from './pages/SpeakingPage'
import { SpeakingReviewPage } from './pages/SpeakingReviewPage'
import { ChatPage } from './pages/ChatPage'
import { SchedulePage } from './pages/SchedulePage'
import { ProfilePage } from './pages/ProfilePage'
import { PlansPage } from './pages/PlansPage'
import { FamilyPage } from './pages/FamilyPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { AdminPage } from './pages/AdminPage'
import { SettingsPage } from './pages/SettingsPage'
import { SessionHistoryPage } from './pages/SessionHistoryPage'
import { MistakesPage } from './pages/MistakesPage'
import { TermsPage } from './pages/TermsPage'
import { PrivacyPage } from './pages/PrivacyPage'

// Running as an installed PWA (Home Screen app) rather than a browser tab.
function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

// `/` — the marketing/landing page. In the installed app, a logged-in user is
// sent straight into the app (never the sales page). On the web it stays the
// landing page as before, logged in or not.
function HomeRoute() {
  const { session, loading } = useAuth()
  if (isStandaloneApp()) {
    if (loading) return null
    if (session) return <Navigate to="/dashboard" replace />
  }
  return <LandingPage />
}

// `/auth` — a user who is already signed in has no reason to see the login
// screen; send them into the app (fixes reopening the app landing on login).
function AuthRoute() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/dashboard" replace />
  return <AuthPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#112236',
                color: '#e2e8f0',
                border: '1px solid rgba(127,119,221,0.25)',
                borderRadius: '12px',
                fontSize: '13px',
              },
              success: { iconTheme: { primary: '#00FF88', secondary: '#112236' } },
              error:   { iconTheme: { primary: '#FF006E', secondary: '#112236' } },
            }}
          />
          <Routes>
            {/* Public */}
            <Route path="/" element={<HomeRoute />} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/auth/confirm"  element={<AuthCallbackPage />} />

            {/* Protected app */}
            <Route element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route path="/dashboard"        element={<DashboardPage />} />
              <Route path="/lessons"          element={<LessonsListPage />} />
              <Route path="/lessons/:id"      element={<LessonPage />} />
              <Route path="/exercises/:id"    element={<ExercisesPage />} />
              <Route path="/speaking"         element={<SpeakingPage />} />
              <Route path="/speaking/review"  element={<SpeakingReviewPage />} />
              <Route path="/chat"             element={<ChatPage />} />
              <Route path="/schedule"         element={<SchedulePage />} />
              <Route path="/leaderboard"      element={<LeaderboardPage />} />
              <Route path="/profile"          element={<ProfilePage />} />
              <Route path="/plans"            element={<PlansPage />} />
              <Route path="/family"           element={<FamilyPage />} />
              <Route path="/settings"         element={<SettingsPage />} />
              <Route path="/history"          element={<SessionHistoryPage />} />
              <Route path="/mistakes"         element={<MistakesPage />} />
              <Route path="/terms"            element={<TermsPage />} />
              <Route path="/privacy"          element={<PrivacyPage />} />

              {/* Admin */}
              <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                  <AdminPage />
                </ProtectedRoute>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
