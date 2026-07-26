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
  const ua = window.navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  // iPadOS 13+ reports itself as "Macintosh"; tell it apart by touch support.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

export type IOSBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'other'

/**
 * On iOS every browser runs on WebKit, but the "Add to Home Screen" flow lives
 * in a different place per browser, so we detect which one to show the right steps.
 */
function detectIOSBrowser(): IOSBrowser {
  const ua = window.navigator.userAgent
  if (/CriOS/i.test(ua)) return 'chrome'
  if (/EdgiOS/i.test(ua)) return 'edge'
  if (/FxiOS/i.test(ua)) return 'firefox'
  // In-app webviews (WhatsApp, Instagram, Facebook) can't add to home screen at all.
  if (/FBAN|FBAV|Instagram|Line|WhatsApp/i.test(ua)) return 'other'
  return 'safari'
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
    iosBrowser: detectIOSBrowser(),
    promptInstall,
  }
}
