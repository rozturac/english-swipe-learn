import { type CSSProperties, type ReactNode } from 'react'
import { boldPhrase } from '../lib/highlight'

type Props = {
  ex: string
  en: string
  category?: string
  /** Word-by-word opacity stagger — only for mix==='new'. */
  staggerReveal?: boolean
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Stagger delay so last word finishes by ~450ms (80–120ms/word band). */
function staggerStepMs(wordCount: number): number {
  if (wordCount <= 1) return 0
  const fadeMs = 90
  const budget = Math.max(0, 450 - fadeMs)
  const raw = Math.floor(budget / (wordCount - 1))
  return Math.min(120, Math.max(80, raw))
}

type WordBit = {
  text: string
  start: number
  key: string
}

function wordsOf(ex: string): WordBit[] {
  const out: WordBit[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(ex))) {
    out.push({ text: m[0], start: m.index, key: `w${i++}` })
  }
  return out
}

/** Render one word with optional highlight span overlap from `en` in `ex`. */
function renderWord(
  word: WordBit,
  hit: { index: number; length: number } | null,
  stagger: boolean,
  stepMs: number,
  index: number,
) {
  const end = word.start + word.text.length
  const style = stagger
    ? ({ ['--en-i' as string]: index, ['--en-step' as string]: `${stepMs}ms` } as CSSProperties)
    : undefined
  const cls = stagger ? 'en-word is-stagger' : 'en-word'

  if (!hit) {
    return (
      <span key={word.key} className={cls} style={style}>
        {word.text}
      </span>
    )
  }

  const h0 = hit.index
  const h1 = hit.index + hit.length
  if (end <= h0 || word.start >= h1) {
    return (
      <span key={word.key} className={cls} style={style}>
        {word.text}
      </span>
    )
  }

  const local0 = Math.max(0, h0 - word.start)
  const local1 = Math.min(word.text.length, h1 - word.start)
  const before = word.text.slice(0, local0)
  const match = word.text.slice(local0, local1)
  const after = word.text.slice(local1)

  return (
    <span key={word.key} className={cls} style={style}>
      {before}
      {match ? <mark className="en-highlight">{match}</mark> : null}
      {after}
    </span>
  )
}

export function EnglishSentence({ ex, en, category, staggerReveal = false }: Props) {
  const reduced = typeof window !== 'undefined' ? prefersReducedMotion() : false
  const doStagger = staggerReveal && !reduced
  const words = wordsOf(ex)
  const hit = boldPhrase(ex, en)
  const stepMs = staggerStepMs(words.length)

  const nodes: ReactNode[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    if (i > 0) {
      const gapStart = words[i - 1]!.start + words[i - 1]!.text.length
      const gap = ex.slice(gapStart, w.start) || ' '
      nodes.push(<span key={`s${i}`}>{gap}</span>)
    }
    nodes.push(renderWord(w, hit, doStagger, stepMs, i))
  }

  return (
    <div className={`en-block${doStagger ? ' is-stagger-en' : ''}`}>
      <p className="en-sentence" lang="en">
        {words.length === 0 ? ex : nodes}
      </p>
      {category ? <div className="en-category">{category}</div> : null}
    </div>
  )
}
