import { useLayoutEffect, useRef, useState } from 'react'

type Props = {
  options: string[]
  selected: number
  revealCorrect?: number | null
  dragX?: number
  frozen?: boolean
}

const CARD_RATIO = 0.8
const GAP_PX = 10

export function OptionStrip({
  options,
  selected,
  revealCorrect = null,
  dragX = 0,
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
  const nudge = frozen ? 0 : Math.max(-28, Math.min(28, dragX * 0.12))
  const tx = -selected * step + nudge

  return (
    <div className={`option-viewport${frozen ? ' is-frozen' : ''}`} ref={viewportRef}>
      <div
        className="option-strip"
        style={{
          paddingLeft: sidePad,
          transform: `translate3d(${tx}px, 0, 0)`,
          transition: frozen ? 'none' : undefined,
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
