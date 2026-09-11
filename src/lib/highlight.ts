/** Split English sentence so only the target phrase `en` gets a light highlight. */
export function splitHighlight(
  ex: string,
  en: string,
): { before: string; match: string; after: string } | null {
  if (!ex || !en) return null
  const lower = ex.toLowerCase()
  const needle = en.toLowerCase()
  let idx = lower.indexOf(needle)
  if (idx === -1) {
    const soft = needle.replace(/[?.!,;:]+$/g, '').trim()
    idx = lower.indexOf(soft)
    if (idx === -1) return null
    return {
      before: ex.slice(0, idx),
      match: ex.slice(idx, idx + soft.length),
      after: ex.slice(idx + soft.length),
    }
  }
  return {
    before: ex.slice(0, idx),
    match: ex.slice(idx, idx + en.length),
    after: ex.slice(idx + en.length),
  }
}
