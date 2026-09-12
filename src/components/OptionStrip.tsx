import { useLayoutEffect, useRef, useState } from 'react'

type Props = {
  options: string[]
  selected: number
  revealCorrect?: number | null
  dragX?: number
  dragging?: boolean
  frozen?: boolean
}

const CARD_RATIO = 0.82
const GAP_PX = 14

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
  const step = cardW + GAP_PX
  const last = Math.max(0, options.length - 1)
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
      <div className="option-dots" aria-hidden>
        {options.map((_, i) => (
          <span key={i} className={i === selected ? 'dot on' : 'dot'} />
        ))}
      </div>
    </div>
  )
}
