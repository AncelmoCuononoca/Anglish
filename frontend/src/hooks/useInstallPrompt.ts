import { useEffect, useState, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes this on navigator instead of matchMedia
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

/**
 * Chrome/Edge/Android fire `beforeinstallprompt` when the PWA is installable;
 * iOS Safari never fires it, so callers must fall back to manual instructions there.
 */
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredEvent) return 'unavailable' as const
    await deferredEvent.prompt()
    const { outcome } = await deferredEvent.userChoice
    setDeferredEvent(null)
    return outcome
  }, [deferredEvent])

  return {
    installed,
    canPromptNatively: !!deferredEvent,
    isIOS: isIOS(),
    promptInstall,
  }
}
