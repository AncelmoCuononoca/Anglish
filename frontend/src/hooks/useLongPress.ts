import { useCallback, useRef } from 'react'

interface Options {
  /** How long to hold before it counts as a long-press. */
  delay?: number
  /** Finger movement (px) that cancels the press — i.e. the user is scrolling. */
  moveTolerance?: number
}

// Detects a "press and hold" on touch or mouse. Spread the returned handlers
// onto the element you want to long-press. It plays nicely with a wrapping
// <Link>: when a long-press fires, the click that would normally follow (and
// navigate) is swallowed in the capture phase, and the browser's own long-press
// context menu is suppressed.
export function useLongPress(
  onLongPress: () => void,
  { delay = 450, moveTolerance = 10 }: Options = {},
) {
  const timer = useRef<number | undefined>(undefined)
  const firedRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)

  const clear = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    startRef.current = null
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only the primary (left) mouse button; any touch/pen contact counts.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    firedRef.current = false
    startRef.current = { x: e.clientX, y: e.clientY }
    timer.current = window.setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, delay)
  }, [onLongPress, delay])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = startRef.current
    if (!s) return
    if (Math.abs(e.clientX - s.x) > moveTolerance || Math.abs(e.clientY - s.y) > moveTolerance) {
      clear() // moved too far → treat as a scroll, not a hold
    }
  }, [clear, moveTolerance])

  // Capture phase runs before the <Link>'s own click handler, so we can cancel
  // the navigation that a finger-lift after a long-press would otherwise trigger.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (firedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      firedRef.current = false
    }
  }, [])

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // Suppress the native long-press menu so our share sheet is the only thing
    // that appears.
    e.preventDefault()
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClickCapture,
    onContextMenu,
  }
}
