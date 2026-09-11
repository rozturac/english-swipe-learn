import { useLayoutEffect, useRef, useState } from 'react'

type Props = {
  options: string[]
  selected: number
  revealCorrect?: number | null
  dragX?: number
}

const CARD_RATIO = 0.78
const GAP_PX = 12

export function OptionStrip({
  options,
  selected,
  revealCorrect = null,
  dragX = 0,
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
  const nudge = Math.max(-32, Math.min(32, dragX * 0.14))
  const tx = -selected * step + nudge

  return (
    <div className="option-viewport" ref={viewportRef}>
      <div
        className="option-strip"
        style={{
          paddingLeft: sidePad,
          transform: `translate3d(${tx}px, 0, 0)`,
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
