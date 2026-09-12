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

const CARD_RATIO = 0.88
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
        <svg
          className="swipe-hint-arrow"
          viewBox="0 0 240 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          overflow="visible"
        >
          <defs>
            <linearGradient
              id="swipeHintGlow"
              x1="8"
              y1="16"
              x2="232"
              y2="16"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FF7AD9" />
              <stop offset="42%" stopColor="#F0E6FF" />
              <stop offset="100%" stopColor="#5EC8FF" />
            </linearGradient>
            <filter
              id="swipeHintSoft"
              x="-25%"
              y="-160%"
              width="150%"
              height="420%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="4.2" />
            </filter>
            <filter
              id="swipeHintMid"
              x="-18%"
              y="-120%"
              width="136%"
              height="340%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.1" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Outer soft neon halo — magenta → cyan */}
          <path
            d="M24 7 L10 16 L24 25 M10 16 H230 M216 7 L230 16 L216 25"
            stroke="url(#swipeHintGlow)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.55"
            filter="url(#swipeHintSoft)"
          />
          {/* Mid glow tube */}
          <path
            d="M24 7 L10 16 L24 25 M10 16 H230 M216 7 L230 16 L216 25"
            stroke="url(#swipeHintGlow)"
            strokeWidth="2.15"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
            filter="url(#swipeHintMid)"
          />
          {/* Bright near-white core */}
          <path
            d="M24 7 L10 16 L24 25 M10 16 H230 M216 7 L230 16 L216 25"
            stroke="#F8FBFF"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="swipe-hint-label">SWIPE</span>
      </div>
    </div>
  )
}
