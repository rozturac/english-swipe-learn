import type { ProgressEntry, ProgressMap, VocabItem } from '../types'

const STORAGE_KEY = 'esl-progress-v1'
const MISSED_KEY = 'esl-missed-ens'

/** Main session length. */
export const SESSION_SIZE = 8
/** Timed / challenge runs use the same length as a normal session. */
export const CHALLENGE_SIZE = SESSION_SIZE
/** Cap for "Yanlışları tekrarla" mini-runs. */
export const RETRY_SIZE = SESSION_SIZE
/** @deprecated Prefer SESSION_SIZE — kept for existing imports. */
export const SESSION_LEN = SESSION_SIZE

/** Soft fill targets (room lock). */
const TARGET_DUE_WRONG = 3
const TARGET_NEW = 3
const TARGET_KNOWN = 2
/** Cap due-wrong when new/learning remain so fresh items still appear. */
const DUE_WRONG_CAP_WITH_FRESH = 6

/**
 * Due ladder base hours for streak 1..5+ (4h → 1d → 3d → 7d → 14d).
 * Scaled by (ease / 2.2). Review/due only applies when streak ≥ 2.
 */
export const DUE_BASE_HOURS = [4, 24, 72, 168, 336] as const

/** Open decks (exact `t` values in vocab.json). Genel stays open but experimental. */
export const OPEN_DECKS = [
  'Günlük konuşma',
  'İş İngilizcesi',
  'Genel',
] as const

export type OpenDeck = (typeof OPEN_DECKS)[number]

/** First-session / default picker path — Translator-signed decks only. */
export const PRIMARY_DECKS: readonly OpenDeck[] = [
  'Günlük konuşma',
  'İş İngilizcesi',
]

/** Power-user secondary chip — not on the default path until signed. */
export const EXPERIMENTAL_DECKS: readonly OpenDeck[] = ['Genel']

export const DECK_KEY = 'esl-deck'
export const DEFAULT_DECK: OpenDeck = 'Günlük konuşma'

export const DECK_SHORT: Record<OpenDeck, string> = {
  'İş İngilizcesi': 'İş İngilizcesi',
  'Günlük konuşma': 'Günlük konuşma',
  'Genel': 'Genel · Deneysel',
}

export function isExperimentalDeck(d: OpenDeck): boolean {
  return (EXPERIMENTAL_DECKS as readonly string[]).includes(d)
}

/** Map legacy deck ids / old long `t` strings → nearest new deck. */
const LEGACY_DECK: Record<string, OpenDeck> = {
  'Tanışma ve sohbet': 'Günlük konuşma',
  'Slack / ekip yazışması': 'İş İngilizcesi',
  '1o1 ve yeni rol': 'İş İngilizcesi',
  'EM ↔ Sr EM': 'İş İngilizcesi',
  'Perf & promo dili': 'İş İngilizcesi',
  'Değerlendirme dili': 'İş İngilizcesi',
  'Günlük iş dili': 'İş İngilizcesi',
  'Uber teknik dili': 'İş İngilizcesi',
  'Kalıp ve kısaltma': 'İş İngilizcesi',
  'Defter (genel kelime)': 'Genel',
  'Okuma metinleri': 'Genel',
  'Genel (düşük öncelik)': 'Genel',
  Tanışma: 'Günlük konuşma',
  Slack: 'İş İngilizcesi',
  '1o1': 'İş İngilizcesi',
}

export function isOpenDeck(t: string): t is OpenDeck {
  return (OPEN_DECKS as readonly string[]).includes(t)
}

/** True when the user has deliberately saved a deck (esl-deck present). */
export function hasDeckPref(): boolean {
  try {
    return localStorage.getItem(DECK_KEY) != null
  } catch {
    return false
  }
}

export function loadDeckPref(): OpenDeck {
  try {
    const v = localStorage.getItem(DECK_KEY) ?? DEFAULT_DECK
    if (isOpenDeck(v)) return v
    const migrated = LEGACY_DECK[v]
    if (migrated) {
      try {
        localStorage.setItem(DECK_KEY, migrated)
      } catch {
        /* ignore */
      }
      return migrated
    }
    return DEFAULT_DECK
  } catch {
    return DEFAULT_DECK
  }
}

export function saveDeckPref(deck: OpenDeck): void {
  try {
    localStorage.setItem(DECK_KEY, deck)
  } catch {
    /* ignore */
  }
}

