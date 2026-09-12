/**
 * Unit-ish self-check for distractor quality.
 * Run: npm run check:distractors
 */
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const tmp = join(root, 'scripts/.tmp-check')
const vocab = JSON.parse(
  readFileSync(join(root, 'src/data/vocab.json'), 'utf8'),
)

mkdirSync(tmp, { recursive: true })

const raw = readFileSync(join(root, 'src/lib/distractors.ts'), 'utf8').replace(
  /^import type .*$/m,
  '// @ts-nocheck\ntype VocabItem = any',
)
const entry = join(tmp, 'distractors.ts')
writeFileSync(entry, raw)

const tscBin = join(root, 'node_modules/typescript/bin/tsc')
const tsc = spawnSync(
  process.execPath,
  [
    tscBin,
    entry,
    '--ignoreConfig',
    '--outDir',
    tmp,
    '--module',
    'esnext',
    '--target',
    'es2022',
    '--moduleResolution',
    'bundler',
    '--skipLibCheck',
    '--ignoreDeprecations',
    '6.0',
  ],
  { encoding: 'utf8' },
)
if (tsc.status !== 0) {
  console.error(tsc.stdout)
  console.error(tsc.stderr)
  process.exit(1)
}

const mod = await import(
  pathToFileURL(join(tmp, 'distractors.js')).href + '?t=' + Date.now()
)
const { pickDistractorItems, detectRegister, buildOptions, isIdiomItem } = mod

const samples = [
  'go ahead',
  'catch you later',
  'have a good one',
  'could you repeat that?',
  'nice to finally meet you',
  'any plans for the weekend?',
  'small world',
]

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const IDIOM_LEAK = /dünya küçük|small world|ne tesadüf|buzları erit/i

let failed = 0
for (const en of samples) {
  const item = vocab.find((x) => x.en === en)
  assert(item, `missing seed phrase: ${en}`)
  const picks = pickDistractorItems(item, vocab)
  const regT = detectRegister(item)
  const regs = picks.map((p) => detectRegister(p))
  const themes = picks.map((p) => p.t)
  const jargonLeak = regT !== 'jargon' && regs.some((r) => r === 'jargon')
  const idiomLeak =
    regT !== 'idiom' &&
    picks.some((p) => isIdiomItem(p) || IDIOM_LEAK.test(`${p.en} ${p.tr} ${p.exTr}`))
  const themeOk = themes.every((t) => t === item.t)

  console.log('\n▸', en, `(${regT})`)
  console.log('  correct:', item.exTr)
  for (const p of picks) {
    console.log(
      `  distractor [${detectRegister(p)} | ${p.t}]: ${p.en} → ${p.exTr}`,
    )
  }

  try {
    assert(picks.length === 2, 'need 2 distractors')
    assert(!jargonLeak, `jargon distractor for non-jargon target "${en}"`)
    assert(!idiomLeak, `idiom distractor for non-idiom target "${en}"`)
    const sameThemePool = vocab.filter(
      (x) => x.t === item.t && x.en !== item.en && x.exTr !== item.exTr,
    )
    if (sameThemePool.length >= 2 && regT !== 'turn-permission') {
      assert(themeOk, `expected same-theme distractors for "${en}"`)
    }
    if (
      regT === 'farewell' ||
      regT === 'turn-permission' ||
      regT === 'smalltalk' ||
      regT === 'clarification'
    ) {
      const sameRegCount = regs.filter((r) => r === regT).length
      assert(
        sameRegCount >= 1,
        `expected ≥1 same-register distractor for "${en}" (got ${regs.join(',')})`,
      )
    }
    const { options, correctIndex } = buildOptions(item, vocab)
    assert(options.length === 3, 'options length')
    assert(options[correctIndex] === item.exTr, 'correctIndex')
    console.log('  ✓ ok')
  } catch (e) {
    failed++
    console.error('  ✗', e.message)
  }
}

const go = vocab.find((x) => x.en === 'go ahead')
const goPicks = pickDistractorItems(go, vocab)
console.log('\n=== go ahead must never pair with dünya küçük ===')
for (const p of goPicks) {
  console.log(`- [${detectRegister(p)}] ${p.en}: ${p.exTr}`)
}
try {
  assert(
    !goPicks.some((p) =>
      IDIOM_LEAK.test(`${p.en} ${p.tr} ${p.exTr}`),
    ),
    'go ahead leaked an idiom distractor',
  )
  console.log('  ✓ no idiom leak')
} catch (e) {
  failed++
  console.error('  ✗', e.message)
}

// Sweep every Tanışma item — functional phrases must not get idioms
console.log('\n=== Tanışma sweep (no idiom leak on functional phrases) ===')
const tani = vocab.filter((x) => x.t === 'Tanışma ve sohbet')
let sweepFail = 0
for (const item of tani) {
  const reg = detectRegister(item)
  if (reg === 'idiom' || isIdiomItem(item)) continue
  const picks = pickDistractorItems(item, vocab)
  const leak = picks.filter(
    (p) => isIdiomItem(p) || IDIOM_LEAK.test(`${p.en} ${p.tr} ${p.exTr}`),
  )
  if (leak.length) {
    sweepFail++
    console.error(`  ✗ ${item.en} (${reg}) ← ${leak.map((p) => p.en).join(', ')}`)
  }
}
if (sweepFail) {
  failed += sweepFail
} else {
  console.log(`  ✓ ${tani.length} items clean`)
}


// Banned MT / junk substrings must not appear in live pool texts
console.log('\n=== Banned MT substrings ===')
const BANNED = [
  /iplik/i,
  /\bkestin\b/i,
  /tekme/i,
  /haykır/i,
  /Bütün öğleden sonrayım/i,
  /konvoy/i,
  /karaout/i,
]
let banFail = 0
for (const item of vocab) {
  const blob = `${item.tr} ${item.exTr}`
  for (const re of BANNED) {
    if (re.test(blob)) {
      banFail++
      console.error(`  ✗ ${item.en}: matched ${re} in "${blob}"`)
    }
  }
}
if (banFail) {
  failed += banFail
} else {
  console.log('  ✓ no banned substrings in tr/exTr')
}

// Session uniqueness: correct + distractor exTr all distinct within a built session
console.log('\n=== Session exTr uniqueness ===')
let uniqFail = 0
for (let trial = 0; trial < 12; trial++) {
  // Deterministic-ish: take every Nth item as a session seed set
  const seed = vocab.filter((_, i) => (i + trial) % 17 === 0).slice(0, 8)
  if (seed.length < 8) {
    const more = vocab.slice(trial * 3, trial * 3 + 8)
    while (seed.length < 8 && more.length) seed.push(more.shift())
  }
  const used = new Set()
  const allTexts = []
  for (const item of seed) {
    if (used.has(item.exTr)) {
      // skip duplicate corrects in this synthetic set
      continue
    }
    const { options } = buildOptions(item, vocab, used)
    for (const o of options) {
      allTexts.push(o)
      used.add(o)
    }
  }
  const set = new Set(allTexts)
  if (set.size !== allTexts.length) {
    uniqFail++
    console.error(`  ✗ trial ${trial}: duplicate exTr in session options`)
  }
}
if (uniqFail) {
  failed += uniqFail
} else {
  console.log('  ✓ buildOptions respects usedTexts across session cards')
}

try {
  rmSync(tmp, { recursive: true, force: true })
} catch {
  /* ignore */
}


if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll distractor checks passed.')
