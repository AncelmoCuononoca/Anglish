import { supabase } from './supabase'
import { API_BASE } from './apiBase'

// Public VAPID key — safe to ship to the browser. Pairs with the private key
// stored server-side (app_config.vapid_private) that signs the push messages.
const VAPID_PUBLIC_KEY = 'BDOSqFYjPYfb9X4GZtlRLTUCLMi13yVNR-hvozm0-RmpxtPp8ALQKHMDv21i5cwXwjsB5uwzwWr0jOg5RP9oUO4'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

// Ask permission (must be called from a user gesture), subscribe, and store the
// subscription server-side. Returns true only if a push subscription is now
// active. Best-effort: any failure (unsupported, denied, iOS-in-browser) simply
// means the student keeps getting the email reminder instead.
export async function enablePush(): Promise<boolean> {
  try {
    if (!pushSupported()) return false
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }
    const res = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(sub),
    })
    return res.ok
  } catch {
    return false
  }
}

// Unsubscribe this device and forget it server-side. Best-effort.
export async function disablePush(): Promise<void> {
  try {
    if (!pushSupported()) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    const endpoint = sub?.endpoint
    if (sub) await sub.unsubscribe()
    await fetch(`${API_BASE}/api/push/unsubscribe`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ endpoint }),
    })
  } catch { /* best-effort */ }
}
