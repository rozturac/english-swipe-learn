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

const CARD_RATIO = 0.82
const GAP_PX = 14

/** Card pitch used by carousel snap (width + gap). */
function optionStep(viewportWidth: number): number {
  return Math.round(viewportWidth * CARD_RATIO) + GAP_PX
}

/** iOS-like rubber band past the first/last card. */
function edgeRubber(
  dx: number,
  selected: number,
  last: number,
  dim: number,
): number {
  if (dim <= 0) return dx
  if (selected <= 0 && dx > 0) return dx / (1 + dx / dim)
  if (selected >= last && dx < 0) {
    const a = -dx
    return -a / (1 + a / dim)
  }
  return dx
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
  const last = Math.max(0, options.length - 1)

  useLayoutEffect(() => {
    onStep?.(step)
  }, [step, onStep])
  // ~1:1 finger follow while dragging; rubber-band only past ends
  const follow = frozen ? 0 : edgeRubber(dragX, selected, last, cardW)
  const tx = -selected * step + follow

  return (
    <div className={`option-viewport${frozen ? ' is-frozen' : ''}`} ref={viewportRef}>
      <div
        className={`option-strip${dragging && !frozen ? ' is-dragging' : ''}`}
        style={{
          paddingLeft: sidePad,
          transform: `translate3d(${tx}px, 0, 0)`,
          // Inline wins over stylesheet while finger is down / locked
          transition: frozen || dragging ? 'none' : undefined,
        }}
      >
        {options.map((text, i) => {
          const isSel = i === selected
          const isReveal = revealCorrect !== null && i === revealCorrect
          const isWrongSel =
            revealCorrect !== null && isSel && selected !== revealCorrect
          return (
            <div
              key={`${i}-${text.slice(0, 24)}`}
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
              <p className="option-text" lang="tr">
                {text}
              </p>
            </div>
          )
        })}
      </div>
      <div className="swipe-hint" aria-hidden>
        <svg viewBox="0 0 200 20" fill="none">
          <defs>
            <linearGradient id="swipeGrad" x1="0" y1="0" x2="200" y2="0">
              <stop stopColor="#D18CFF" />
              <stop offset="1" stopColor="#4DD8FF" />
            </linearGradient>
          </defs>
          <path
            d="M18 10 H182"
            stroke="url(#swipeGrad)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M16 10 L28 3 M16 10 L28 17"
            stroke="url(#swipeGrad)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M184 10 L172 3 M184 10 L172 17"
            stroke="url(#swipeGrad)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        <span>SWIPE</span>
      </div>
    </div>
  )
}
