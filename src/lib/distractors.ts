import type { VocabItem } from '../types'

function lenClose(a: string, b: string): number {
  return Math.abs(a.length - b.length)
}

function similar(a: string, b: string): boolean {
  if (a === b) return true
  const na = a.toLowerCase().replace(/\s+/g, ' ').trim()
  const nb = b.toLowerCase().replace(/\s+/g, ' ').trim()
  if (na === nb) return true
  const n = Math.min(na.length, nb.length, 24)
  let shared = 0
  for (let i = 0; i < n; i++) {
    if (na[i] === nb[i]) shared++
    else break
  }
  return shared >= 18
}

/**
 * Pick 2 high-quality distractors: same theme preferred, similar exTr length,
 * not identical, shuffled into 3 options with correct.
 */
export function buildOptions(
  item: VocabItem,
  pool: VocabItem[],
): { options: string[]; correctIndex: number } {
  const correct = item.exTr
  const sameTheme = pool.filter(
    (x) => x.en !== item.en && x.t === item.t && x.exTr !== correct,
  )
  const other = pool.filter(
    (x) => x.en !== item.en && x.t !== item.t && x.exTr !== correct,
  )

  const rank = (cands: VocabItem[]) =>
    [...cands].sort((a, b) => {
      const la = lenClose(a.exTr, correct)
      const lb = lenClose(b.exTr, correct)
      if (la !== lb) return la - lb
      return Math.abs(a.d - item.d) - Math.abs(b.d - item.d)
    })

  const picked: string[] = []
  const used = new Set<string>([correct])

  for (const src of [rank(sameTheme), rank(other)]) {
    for (const c of src) {
      if (picked.length >= 2) break
      if (used.has(c.exTr)) continue
      if ([...used].some((u) => similar(u, c.exTr))) continue
      picked.push(c.exTr)
      used.add(c.exTr)
    }
    if (picked.length >= 2) break
  }

  if (picked.length < 2) {
    for (const c of pool) {
      if (picked.length >= 2) break
      if (used.has(c.exTr)) continue
      picked.push(c.exTr)
      used.add(c.exTr)
    }
  }

  while (picked.length < 2) {
    picked.push(correct + ' ·')
  }

  const options = [correct, picked[0], picked[1]]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return { options, correctIndex: options.indexOf(correct) }
}
