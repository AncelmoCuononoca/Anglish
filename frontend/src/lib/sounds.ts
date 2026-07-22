export function playCorrect(): void {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    ;[523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08)
      osc.connect(gain)
      osc.start(ctx.currentTime + i * 0.08)
      osc.stop(ctx.currentTime + i * 0.08 + 0.35)
    })
    setTimeout(() => ctx.close(), 1000)
  } catch {}
}

// Ringback tone ("calling…"), a soft EU-style 425 Hz burst that repeats until
// the returned stop() is called (i.e. when the tutor "answers"). Makes the call
// feel real while the Realtime session is connecting.
export function startRingback(): () => void {
  let ctx: AudioContext
  try { ctx = new AudioContext() } catch { return () => {} }
  const c = ctx
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const ring = () => {
    if (stopped) return
    try {
      const gain = c.createGain()
      gain.connect(c.destination)
      gain.gain.setValueAtTime(0.0001, c.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.1, c.currentTime + 0.05)
      gain.gain.setValueAtTime(0.1, c.currentTime + 0.9)
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.0)
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(425, c.currentTime)
      osc.connect(gain)
      osc.start(c.currentTime)
      osc.stop(c.currentTime + 1.05)
    } catch {}
    timer = setTimeout(ring, 3000) // ~1s ring + 2s silence, like a real phone
  }
  ring()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    try { c.close() } catch {}
  }
}

// "Answered": a short warm two-note chime when the tutor picks up.
export function playAnswered(): void {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.16, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55)
    ;[440, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
      osc.connect(gain)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.3)
    })
    setTimeout(() => ctx.close(), 1000)
  } catch {}
}

export function playWrong(): void {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + 0.35)
    osc.connect(gain)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => ctx.close(), 800)
  } catch {}
}
