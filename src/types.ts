export type VocabItem = {
  d: number
  t: string
  en: string
  tr: string
  ex: string
  exTr: string
  morph?: string | string[] | Record<string, unknown>
  /** Optional one-line pedagogy for teach beat — never invent if missing. */
  why?: string
}

export type ProgressEntry = {
  streak: number
  wrongs: number
  lastSeen: number
  ease: number
}

export type ProgressMap = Record<string, ProgressEntry>

export type SessionItem = {
  item: VocabItem
  options: string[] // length 3, one correct
  correctIndex: number
}

export type FlashKind = 'none' | 'correct' | 'wrong'
