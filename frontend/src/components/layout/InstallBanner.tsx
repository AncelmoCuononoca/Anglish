import { useState } from 'react'
import { X } from 'lucide-react'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { InstallAppButton } from '../InstallAppButton'

const DISMISS_KEY = 'anglish_install_banner_dismissed'

export function InstallBanner() {
  const { installed, canPromptNatively, isIOS } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  const eligible = !installed && (canPromptNatively || isIOS)
  if (!eligible || dismissed) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-purple-cyan/10 border-b border-purple-400/20">
      <p className="text-xs text-[var(--text)] flex-1 min-w-0">
        <span className="font-semibold">Get the app</span> — install Anglish Me on your phone or computer.
      </p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <InstallAppButton variant="compact" />
        <button onClick={dismiss} className="text-[var(--text-muted)] hover:text-[var(--text)] p-1">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
