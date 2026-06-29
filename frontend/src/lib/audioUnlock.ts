// iOS Safari blocks audio that starts AFTER an async step (e.g. fetching TTS then
// calling .play()), even if a button was tapped - the play() is no longer "inside"
// the user gesture. The fix used by audio libraries (Howler etc.): on the very
// first user interaction, play a tiny SILENT clip. That grants the page audio
// activation, so later programmatic Audio().play() calls are allowed for the session.

// A short, valid silent WAV (44.1kHz mono, a few zero samples).
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

let unlocked = false

function unlock() {
  if (unlocked) return
  try {
    const a = new Audio(SILENCE)
    a.volume = 0
    const p = a.play()
    if (p && typeof p.then === 'function') {
      p.then(() => { unlocked = true; a.pause() }).catch(() => { /* will retry on next gesture */ })
    } else {
      unlocked = true
    }
    // Also resume a WebAudio context if the browser created one.
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
    const AC = Ctx.AudioContext || Ctx.webkitAudioContext
    if (AC) { try { const ctx = new AC(); if (ctx.state === 'suspended') void ctx.resume() } catch { /* noop */ } }
  } catch { /* noop */ }
}

// Install once at app startup. Stays listening until the first successful unlock.
export function installAudioUnlock() {
  if (typeof window === 'undefined') return
  const handler = () => {
    unlock()
    if (unlocked) {
      window.removeEventListener('touchend', handler)
      window.removeEventListener('click', handler)
      window.removeEventListener('pointerdown', handler)
    }
  }
  window.addEventListener('touchend', handler, { passive: true })
  window.addEventListener('click', handler, { passive: true })
  window.addEventListener('pointerdown', handler, { passive: true })
}