/** Locally remembered wrong `en`s (no backend). */
export function loadMissedEns(): string[] {
  try {
    const raw = localStorage.getItem(MISSED_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function rememberMissedEn(en: string): void {
  try {
    const cur = loadMissedEns()
    if (cur.includes(en)) return
    const next = [en, ...cur].slice(0, 64)
    localStorage.setItem(MISSED_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function forgetMissedEn(en: string): void {
  try {
    const next = loadMissedEns().filter((x) => x !== en)
    localStorage.setItem(MISSED_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ProgressMap
  } catch {
    return {}
  }
}

export function saveProgress(map: ProgressMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function resetProgress(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Interval hours for due ladder: BASE[streak clamped 1..5] * (ease / 2.2). */
export function intervalHours(streak: number, ease: number): number {
  const idx = Math.min(Math.max(streak, 1), 5) - 1
  return DUE_BASE_HOURS[idx]! * (ease / 2.2)
}

/** True when streak ≥ 2 and age since lastSeen meets the scaled ladder. */
export function isDue(
  p: ProgressEntry,
  now: number = Date.now(),
): boolean {
  if (p.streak < 2) return false
  const hours = (now - p.lastSeen) / 3_600_000
  return hours >= intervalHours(p.streak, p.ease)
}

export type SessionBucket =
  | 'new'
  | 'wrong'
  | 'learning'
  | 'review'
  | 'known'

/** UI-facing mix lane from LD-v1 room targets (3 due-wrong / 3 new / 2 known). */
export type MixTag = 'new' | 'dueWrong' | 'known'

/** Session queue card: vocab + mix tag set at pick time (not re-guessed in UI). */
export type SessionQueued = VocabItem & { mix: MixTag }

export function classifyBucket(
  item: VocabItem,
  progress: ProgressMap,
  missed: ReadonlySet<string>,
  now: number = Date.now(),
): SessionBucket {
  const p = progress[item.en]
  if (!p) return 'new'
  // Missed list OR unstable (streak < 2 with wrongs) → wrong bucket (preferMissed merges here).
  if (missed.has(item.en) || (p.streak < 2 && p.wrongs > 0)) return 'wrong'
  if (p.streak < 2) return 'learning'
  if (isDue(p, now)) return 'review'
  return 'known'
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function hoursOverdue(p: ProgressEntry, now: number): number {
  return (now - p.lastSeen) / 3_600_000 - intervalHours(p.streak, p.ease)
}

export type PickSessionOpts = {
  /** Restrict pool to a single theme (`item.t`). */
  theme?: string
  /**
   * When true (default path), missed ens merge into the wrong bucket.
   * Kept for API compat; wrong bucket also includes streak<2 + wrongs>0.
   */
  preferMissed?: boolean
  /** Injectable clock for tests. */
  now?: number
  /** Injectable missed list for tests (skips localStorage). */
  missedEns?: string[]
}

/** Build a SESSION_SIZE session via LD-v1 buckets; unique by en (+ exTr). */
export function pickSession(
  vocab: VocabItem[],
  progress: ProgressMap,
  opts: PickSessionOpts = {},
): SessionQueued[] {
  const pool = opts.theme ? vocab.filter((x) => x.t === opts.theme) : vocab
  const now = opts.now ?? Date.now()
  const missedList =
    opts.missedEns ??
    (opts.preferMissed === false ? [] : loadMissedEns())
  const missed = new Set(missedList)

  const buckets: Record<SessionBucket, VocabItem[]> = {
    new: [],
    wrong: [],
    learning: [],
    review: [],
    known: [],
  }

  for (const item of pool) {
    buckets[classifyBucket(item, progress, missed, now)].push(item)
  }

  // Cold deck: no progress entries in this pool → 8 unique new.
  const cold =
    pool.length > 0 && pool.every((item) => progress[item.en] === undefined)
  if (cold) {
    const news = [...buckets.new].sort((a, b) => a.d - b.d)
    shuffleInPlace(news)
    return takeUnique(news, SESSION_SIZE).map((item) => ({ ...item, mix: 'new' as const }))
  }

  // Sort / soft-shuffle within buckets.
  shuffleInPlace(buckets.wrong)
  buckets.new.sort((a, b) => a.d - b.d)
  shuffleInPlace(buckets.new)
  buckets.learning.sort((a, b) => a.d - b.d)
  shuffleInPlace(buckets.learning)
  buckets.review.sort((a, b) => {
    const pa = progress[a.en]!
    const pb = progress[b.en]!
    return hoursOverdue(pb, now) - hoursOverdue(pa, now)
  })
  // Known: rare filler — highest ease, then oldest lastSeen; soft shuffle.
  const knownOrdered = [...buckets.known].sort((a, b) => {
    const pa = progress[a.en]!
    const pb = progress[b.en]!
    if (pb.ease !== pa.ease) return pb.ease - pa.ease
    return pa.lastSeen - pb.lastSeen
  })
  shuffleInPlace(knownOrdered)

  const hasFresh = buckets.new.length + buckets.learning.length > 0
  const dueWrongCap = hasFresh ? DUE_WRONG_CAP_WITH_FRESH : SESSION_SIZE

  const picked: SessionQueued[] = []
  const usedEn = new Set<string>()
  const usedTr = new Set<string>()

  const tryTake = (item: VocabItem, mix: MixTag): boolean => {
    if (picked.length >= SESSION_SIZE) return false
    if (usedEn.has(item.en) || usedTr.has(item.exTr)) return false
    usedEn.add(item.en)
    usedTr.add(item.exTr)
    picked.push({ ...item, mix })
    return true
  }

  const takeFrom = (list: VocabItem[], n: number, mix: MixTag): number => {
    let took = 0
    for (const item of list) {
      if (took >= n) break
      if (tryTake(item, mix)) took++
    }
    return took
  }

  // due-wrong = wrong ∪ review (wrong first, then most-overdue review).
  const dueWrongTarget = Math.min(TARGET_DUE_WRONG, dueWrongCap)
  const wrongCount = takeFrom(buckets.wrong, dueWrongTarget, 'dueWrong')
  const reviewCount = takeFrom(
    buckets.review,
    Math.max(0, dueWrongTarget - wrongCount),
    'dueWrong',
  )

  // new (then learning if short)
  const newCount = takeFrom(buckets.new, TARGET_NEW, 'new')
  if (newCount < TARGET_NEW) {
    takeFrom(buckets.learning, TARGET_NEW - newCount, 'new')
  }

  // known
  takeFrom(knownOrdered, TARGET_KNOWN, 'known')

  // Backfill: learning → known → new → review → wrong (tag by fill lane).
  if (picked.length < SESSION_SIZE) takeFrom(buckets.learning, SESSION_SIZE - picked.length, 'new')
  if (picked.length < SESSION_SIZE) takeFrom(knownOrdered, SESSION_SIZE - picked.length, 'known')
  if (picked.length < SESSION_SIZE) takeFrom(buckets.new, SESSION_SIZE - picked.length, 'new')
  if (picked.length < SESSION_SIZE) {
    const extraReview = Math.min(
      dueWrongCap - (wrongCount + reviewCount),
      SESSION_SIZE - picked.length,
    )
    if (extraReview > 0) takeFrom(buckets.review, extraReview, 'dueWrong')
  }
  if (picked.length < SESSION_SIZE) takeFrom(buckets.wrong, SESSION_SIZE - picked.length, 'dueWrong')

  // Tag items by bucket for interleave (from original classification).
  const bucketOf = new Map<string, SessionBucket>()
  for (const b of Object.keys(buckets) as SessionBucket[]) {
    for (const item of buckets[b]) bucketOf.set(item.en, b)
  }

  // Round-robin: wrong → new → review → learning → known (no wrong clump).
  const lanes: SessionBucket[] = ['wrong', 'new', 'review', 'learning', 'known']
  const queues: Record<SessionBucket, SessionQueued[]> = {
    new: [],
    wrong: [],
    learning: [],
    review: [],
    known: [],
  }
  for (const item of picked) {
    queues[bucketOf.get(item.en) ?? 'new'].push(item)
  }

  const ordered: SessionQueued[] = []
  while (ordered.length < picked.length) {
    let progressed = false
    for (const lane of lanes) {
      const next = queues[lane].shift()
      if (next) {
        ordered.push(next)
        progressed = true
      }
    }
    if (!progressed) break
  }

  return ordered.slice(0, SESSION_SIZE)
}

function takeUnique(items: VocabItem[], n: number): VocabItem[] {
  const usedEn = new Set<string>()
  const usedTr = new Set<string>()
  const out: VocabItem[] = []
  for (const item of items) {
    if (out.length >= n) break
    if (usedEn.has(item.en) || usedTr.has(item.exTr)) continue
    usedEn.add(item.en)
    usedTr.add(item.exTr)
    out.push(item)
  }
  return out
}

/** Count mix tags from a picked session (for start chips). */
export function countMix(session: ReadonlyArray<{ mix: MixTag }>): {
  due: number
  yeni: number
  known: number
} {
  let due = 0
  let yeni = 0
  let known = 0
  for (const x of session) {
    if (x.mix === 'dueWrong') due++
    else if (x.mix === 'new') yeni++
    else known++
  }
  return { due, yeni, known }
}

export function recordAnswer(
  progress: ProgressMap,
  en: string,
  correct: boolean,
): ProgressMap {
  const prev = progress[en] ?? { streak: 0, wrongs: 0, lastSeen: 0, ease: 2.2 }
  const next: ProgressEntry = {
    streak: correct ? prev.streak + 1 : 0,
    wrongs: correct ? prev.wrongs : prev.wrongs + 1,
    lastSeen: Date.now(),
    ease: correct
      ? Math.min(3.2, prev.ease + 0.12)
      : Math.max(1.1, prev.ease - 0.35),
  }
  if (correct) forgetMissedEn(en)
  else rememberMissedEn(en)
  const map = { ...progress, [en]: next }
  saveProgress(map)
  return map
}

/** Re-queue wrongs soon: insert back into remaining queue near the front. */
export function requeueWrong(
  remaining: VocabItem[],
  item: VocabItem,
): VocabItem[] {
  const without = remaining.filter((x) => x.en !== item.en)
  const pos = Math.min(1 + Math.floor(Math.random() * 2), without.length)
  const copy = [...without]
  copy.splice(pos, 0, item)
  return copy
}
