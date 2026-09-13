import type { VocabItem } from '../types'

/** Conversational / learning register — used to keep distractors coherent. */
export type Register =
  | 'turn-permission'
  | 'farewell'
  | 'greeting'
  | 'smalltalk'
  | 'clarification'
  | 'intro-bio'
  | 'offer-help'
  | 'idiom'
  | 'jargon'
  | 'general'

/** Idioms must never mix with functional small-talk / floor-management phrases. */
const IDIOM_MARK =
  /\b(small world|that'?s a coincidence|break the ice|we have that in common|I can relate|small talk|bear with my English|dünya küçük|buzları erit|ne tesadüf|ortak yan|hoşbeş)\b/i

const REGISTER_RULES: { tag: Register; re: RegExp }[] = [
  {
    tag: 'idiom',
    re: IDIOM_MARK,
  },
  {
    tag: 'jargon',
    re: /\b(air cover|bar raiser|bench strength|align upward|backchannel|absorb the noise|commit vs stretch|reorg|escalation|promo|perf |OKR|KPI|headcount|bandwidth|synerg|leverage|unblock|ship it|tech debt|on-?call|pager|SLA|runbook|Uber teknik|üstten koruma)\b/i,
  },
  {
    tag: 'turn-permission',
    re: /\b(go ahead|go on|over to you|whenever you'?re ready|buyur|söz sende|pardon,? devam|devam ed)\b/i,
  },
  {
    tag: 'farewell',
    re: /\b(catch you later|have a good one|talk soon|I'?ll let you go|it was great chatting|let'?s do this again|yakında görüş|sonra görüş|iyi günler|iyi eğlence|tutmayayım)\b/i,
  },
  {
    tag: 'greeting',
    re: /\b(nice to (finally )?meet|great to put a face|I'?ve heard a lot|likewise|same here|tanışmak|yüz yüze|ismi yüzle|isme bir yüz)\b/i,
  },
  {
    tag: 'clarification',
    re: /\b(repeat|say that again|didn'?t catch|cut out|breaking up|hear me|talked over|tekrarlay|ses kesildi|duyabiliyor|anlamadım)\b/i,
  },
  {
    tag: 'smalltalk',
    re: /\b(weekend|weather|how'?s your week|any plans|time off|PTO|settling in|how have you been|hafta sonu|hava nasıl|izin)\b/i,
  },
  {
    tag: 'intro-bio',
    re: /\b(a bit about me|background|based in|come from|most recently|looking forward|keen to|I'?m into|outside of work|journey here|kendimden|arka plan|yaşıyorum)\b/i,
  },
  {
    tag: 'offer-help',
    re: /\b(shout if you need|feel free to ping|feel free|my door|who else should|what should I be reading|consider it handled|ping me|yardım|ihtiyacınız)\b/i,
  },
]

/** Dialogue families that must stay in-family when enough peers exist. */
export const DIALOGUE_FAMILIES = new Set<Register>([
  'turn-permission',
  'farewell',
  'greeting',
  'smalltalk',
  'clarification',
  'intro-bio',
  'offer-help',
  'idiom',
])

const RELATED_FAMILY: Record<Register, Register[]> = {
  'turn-permission': ['offer-help', 'clarification'],
  'offer-help': ['turn-permission'],
  farewell: ['greeting'],
  greeting: ['farewell', 'intro-bio'],
  clarification: ['turn-permission'],
  smalltalk: ['greeting'],
  'intro-bio': ['greeting', 'smalltalk'],
  idiom: [],
  jargon: [],
  general: [],
}

/** Junk / MT debris that must never appear as a live distractor. */
const JUNK_EXTR = [
  /ortak olarak var/i,
  /hayal edebilir miyim/i,
  /yaşayacağız/i,
  /hız vermesini/i,
  /traksiyon/i,
  /\bIntros I often\b/i,
  /^[a-zçğıöşü]/, // lowercase sentence start
  /plakamdan/i,
  /sunumyi/i,
  /denemein /i,
]

function phraseOf(item: VocabItem): string {
  return `${item.en} ${item.tr}`
}

function haystack(item: VocabItem): string {
  return `${item.en} ${item.tr} ${item.ex} ${item.exTr}`
}

export function isIdiomItem(item: VocabItem): boolean {
  return (
    IDIOM_MARK.test(item.en) ||
    IDIOM_MARK.test(item.tr) ||
    IDIOM_MARK.test(item.exTr) ||
    detectRegister(item) === 'idiom'
  )
}

export function detectRegister(item: VocabItem): Register {
  const phrase = phraseOf(item)
  for (const rule of REGISTER_RULES) {
    if (rule.re.test(phrase) || rule.re.test(item.en)) return rule.tag
  }
  // Example sentences can mention unrelated jargon — don't let that leak.
  const h = haystack(item)
  for (const rule of REGISTER_RULES) {
    if (rule.tag === 'jargon') continue
    if (rule.re.test(h)) return rule.tag
  }
  if (item.t === 'Günlük konuşma' && item.en.split(/\s+/).length <= 4) {
    return 'general'
  }
  return 'general'
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-zçğıöşü0-9\s']/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  )
}

function overlapScore(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const w of ta) if (tb.has(w)) shared++
  return shared / Math.min(ta.size, tb.size)
}

function similarText(a: string, b: string): boolean {
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

function lenClose(a: string, b: string): number {
  return Math.abs(a.length - b.length)
}

function relatedTo(regT: Register, regC: Register): boolean {
  if (regT === regC) return true
  return RELATED_FAMILY[regT]?.includes(regC) ?? false
}

/** Readable Turkish distractor text (sentence case + end punct, no junk). */
export function isReadableExTr(text: string): boolean {
  const s = text.trim()
  if (s.length < 8) return false
  if (!/^[A-ZÇĞİÖŞÜÂÊÎÔÛ]/.test(s)) return false
  if (!/[.!?…]$/.test(s)) return false
  for (const re of JUNK_EXTR) {
    if (re.test(s)) return false
  }
  // Ban obvious English leftovers used as "translation"
  if (/\b(I'll|I could|What's|Intros)\b/.test(s)) return false
  return true
}

/**
 * Higher = better distractor. Prefers same register, similar length,
 * overlapping vocabulary; heavily penalizes jargon / idiom mix.
 * Same-theme is a hard gate upstream — scoring assumes same `t`.
 */
export function distractorScore(target: VocabItem, cand: VocabItem): number {
  const regT = detectRegister(target)
  const regC = detectRegister(cand)
  let score = 0

  if (cand.t === target.t) score += 120
  else score -= 500 // should be filtered already

  if (regT === regC) score += 140
  else if (relatedTo(regT, regC)) score += 40
  else if (regT !== 'jargon' && regC === 'jargon') score -= 160
  else if (regT === 'jargon' && regC !== 'jargon') score -= 50
  else if (regT !== 'idiom' && regC === 'idiom') score -= 200
  else if (regT === 'idiom' && regC !== 'idiom') score -= 160
  else score -= 35

  const ld = lenClose(cand.exTr, target.exTr)
  score += Math.max(0, 40 - ld)

  score += Math.max(0, 12 - Math.abs(cand.d - target.d) * 3)

  const ov =
    overlapScore(target.en, cand.en) * 0.55 +
    overlapScore(`${target.tr} ${target.ex}`, `${cand.tr} ${cand.ex}`) * 0.25 +
    overlapScore(target.exTr, cand.exTr) * 0.2
  score += ov * 60

  if (isReadableExTr(cand.exTr)) score += 30
  else score -= 80

  return score
}

function hardReject(
  cand: VocabItem,
  opts: {
    idiomOk: boolean
    jargonOk: boolean
    familyOnly: boolean
    regT: Register
  },
): boolean {
  const regC = detectRegister(cand)
  if (!opts.idiomOk && (regC === 'idiom' || isIdiomItem(cand))) return true
  if (opts.regT === 'idiom' && regC !== 'idiom' && !isIdiomItem(cand)) return true
  if (!opts.jargonOk && regC === 'jargon') return true
  if (opts.familyOnly && !relatedTo(opts.regT, regC) && regC !== opts.regT) {
    return true
  }
  return false
}

/**
 * Pick the two best distractor items (deterministic order by score).
 * Hard rules:
 *  - Distractors MUST share the same theme (`t`) — no other deck/notebook.
 *  - Idioms never mix with functional dialogue.
 *  - Prefer readable Turkish (sentence case + end punctuation).
 *  - Jargon never leaks onto non-jargon conversational targets.
 */
export function pickDistractorItems(
  item: VocabItem,
  pool: VocabItem[],
  /** Session-wide texts already used as correct or distractor. */
  usedTexts: ReadonlySet<string> = new Set(),
): VocabItem[] {
  const correct = item.exTr
  const regT = detectRegister(item)
  const blocked = new Set<string>([...usedTexts, correct])
  const isBlocked = (tr: string) =>
    blocked.has(tr) || [...blocked].some((u) => similarText(u, tr))

  // HARD: same theme only — never borrow from other decks / notebook.
  const sameTheme = pool.filter(
    (x) => x.t === item.t && x.en !== item.en && !isBlocked(x.exTr),
  )

  const sameReg = sameTheme.filter((x) => detectRegister(x) === regT)
  const relatedFamily = sameTheme.filter((x) =>
    relatedTo(regT, detectRegister(x)),
  )

  const isDialogue = DIALOGUE_FAMILIES.has(regT)
  const idiomTarget = regT === 'idiom' || isIdiomItem(item)
  const familyPool =
    sameReg.length >= 2 ? sameReg : [...sameReg, ...relatedFamily]
  const familyOnly =
    isDialogue &&
    familyPool.filter((x, i, a) => a.findIndex((y) => y.en === x.en) === i)
      .length >= 2

  const jargonOk = regT === 'jargon'
  const idiomOk = idiomTarget

  const filter = (cands: VocabItem[]) =>
    cands.filter(
      (c) => !hardReject(c, { idiomOk, jargonOk, familyOnly, regT }),
    )

  const readable = (cands: VocabItem[]) => cands.filter((c) => isReadableExTr(c.exTr))

  const tiers: VocabItem[][] = [
    readable(filter(sameReg)),
    filter(sameReg), // prefer same register even if punctuation is imperfect
    readable(filter(relatedFamily)),
    readable(filter(sameTheme)),
    filter(relatedFamily),
    filter(sameTheme),
    sameTheme,
  ]

  const picked: VocabItem[] = []
  const usedTr = new Set<string>(blocked)

  const takeFrom = (cands: VocabItem[]) => {
    const ranked = [...cands].sort(
      (a, b) => distractorScore(item, b) - distractorScore(item, a),
    )
    for (const c of ranked) {
      if (picked.length >= 2) break
      if (usedTr.has(c.exTr)) continue
      if ([...usedTr].some((u) => similarText(u, c.exTr))) continue
      if (!idiomOk && isIdiomItem(c)) continue
      if (!jargonOk && detectRegister(c) === 'jargon') continue
      picked.push(c)
      usedTr.add(c.exTr)
    }
  }

  for (const tier of tiers) {
    if (picked.length >= 2) break
    takeFrom(tier)
  }

  // Synthetic last resort stays same theme metadata (never cross-deck).
  while (picked.length < 2) {
    picked.push({
      ...item,
      en: `${item.en}·${picked.length}`,
      exTr: `${correct} ·`,
    })
  }

  return picked.slice(0, 2)
}

/**
 * Pick 2 high-quality distractors + shuffle into 3 options with correct.
 */
export function buildOptions(
  item: VocabItem,
  pool: VocabItem[],
  usedTexts: ReadonlySet<string> = new Set(),
): { options: string[]; correctIndex: number } {
  const correct = item.exTr
  const distractors = pickDistractorItems(item, pool, usedTexts).map((x) => x.exTr)
  const options = [correct, distractors[0], distractors[1]]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return { options, correctIndex: options.indexOf(correct) }
}
