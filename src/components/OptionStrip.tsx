import { useLayoutEffect, useRef, useState } from 'react'

type Props = {
  options: string[]
  selected: number
  revealCorrect?: number | null
  dragX?: number
  dragging?: boolean
  frozen?: boolean
  onStep?: (step: number) => void
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
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [vw, setVw] = useState(360)
  const prevSelected = useRef(selected)
  // First paint after remount: no strip transition (Reels frame slides; TR is settled)
  const [skipTransition, setSkipTransition] = useState(true)
  useLayoutEffect(() => {
    if (!skipTransition) return
    setSkipTransition(false)
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

  const n = options.length
  const cardW = Math.round(vw * CARD_RATIO)
  const sidePad = Math.round((vw - cardW) / 2)
  const step = optionStep(vw)

  useLayoutEffect(() => {
    onStep?.(step)
  }, [step, onStep])

  // Detect wrap on this render (prev still old) so first paint skips CSS fly-through.
  const dist = Math.abs(selected - prevSelected.current)
  const isWrapJump = n > 1 && dist > Math.floor(n / 2)
  useLayoutEffect(() => {
    prevSelected.current = selected
  }, [selected])

  // Free follow — no edge rubber; infinite L/R
  const follow = frozen ? 0 : dragX
  // Clone strip: [last, ...options, first] so drag past ends previews wrap
  const hasLoop = n > 1
  const visualSelected = hasLoop ? selected + 1 : selected
  const tx = -visualSelected * step + follow

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

  return (
    <div className={`option-viewport${frozen ? ' is-frozen' : ''}`} ref={viewportRef}>
      <div
        className={`option-strip${dragging && !frozen ? ' is-dragging' : ''}${isWrapJump ? ' is-wrap-jump' : ''}`}
        style={{
          paddingLeft: sidePad,
          transform: `translate3d(${tx}px, 0, 0)`,
          // Inline wins over stylesheet while finger is down / locked / wrap jump
          transition:
            skipTransition || frozen || dragging || isWrapJump ? 'none' : undefined,
        }}
      >
        {cards.map(({ text, realIndex, key }) => {
          const isClone = key.startsWith('clone')
          // Only the real (middle) copy gets selected chrome — clones are off-edge previews
          const isSel = !isClone && realIndex === selected
          const isReveal = !isClone && revealCorrect !== null && realIndex === revealCorrect
          const isWrongSel =
            revealCorrect !== null && isSel && selected !== revealCorrect
          const showFrame = isSel && revealCorrect === null
          return (
            <div
              key={key}
              className={[
                'option-card',
                isSel ? 'is-selected' : 'is-side',
                isReveal ? 'is-reveal' : '',
                isWrongSel ? 'is-wrong' : '',
                frozen ? 'is-locked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ width: cardW, marginRight: GAP_PX }}
            >
              {showFrame && (
                <picture>
                  <source
                    srcSet="/english-swipe-learn/card-frame.webp"
                    type="image/webp"
                  />
                  <img
                    className="card-frame-img"
                    src="/english-swipe-learn/card-frame.png"
                    alt=""
                    aria-hidden
                  />
                </picture>
              )}
              <p className="option-text" lang="tr">
                {text}
              </p>
            </div>
          )
        })}
      </div>
      <div className="swipe-hint" aria-hidden>
        <picture>
          <source srcSet="/english-swipe-learn/swipe-hint.webp" type="image/webp" />
          <img
            className="swipe-hint-img"
            src="/english-swipe-learn/swipe-hint.png"
            alt=""
          />
        </picture>
      </div>
    </div>
  )
}
