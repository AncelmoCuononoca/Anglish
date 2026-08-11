import { useCallback, useMemo, useRef } from 'react'

interface Options {
  /** How long to hold before it counts as a long-press. */
  delay?: number
  /** Finger/mouse movement (px) that cancels the press — i.e. the user is scrolling. */
  moveTolerance?: number
}

// Detects a "press and hold" on touch or mouse.
//
// IMPORTANT: this deliberately uses touch + mouse events, NOT pointer events.
// The lesson list lives inside a vertically scrollable <main>, and on mobile the
// browser fires `pointercancel` on a press inside a scroller (to claim the touch
// for scrolling) even when the finger hasn't moved — which would kill the hold
// before it fires. Touch events don't do that for a stationary press, so the
// hold is reliable. We only cancel on real movement (a genuine scroll) or lift.
//
// Spread the returned handlers onto the element (works through a wrapping
// <Link>): the click that a finger-lift after a long-press would trigger is
// swallowed in the capture phase, and the native long-press menu is suppressed.
export function useLongPress(
  onLongPress: () => void,
  { delay = 400, moveTolerance = 12 }: Options = {},
) {
  const timer = useRef<number | undefined>(undefined)
  const firedRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  // Always call the latest callback (avoids a stale closure if the row re-renders
  // mid-hold).
  const cbRef = useRef(onLongPress)
  cbRef.current = onLongPress

  const clear = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    startRef.current = null
  }, [])

  const begin = useCallback((x: number, y: number) => {
    firedRef.current = false
    startRef.current = { x, y }
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      startRef.current = null
      firedRef.current = true
      cbRef.current()
    }, delay)
  }, [delay])

  const maybeCancelOnMove = useCallback((x: number, y: number) => {
    const s = startRef.current
    if (!s) return
    if (Math.abs(x - s.x) > moveTolerance || Math.abs(y - s.y) > moveTolerance) {
      clear() // moved too far → it's a scroll, not a hold
    }
  }, [clear, moveTolerance])

  return useMemo(() => ({
    // Touch (mobile) — the reliable path inside a scroll container.
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      if (t) begin(t.clientX, t.clientY)
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0]
      if (t) maybeCancelOnMove(t.clientX, t.clientY)
    },
    onTouchEnd: clear,
    onTouchCancel: clear,

    // Mouse (desktop). Compatibility mouse events fired after a touch simply
    // start-then-clear a timer with no lasting effect.
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button === 0) begin(e.clientX, e.clientY)
    },
    onMouseMove: (e: React.MouseEvent) => maybeCancelOnMove(e.clientX, e.clientY),
    onMouseUp: clear,
    onMouseLeave: clear,

    // Capture phase runs before the <Link>'s own click handler, so we can cancel
    // the navigation a finger-lift after a long-press would otherwise trigger.
    onClickCapture: (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault()
        e.stopPropagation()
        firedRef.current = false
      }
    },
    // Suppress the native long-press menu so only our share sheet appears.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }), [begin, maybeCancelOnMove, clear])
}
