import { useState } from 'react'
import { Download, Share, PlusSquare, X, Monitor, Smartphone, MoreVertical } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useInstallPrompt, type IOSBrowser } from '../hooks/useInstallPrompt'

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
      <span className="flex items-center flex-wrap">{children}</span>
    </li>
  )
}

function IOSInstructionsModal({ browser, onClose }: { browser: IOSBrowser; onClose: () => void }) {
  // Chrome/Edge on iOS reach "Add to Home Screen" through the Share icon in the
  // address bar; Safari through the Share icon in the bottom bar. Both then behave
  // the same. In-app webviews (WhatsApp etc.) don't offer it at all.
  const isChrome = browser === 'chrome' || browser === 'edge'
  const isWebview = browser === 'other'
  const browserName = browser === 'chrome' ? 'Chrome' : browser === 'edge' ? 'Edge' : browser === 'firefox' ? 'Firefox' : 'Safari'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold text-[var(--text)]">Install on iPhone/iPad</h3>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
              <X size={18} />
            </button>
          </div>

          {isWebview ? (
            <>
              <p className="text-sm text-[var(--text)] mt-3 mb-4">
                You opened this inside another app. To install, open <b>anglishme.com</b> in the <b>Chrome</b> or <b>Safari</b> app first.
              </p>
              <ol className="space-y-3 text-sm text-[var(--text)]">
                <Step n={1}>Tap <MoreVertical size={15} className="inline mx-1 text-cyan-400" /> (top corner) → "Open in browser"</Step>
                <Step n={2}>Then use the Share menu → "Add to Home Screen"</Step>
              </ol>
            </>
          ) : (
            <>
              <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">Steps for {browserName}:</p>
              <ol className="space-y-3 text-sm text-[var(--text)]">
                <Step n={1}>
                  Tap the <Share size={15} className="inline mx-1 text-cyan-400" /> Share button
                  <span className="text-[var(--text-muted)] ml-1">({isChrome ? 'top of the screen' : 'bottom bar'})</span>
                </Step>
                <Step n={2}>
                  Scroll down and tap <PlusSquare size={15} className="inline mx-1 text-cyan-400" /> "Add to Home Screen"
                </Step>
                <Step n={3}>Tap "Add" — Anglish Me appears as an app icon</Step>
              </ol>
            </>
          )}

          <p className="text-xs text-[var(--text-muted)] mt-4">
            Apple doesn't allow a one-tap install on iPhone — this manual step is the same for every browser.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export function InstallAppButton({ variant = 'row' }: { variant?: 'row' | 'compact' }) {
  const { installed, canPromptNatively, isIOS, iosBrowser, promptInstall } = useInstallPrompt()
  const [showIOSModal, setShowIOSModal] = useState(false)

  if (installed) return null

  const handleClick = async () => {
    if (isIOS) { setShowIOSModal(true); return }
    if (canPromptNatively) {
      const outcome = await promptInstall()
      if (outcome === 'accepted') toast.success('Installing Anglish Me…')
      return
    }
    toast('Open this menu from Chrome/Edge on your phone or computer to install.', { icon: 'ℹ️' })
  }

  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={() => void handleClick()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-purple-cyan text-white text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          <Download size={14} />
          Install App
        </button>
        {showIOSModal && <IOSInstructionsModal browser={iosBrowser} onClose={() => setShowIOSModal(false)} />}
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => void handleClick()}
        className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-purple-cyan flex items-center justify-center flex-shrink-0">
          <Download size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">Install App</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
            <Smartphone size={11} /> Phone <span className="opacity-40">·</span> <Monitor size={11} /> Computer — works offline
          </p>
        </div>
      </button>
      {showIOSModal && <IOSInstructionsModal browser={iosBrowser} onClose={() => setShowIOSModal(false)} />}
    </>
  )
}
