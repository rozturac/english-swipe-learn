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

/** Open decks for the picker (exact `t` values in vocab.json). */
export const OPEN_DECKS = [
  'İş İngilizcesi',
  'Günlük konuşma',
  'Genel',
] as const

export type OpenDeck = (typeof OPEN_DECKS)[number]

export const DECK_KEY = 'esl-deck'
export const DEFAULT_DECK: OpenDeck = 'Günlük konuşma'

export const DECK_SHORT: Record<OpenDeck, string> = {
  'İş İngilizcesi': 'İş İngilizcesi',
  'Günlük konuşma': 'Günlük konuşma',
  'Genel': 'Genel',
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

function score(item: VocabItem, p: ProgressEntry | undefined, now: number): number {
  if (!p) return 1000 + (5 - Math.min(item.d, 5)) * 10
  const hours = (now - p.lastSeen) / 3_600_000
  const wrongBoost = p.wrongs * 40
  const streakPenalty = p.streak * 25
  const due = (hours * (1 + p.wrongs * 0.5)) / Math.max(0.4, p.ease)
  return wrongBoost - streakPenalty + due + (item.d <= 2 ? 15 : 0)
}

export type PickSessionOpts = {
  /** Restrict pool to a single theme (`item.t`). */
  theme?: string
  /**
   * When local missed `en`s exist for this deck, weight ~25–40% of the
   * next same-deck session from them. Else skip.
   */
  preferMissed?: boolean
}

/** Build a ~SESSION_SIZE item session: weakest / due first, unique by en (+ exTr). */
export function pickSession(
  vocab: VocabItem[],
  progress: ProgressMap,
  opts: PickSessionOpts = {},
): VocabItem[] {
  const pool = opts.theme ? vocab.filter((x) => x.t === opts.theme) : vocab
  const now = Date.now()
  const ranked = [...pool]
    .map((item) => ({ item, s: score(item, progress[item.en], now) }))
    .sort((a, b) => b.s - a.s)

  const usedEn = new Set<string>()
  const usedTr = new Set<string>()
  const chosen: VocabItem[] = []
  const tryAdd = (item: VocabItem) => {
    if (chosen.length >= SESSION_SIZE) return
    if (usedEn.has(item.en)) return
    if (usedTr.has(item.exTr)) return
    usedEn.add(item.en)
    usedTr.add(item.exTr)
    chosen.push(item)
  }

  // P1: weight 25–40% of session from locally stored wrongs in this deck.
  if (opts.preferMissed && opts.theme) {
    const missed = loadMissedEns()
    if (missed.length > 0) {
      const frac = 0.25 + Math.random() * 0.15 // 25–40%
      const slot = Math.max(1, Math.min(SESSION_SIZE - 1, Math.round(SESSION_SIZE * frac)))
      const byEn = new Map(pool.map((x) => [x.en, x]))
      const missedItems = missed
        .map((en) => byEn.get(en))
        .filter((x): x is VocabItem => !!x)
      for (let i = missedItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[missedItems[i], missedItems[j]] = [missedItems[j], missedItems[i]]
      }
      for (const m of missedItems) {
        if (chosen.length >= slot) break
        tryAdd(m)
      }
    }
  }

  const take = ranked.slice(0, Math.min(SESSION_SIZE * 4, ranked.length))
  const weak = take.slice(0, SESSION_SIZE)
  const rest = take.slice(SESSION_SIZE)
  for (let i = weak.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[weak[i], weak[j]] = [weak[j], weak[i]]
  }

  for (const x of weak) tryAdd(x.item)
  for (const r of rest) tryAdd(r.item)
  if (chosen.length < SESSION_SIZE) {
    for (const r of ranked) tryAdd(r.item)
  }

  const mid = Math.ceil(chosen.length / 2)
  const head = chosen.slice(0, mid)
  const tail = chosen.slice(mid)
  for (let i = head.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[head[i], head[j]] = [head[j], head[i]]
  }
  for (let i = tail.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[tail[i], tail[j]] = [tail[j], tail[i]]
  }
  return [...head, ...tail].slice(0, SESSION_SIZE)
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
