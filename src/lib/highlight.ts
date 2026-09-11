/** Match the full target phrase `en` as one contiguous span inside `ex`. */

/** Candidate needles from `en`, longest first (case handled by caller). */
export function boldPhraseCandidates(en: string): string[] {
  const raw = en.trim()
  if (!raw) return []
  const soft = raw.replace(/[?.!,;:]+$/g, '').trim()
  // "push back (on)" / "stretch (v.)" → keep the readable phrase
  const noParen = soft.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of [raw, soft, noParen]) {
    const n = c.trim()
    if (!n) continue
    const key = n.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(n)
  }
  out.sort((a, b) => b.length - a.length)
  return out
}

/** Prefer the longest contiguous case-insensitive match of `en` in `ex`. */
export function boldPhrase(
  ex: string,
  en: string,
): { index: number; length: number; match: string } | null {
  if (!ex || !en) return null
  const lower = ex.toLowerCase()
  for (const needle of boldPhraseCandidates(en)) {
    const idx = lower.indexOf(needle.toLowerCase())
    if (idx !== -1) {
      return {
        index: idx,
        length: needle.length,
        match: ex.slice(idx, idx + needle.length),
      }
    }
  }
  return null
}

/** Split English sentence so only the target phrase `en` gets a light highlight. */
export function splitHighlight(
  ex: string,
  en: string,
): { before: string; match: string; after: string } | null {
  const hit = boldPhrase(ex, en)
  if (!hit) return null
  return {
    before: ex.slice(0, hit.index),
    match: hit.match,
    after: ex.slice(hit.index + hit.length),
  }
}
