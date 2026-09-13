import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'

type Props = {
  options: string[]
  selected: number
  revealCorrect?: number | null
  dragX?: number
  dragging?: boolean
  frozen?: boolean
  onStep?: (step: number) => void
  /** Card-only wrong flash (no scene veil). */
  wrongFlash?: boolean
  /** Brief success green on correct lock. */
  successFlash?: boolean
  /** One-shot ghost gesture on first card. */
  showGhost?: boolean
  /** Read-only review of a prior card — hint becomes ↑ geri. */
  reviewMode?: boolean
  /** After ≥1 completed card: show ↓ önceki on the active jest line. */
  showReviewHint?: boolean
}

/** Wider / more landscape selected card — mock is longer horizontally. */
const CARD_RATIO = 0.93
const GAP_PX = 14

/** Card pitch used by carousel snap (width + gap). */
function optionStep(viewportWidth: number): number {
  return Math.round(viewportWidth * CARD_RATIO) + GAP_PX
}

export function OptionStrip({
  options,
  selected,
  revealCorrect = null,
  dragX = 0,
  dragging = false,
  frozen = false,
  onStep,
  wrongFlash = false,
  successFlash = false,
  showGhost = false,
  reviewMode = false,
  showReviewHint = false,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [vw, setVw] = useState(360)
  const n = options.length
  const hasLoop = n > 1

  const prevSelected = useRef(selected)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const settlingWrap = useRef(false)
  // Visual strip index (includes leading/trailing clones when looping)
  const [visualIdx, setVisualIdx] = useState(() => (n > 1 ? selected + 1 : selected))
  // Skip CSS transition: first paint, silent wrap reindex, drag interrupt
  const [skipTransition, setSkipTransition] = useState(true)

  useLayoutEffect(() => {
    if (!skipTransition) return
    // Paint one frame with transition:none (silent wrap reindex), then re-enable
    const id = requestAnimationFrame(() => setSkipTransition(false))
    return () => cancelAnimationFrame(id)
  }, [skipTransition])

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setVw(w)
    })
    ro.observe(el)
    setVw(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const cardW = Math.round(vw * CARD_RATIO)
  const sidePad = Math.round((vw - cardW) / 2)
  const step = optionStep(vw)

  useLayoutEffect(() => {
    onStep?.(step)
  }, [step, onStep])

  // Interrupt mid-wrap settle if a new drag starts — snap to real index silently
  useLayoutEffect(() => {
    if (!dragging || !settlingWrap.current) return
    settlingWrap.current = false
    setSkipTransition(true)
    setVisualIdx(hasLoop ? selected + 1 : selected)
  }, [dragging, selected, hasLoop])

  // Selected change: normal settle, or animate onto clone then silent reindex
  useLayoutEffect(() => {
    const prev = prevSelected.current
    if (prev === selected) return

    const dist = Math.abs(selected - prev)
    const isWrap = hasLoop && dist > Math.floor(n / 2)

    if (isWrap) {
      // Forward wrap (e.g. 2→0): settle onto trailing clone; backward (0→2): leading clone
      const forward = selected < prev
      const cloneIdx = forward ? n + 1 : 0
      settlingWrap.current = true
      setSkipTransition(false)
      setVisualIdx(cloneIdx)
    } else {
      settlingWrap.current = false
      setSkipTransition(false)
      setVisualIdx(hasLoop ? selected + 1 : selected)
    }
    prevSelected.current = selected
  }, [selected, hasLoop, n])

  const finishWrapReindex = () => {
    if (!settlingWrap.current) return
    settlingWrap.current = false
    const real = selectedRef.current
    setSkipTransition(true)
    setVisualIdx(hasLoop ? real + 1 : real)
  }

  const onStripTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.propertyName !== 'transform') return
    finishWrapReindex()
  }

  // Safety: if transitionend is skipped (tab background, reduced motion), still reindex
  useEffect(() => {
    if (visualIdx !== 0 && !(hasLoop && visualIdx === n + 1)) return
    if (!settlingWrap.current) return
    const t = window.setTimeout(() => finishWrapReindex(), 750)
    return () => window.clearTimeout(t)
  }, [visualIdx, hasLoop, n])

  // Free follow — no edge rubber; infinite L/R
  const follow = frozen ? 0 : dragX
  const tx = -visualIdx * step + follow

  const cards: { text: string; realIndex: number; key: string }[] = []
  if (hasLoop) {
    const last = n - 1
    cards.push({
      text: options[last]!,
      realIndex: last,
      key: `clone-prev-${last}`,
    })
  }
  options.forEach((text, i) => {
    cards.push({ text, realIndex: i, key: `real-${i}` })
  })
  if (hasLoop) {
    cards.push({
      text: options[0]!,
      realIndex: 0,
      key: `clone-next-0`,
    })
  }

  const noTransition = skipTransition || frozen || (dragging && !frozen)

  return (
    <div className={`option-viewport${frozen ? ' is-frozen' : ''}`} ref={viewportRef}>
      <div
        className={`option-strip${dragging && !frozen ? ' is-dragging' : ''}`}
        style={{
          paddingLeft: sidePad,
          transform: `translate3d(${tx}px, 0, 0)`,
          // Inline wins over stylesheet while finger is down / locked / silent reindex
          transition: noTransition ? 'none' : undefined,
        }}
        onTransitionEnd={onStripTransitionEnd}
      >
        {cards.map(({ text, realIndex, key }, i) => {
          const isClone = key.startsWith('clone')
          // Chrome follows the visually centered card (clone during wrap settle)
          const isSel = i === visualIdx
          // Correct answer highlight only on the real copy (side card OK when wrong)
          const isReveal = !isClone && revealCorrect !== null && realIndex === revealCorrect
          const isWrongSel =
            (wrongFlash || revealCorrect !== null) &&
            isSel &&
            (revealCorrect === null || realIndex !== revealCorrect)
          return (
            <div
              key={key}
              className={[
                'option-card',
                isSel ? 'is-selected' : 'is-side',
                isReveal ? 'is-reveal' : '',
                isWrongSel ? 'is-wrong' : '',
                wrongFlash && isWrongSel ? 'is-wrong-flash' : '',
                successFlash && isSel ? 'is-success' : '',
                frozen ? 'is-locked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ width: cardW, marginRight: GAP_PX }}
            >
              {isReveal ? (
                <span className="reveal-label">Doğru cevap</span>
              ) : null}
              <p className="option-text" lang="tr">
                {text}
              </p>
            </div>
          )
        })}
      </div>

      <div className="option-chrome" aria-hidden>
        <div className="pager-dots" role="presentation">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`pager-dot${i === selected ? ' is-on' : ''}`}
            />
          ))}
        </div>
        {reviewMode ? (
          <p className="jest-hint">
            <span className="jest-part">
              <span className="jest-ico" aria-hidden>
                ↑
              </span>{' '}
              geri
            </span>
          </p>
        ) : (
          <p className="jest-hint">
            <span className="jest-part">
              <span className="jest-ico" aria-hidden>
                ↔
              </span>{' '}
              seç
            </span>
            <span className="jest-sep" aria-hidden>
              ·
            </span>
            <span className="jest-part">
              <span className="jest-ico" aria-hidden>
                ↑
              </span>{' '}
              kilitle
            </span>
            {showReviewHint ? (
              <>
                <span className="jest-sep" aria-hidden>
                  ·
                </span>
                <span className="jest-part">
                  <span className="jest-ico" aria-hidden>
                    ↓
                  </span>{' '}
                  önceki
                </span>
              </>
            ) : null}
          </p>
        )}
        {showGhost ? (
          <div className="ghost-gesture" aria-hidden>
            <span className="ghost-hand">👆</span>
            <span className="ghost-arrows">↔ ↑</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
