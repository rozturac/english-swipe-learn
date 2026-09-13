import type { ProgressEntry, ProgressMap, VocabItem } from '../types'

const STORAGE_KEY = 'esl-progress-v1'

/** Main session length. */
export const SESSION_SIZE = 8
/** Timed / challenge runs use the same length as a normal session. */
export const CHALLENGE_SIZE = SESSION_SIZE
/** Cap for "Yanlışları tekrarla" mini-runs. */
export const RETRY_SIZE = SESSION_SIZE
/** @deprecated Prefer SESSION_SIZE — kept for existing imports. */
export const SESSION_LEN = SESSION_SIZE

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

/** Build a ~SESSION_SIZE item session: weakest / due first, unique by en (+ exTr). */
export function pickSession(vocab: VocabItem[], progress: ProgressMap): VocabItem[] {
  const now = Date.now()
  const ranked = [...vocab]
    .map((item) => ({ item, s: score(item, progress[item.en], now) }))
    .sort((a, b) => b.s - a.s)

  const take = ranked.slice(0, Math.min(SESSION_SIZE * 4, ranked.length))
  const weak = take.slice(0, SESSION_SIZE)
  const rest = take.slice(SESSION_SIZE)
  for (let i = weak.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[weak[i], weak[j]] = [weak[j], weak[i]]
  }

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
  for (const x of weak) tryAdd(x.item)
  for (const r of rest) tryAdd(r.item)
  // Last resort: fill from remaining ranked if still short
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
