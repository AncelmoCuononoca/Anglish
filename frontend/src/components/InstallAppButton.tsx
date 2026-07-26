import { useState } from 'react'
import { Download, Share, PlusSquare, X, Monitor, Smartphone } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

function IOSInstructionsModal({ onClose }: { onClose: () => void }) {
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-[var(--text)]">Install on iPhone/iPad</h3>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
              <X size={18} />
            </button>
          </div>
          <ol className="space-y-3 text-sm text-[var(--text)]">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-400 text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
              Tap the <Share size={15} className="inline mx-1 text-cyan-400" /> Share button in Safari
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-400 text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
              Scroll down and tap <PlusSquare size={15} className="inline mx-1 text-cyan-400" /> "Add to Home Screen"
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-400 text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
              Tap "Add" — Anglish Me appears as an app icon
            </li>
          </ol>
          <p className="text-xs text-[var(--text-muted)] mt-4">Must be open in Safari (not Chrome) for this option to appear.</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export function InstallAppButton({ variant = 'row' }: { variant?: 'row' | 'compact' }) {
  const { installed, canPromptNatively, isIOS, promptInstall } = useInstallPrompt()
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
        {showIOSModal && <IOSInstructionsModal onClose={() => setShowIOSModal(false)} />}
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
      {showIOSModal && <IOSInstructionsModal onClose={() => setShowIOSModal(false)} />}
    </>
  )
}
