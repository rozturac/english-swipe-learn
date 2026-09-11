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
  | 'jargon'
  | 'general'

const REGISTER_RULES: { tag: Register; re: RegExp }[] = [
  {
    tag: 'jargon',
    re: /\b(air cover|bar raiser|bench strength|align upward|backchannel|absorb the noise|commit vs stretch|reorg|escalation|promo|perf |OKR|KPI|headcount|bandwidth|synerg|leverage|unblock|ship it|tech debt|on-?call|pager|SLA|runbook|Uber teknik|üstten koruma)\b/i,
  },
  {
    tag: 'turn-permission',
    re: /\b(go ahead|go on|feel free|whenever you'?re ready|my door is always open|consider it handled|ping me|shout if|buyur|devam ed)\b/i,
  },
  {
    tag: 'farewell',
    re: /\b(catch you later|have a good one|talk soon|I'?ll let you go|it was great chatting|let'?s do this again|yakında görüş|iyi eğlence|sonra arar|tutmayayım)\b/i,
  },
  {
    tag: 'greeting',
    re: /\b(nice to (finally )?meet|great to put a face|I'?ve heard a lot|likewise|same here|tanışmak|isme bir yüz|same here|benzer şekilde)\b/i,
  },
  {
    tag: 'clarification',
    re: /\b(repeat|say that again|didn'?t catch|cut out|breaking up|hear me|talked over|sorry,? go on|tekrarlay|ses kesildi|duyabiliyor|anlamadım)\b/i,
  },
  {
    tag: 'smalltalk',
    re: /\b(weekend|weather|how'?s your week|any plans|time off|PTO|settling in|how have you been|small world|coincidence|hafta sonu|hava nasıl|izin|dünya küçük)\b/i,
  },
  {
    tag: 'intro-bio',
    re: /\b(a bit about me|background|based in|come from|most recently|looking forward|keen to|I'?m into|outside of work|journey here|kendimden|arka plan|yaşıyorum)\b/i,
  },
  {
    tag: 'offer-help',
    re: /\b(shout if you need|feel free to ping|my door|who else should|what should I be reading|yardım|ihtiyacınız)\b/i,
  },
]

const THEME_GROUPS: string[][] = [
  ['Tanışma ve sohbet', 'Günlük iş dili', '1o1 ve yeni rol'],
  ['Slack / ekip yazışması', 'Günlük iş dili', 'EM ↔ Sr EM'],
  ['Perf & promo dili', 'Değerlendirme dili', 'EM ↔ Sr EM', '1o1 ve yeni rol'],
  ['Uber teknik dili', 'Kalıp ve kısaltma'],
  ['Defter (genel kelime)', 'Genel (düşük öncelik)', 'Okuma metinleri'],
]

function haystack(item: VocabItem): string {
  return `${item.en} ${item.tr} ${item.ex} ${item.exTr}`
}

export function detectRegister(item: VocabItem): Register {
  const h = haystack(item)
  for (const rule of REGISTER_RULES) {
    if (rule.re.test(h) || rule.re.test(item.en)) return rule.tag
  }
  // Short colloquial meeting phrases → treat as turn/smalltalk-ish general
  if (item.t === 'Tanışma ve sohbet' && item.en.split(/\s+/).length <= 4) {
    return 'general'
  }
  return 'general'
}

function themesRelated(a: string, b: string): boolean {
  if (a === b) return true
  return THEME_GROUPS.some((g) => g.includes(a) && g.includes(b))
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

/**
 * Higher = better distractor. Prefers same theme, same register,
 * similar length, overlapping vocabulary; heavily penalizes jargon
 * against non-jargon conversational targets.
 */
export function distractorScore(target: VocabItem, cand: VocabItem): number {
  const regT = detectRegister(target)
  const regC = detectRegister(cand)
  let score = 0

  if (cand.t === target.t) score += 120
  else if (themesRelated(cand.t, target.t)) score += 45
  else score -= 25

  if (regT === regC) score += 100
  else if (regT !== 'jargon' && regC === 'jargon') score -= 140
  else if (regT === 'jargon' && regC !== 'jargon') score -= 50
  else score -= 35

  // Length proximity (exTr)
  const ld = lenClose(cand.exTr, target.exTr)
  score += Math.max(0, 40 - ld)

  // Difficulty proximity
  score += Math.max(0, 12 - Math.abs(cand.d - target.d) * 3)

  // Vocabulary / function overlap on EN + TR gloss
  const ov =
    overlapScore(target.en, cand.en) * 0.55 +
    overlapScore(`${target.tr} ${target.ex}`, `${cand.tr} ${cand.ex}`) * 0.25 +
    overlapScore(target.exTr, cand.exTr) * 0.2
  score += ov * 60

  return score
}

/**
 * Pick the two best distractor items (deterministic order by score).
 * Hard rule: never pick jargon distractors for a non-jargon target when
 * enough same-theme non-jargon alternatives exist.
 */
export function pickDistractorItems(
  item: VocabItem,
  pool: VocabItem[],
): VocabItem[] {
  const correct = item.exTr
  const regT = detectRegister(item)
  const base = pool.filter(
    (x) => x.en !== item.en && x.exTr !== correct && !similarText(x.exTr, correct),
  )

  const sameTheme = base.filter((x) => x.t === item.t)
  const sameThemeNonJargon = sameTheme.filter(
    (x) => detectRegister(x) !== 'jargon',
  )
  const sameReg = base.filter((x) => detectRegister(x) === regT)
  const related = base.filter(
    (x) => x.t !== item.t && themesRelated(x.t, item.t),
  )

  const forbidJargon =
    regT !== 'jargon' && sameThemeNonJargon.length >= 2

  const tiers: VocabItem[][] = []
  if (regT !== 'general') {
    tiers.push(sameTheme.filter((x) => detectRegister(x) === regT))
  }
  if (forbidJargon) {
    tiers.push(sameThemeNonJargon)
  }
  tiers.push(sameTheme)
  tiers.push(sameReg.filter((x) => themesRelated(x.t, item.t)))
  tiers.push(related)
  if (!forbidJargon) {
    tiers.push(base)
  } else {
    tiers.push(base.filter((x) => detectRegister(x) !== 'jargon'))
    tiers.push(base) // last resort
  }

  const picked: VocabItem[] = []
  const usedTr = new Set<string>([correct])

  const takeFrom = (cands: VocabItem[]) => {
    const ranked = [...cands].sort(
      (a, b) => distractorScore(item, b) - distractorScore(item, a),
    )
    for (const c of ranked) {
      if (picked.length >= 2) break
      if (usedTr.has(c.exTr)) continue
      if ([...usedTr].some((u) => similarText(u, c.exTr))) continue
      if (forbidJargon && detectRegister(c) === 'jargon') continue
      picked.push(c)
      usedTr.add(c.exTr)
    }
  }

  for (const tier of tiers) {
    if (picked.length >= 2) break
    takeFrom(tier)
  }

  // Absolute fallback
  if (picked.length < 2) {
    for (const c of base) {
      if (picked.length >= 2) break
      if (usedTr.has(c.exTr)) continue
      picked.push(c)
      usedTr.add(c.exTr)
    }
  }

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
): { options: string[]; correctIndex: number } {
  const correct = item.exTr
  const distractors = pickDistractorItems(item, pool).map((x) => x.exTr)
  const options = [correct, distractors[0], distractors[1]]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return { options, correctIndex: options.indexOf(correct) }
}
