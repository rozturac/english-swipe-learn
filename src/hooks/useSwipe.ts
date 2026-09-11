import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

type SwipeHandlers = {
  onLeft: () => void
  onRight: () => void
  onUp: () => void
}

type DragState = {
  x: number
  y: number
  active: boolean
}

/**
 * Touch + pointer swipe. L/R horizontal selection; UP to lock.
 * Down swipe is intentionally ignored.
 */
export function useSwipe(
  handlers: SwipeHandlers,
  opts?: {
    disabled?: boolean
    onDrag?: (dx: number, dy: number) => void
    onDragEnd?: () => void
  },
) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const drag = useRef<DragState>({ x: 0, y: 0, active: false })
  const locked = useRef(false)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const optsRef = useRef(opts)
  optsRef.current = opts

  const THRESH_X = 48
  const THRESH_Y = 56
  const DOMINANCE = 1.15

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (optsRef.current?.disabled) return
    locked.current = false
    start.current = { x: e.clientX, y: e.clientY }
    drag.current = { x: 0, y: 0, active: true }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
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
    if (dy < -THRESH_Y && ay > ax * DOMINANCE) {
      locked.current = true
      handlersRef.current.onUp()
      return
    }
    if (ax > THRESH_X && ax > ay * DOMINANCE) {
      locked.current = true
      if (dx < 0) handlersRef.current.onLeft()
      else handlersRef.current.onRight()
    }
  }, [])

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      start.current = null
      drag.current = { x: 0, y: 0, active: false }
      optsRef.current?.onDragEnd?.()
      finish(dx, dy)
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
