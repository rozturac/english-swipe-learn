import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

type SwipeHandlers = {
  /** Index delta: +1 next card, -1 previous. Carousel-matched, not screen-edge named. */
  onHorizontal: (deltaIndexes: number) => void
  onUp: () => void
}

type DragState = {
  x: number
  y: number
  active: boolean
}

const THRESH_Y = 56
const UP_DOMINANCE = 1.15
/** Only ignore L/R if vertical is clearly larger — slow horizontal still commits. */
const VERT_STEAL = 1.6
const SNAP_RATIO = 0.28

/**
 * Nearest-card snap for the option carousel.
 * tx = -selected*step + dragX, so finger LEFT (dx<0) brings the NEXT card in:
 * deltaIndexes = round(-dx / step). Commit at least one step past 28% of a card.
 */
export function snapIndexDelta(dx: number, step: number): number {
  if (step <= 0 || dx === 0) return 0
  const raw = -dx / step
  const nearest = Math.round(raw)
  if (nearest !== 0) return nearest
  if (Math.abs(dx) > step * SNAP_RATIO) return dx < 0 ? 1 : -1
  return 0
}

/**
 * Touch + pointer swipe. L/R horizontal selection; UP to lock.
 * Down swipe is intentionally ignored.
 *
 * Drag lifecycle: onDragStart → onDrag(dx,dy) → finish(commit) → onDragEnd.
 * finish runs before onDragEnd so selected + drag clear batch in one frame
 * (smooth settle instead of snap-back then jump).
 */
export function useSwipe(
  handlers: SwipeHandlers,
  opts?: {
    disabled?: boolean
    onDragStart?: () => void
    onDrag?: (dx: number, dy: number) => void
    onDragEnd?: () => void
    /** Card pitch (width + gap). Falls back to full-viewport estimate. */
    getStep?: () => number
  },
) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const drag = useRef<DragState>({ x: 0, y: 0, active: false })
  const locked = useRef(false)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const optsRef = useRef(opts)
  optsRef.current = opts

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (optsRef.current?.disabled) return
    locked.current = false
    start.current = { x: e.clientX, y: e.clientY }
    drag.current = { x: 0, y: 0, active: true }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    optsRef.current?.onDragStart?.()
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!start.current || !drag.current.active) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    drag.current = { x: dx, y: dy, active: true }
    optsRef.current?.onDrag?.(dx, dy)
  }, [])

  const finish = useCallback((dx: number, dy: number) => {
    if (locked.current) return
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)

    // UP lock / Reels exit — keep vertical dominance so L/R does not steal it.
    if (dy < -THRESH_Y && ay > ax * UP_DOMINANCE) {
      locked.current = true
      handlersRef.current.onUp()
      return
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth : 360
    const step = optsRef.current?.getStep?.() ?? Math.round(vw * 0.82) + 14
    const delta = snapIndexDelta(dx, step)
    // Soft vertical guard: commit slow L/R even with some finger drift.
    if (delta !== 0 && ay <= ax * VERT_STEAL) {
      locked.current = true
      handlersRef.current.onHorizontal(delta)
    }
  }, [])

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      start.current = null
      drag.current = { x: 0, y: 0, active: false }
      // Commit selection first, then clear drag — React 18 batches both
      // so the strip settles from finger position → new index in one paint.
      finish(dx, dy)
      optsRef.current?.onDragEnd?.()
    },
    [finish],
  )

  const onPointerCancel = useCallback(() => {
    start.current = null
    drag.current = { x: 0, y: 0, active: false }
    optsRef.current?.onDragEnd?.()
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
