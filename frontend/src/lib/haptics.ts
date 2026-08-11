// Light haptic "tap" for the push-to-talk button — the little buzz you feel in
// WhatsApp when you hold to record.
//
// Android / Chrome (incl. installed PWAs) expose the Web Vibration API, so we
// vibrate directly. iOS Safari has NO Vibration API at all — Apple only allows
// haptics to native apps. The one web workaround (iOS 17.4+) is to toggle a
// hidden native `<input switch>`, which nudges the Taptic Engine. It is genuinely
// best-effort: it may produce a faint tap or nothing, depending on the iOS
// version. Both paths silently no-op where unsupported.

type Vibrator = Navigator & { vibrate?: (pattern: number | number[]) => boolean }

// A hidden <label> wrapping a native iOS switch. Clicking the LABEL toggles the
// switch and fires the Taptic tap on iOS 17.4+ (the known-working pattern used
// by the `ios-haptics` approach — display:none is fine, the click is what counts).
let iosLabel: HTMLLabelElement | null = null
function ensureIosLabel(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null
  if (iosLabel && document.body.contains(iosLabel)) return iosLabel
  const label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.display = 'none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '') // iOS 17.4+ native switch control
  label.appendChild(input)
  document.body.appendChild(label)
  iosLabel = label
  return label
}

// One light tap. Call on the *press* (pointer down) of a hold-to-record button,
// inside the user-gesture handler (both APIs require a user gesture).
export function hapticTap(): void {
  // 1) Web Vibration API — Android / Chrome / most Android PWAs. ~18ms reads as a
  //    single light "click" (very short pulses are ignored on some devices).
  try {
    const nav = navigator as Vibrator
    if (typeof nav.vibrate === 'function') {
      if (nav.vibrate(18)) return
    }
  } catch { /* vibration unsupported / blocked */ }
  // 2) iOS Safari/PWA: no Vibration API — nudge the native switch (iOS 17.4+).
  try {
    ensureIosLabel()?.click()
  } catch { /* iOS haptic trick unavailable */ }
}
