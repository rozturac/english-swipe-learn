/**
 * LD-v1 session-mix acceptance (compiles progress.ts → /tmp, then asserts).
 * Run: node scripts/check-session-mix.mjs
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = '/tmp/esl-session-mix'
const tsconfig = '/tmp/tsconfig.session-mix.json'

writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      outDir,
      rootDir: join(root, 'src'),
      skipLibCheck: true,
      strict: true,
      lib: ['ES2022', 'DOM'],
    },
    include: [join(root, 'src/lib/progress.ts'), join(root, 'src/types.ts')],
  }),
)

rmSync(outDir, { recursive: true, force: true })
const tsc = spawnSync(
  join(root, 'node_modules/.bin/tsc'),
  ['-p', tsconfig],
  { encoding: 'utf8' },
)
if (tsc.status !== 0) {
  console.error(tsc.stdout, tsc.stderr)
  process.exit(1)
}

const mod = await import(pathToFileURL(join(outDir, 'lib/progress.js')).href)
const {
  pickSession,
  isDue,
  intervalHours,
  classifyBucket,
  SESSION_SIZE,
} = mod

const require = createRequire(import.meta.url)
const vocab = require(join(root, 'vocab.json'))

const THEME = 'Günlük konuşma'
const gunluk = vocab.filter((x) => x.t === THEME)
if (gunluk.length < 16) {
  console.error('need ≥16 Günlük items, got', gunluk.length)
  process.exit(1)
}

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const now = Date.UTC(2026, 8, 17, 12, 0, 0)

// --- due ladder unit checks ---
assert(
  intervalHours(2, 2.2) === 24,
  'intervalHours(streak=2, ease=2.2) === 24h',
)
assert(
  isDue({ streak: 2, wrongs: 0, lastSeen: now - 25 * 3600_000, ease: 2.2 }, now),
  'streak2 + 25h ago → due',
)
assert(
  !isDue({ streak: 2, wrongs: 0, lastSeen: now - 1 * 3600_000, ease: 2.2 }, now),
  'streak2 + 1h ago → not due (known_rest)',
)
assert(
  !isDue({ streak: 1, wrongs: 0, lastSeen: now - 100 * 3600_000, ease: 2.2 }, now),
  'streak1 never due/review',
)

const fakeItem = (en, d = 2) => ({
  d,
  t: THEME,
  en,
  tr: en + '-tr',
  ex: 'ex ' + en,
  exTr: 'exTr ' + en,
})

assert(
  classifyBucket(
    fakeItem('x'),
    { x: { streak: 2, wrongs: 0, lastSeen: now - 3600_000, ease: 2.2 } },
    new Set(),
    now,
  ) === 'known',
  'classify known when streak2 not due',
)
assert(
  classifyBucket(
    fakeItem('x'),
    { x: { streak: 2, wrongs: 0, lastSeen: now - 25 * 3600_000, ease: 2.2 } },
    new Set(),
    now,
  ) === 'review',
  'classify review when streak2 due',
)

// 1. cold Günlük → 8 unique new
const cold = pickSession(vocab, {}, { theme: THEME, now, missedEns: [] })
assert(cold.length === SESSION_SIZE, `cold length ${cold.length} === 8`)
assert(
  cold.every((x) => x.t === THEME),
  'cold all Günlük konuşma',
)
assert(new Set(cold.map((x) => x.en)).size === 8, 'cold unique en')
assert(new Set(cold.map((x) => x.exTr)).size === 8, 'cold unique exTr')

// 2. ≥3 missed in deck → at least 3 wrong slots
const missedEns = gunluk.slice(0, 5).map((x) => x.en)
const progressMissed = Object.fromEntries(
  missedEns.map((en) => [
    en,
    { streak: 0, wrongs: 2, lastSeen: now - 1000, ease: 1.5 },
  ]),
)
// Mark some other items known so not cold
for (const item of gunluk.slice(10, 20)) {
  progressMissed[item.en] = {
    streak: 3,
    wrongs: 0,
    lastSeen: now - 30 * 60_000,
    ease: 2.5,
  }
}
const withMissed = pickSession(vocab, progressMissed, {
  theme: THEME,
  now,
  missedEns,
  preferMissed: true,
})
const wrongInSession = withMissed.filter((x) => missedEns.includes(x.en))
assert(
  wrongInSession.length >= 3,
  `≥3 missed → ≥3 wrong slots (got ${wrongInSession.length})`,
)

// 5. successive sessions soft-shuffle (not identical 8)
const a = pickSession(vocab, {}, { theme: THEME, now, missedEns: [] }).map(
  (x) => x.en,
)
const b = pickSession(vocab, {}, { theme: THEME, now, missedEns: [] }).map(
  (x) => x.en,
)
const c = pickSession(vocab, {}, { theme: THEME, now, missedEns: [] }).map(
  (x) => x.en,
)
const sameAB = a.join('|') === b.join('|')
const sameBC = b.join('|') === c.join('|')
const sameAC = a.join('|') === c.join('|')
assert(
  !(sameAB && sameBC && sameAC),
  'successive cold sessions not identical 8 (shuffle/soft)',
)

// Bonus: 3+3+2 when pools allow
const big = gunluk.slice(0, 40)
const p333 = {}
const missed3 = big.slice(0, 5).map((x) => x.en)
for (const en of missed3) {
  p333[en] = { streak: 0, wrongs: 1, lastSeen: now - 1000, ease: 1.4 }
}
const news = big.slice(5, 20) // leave as new (no progress)
const knowns = big.slice(20, 30)
for (const item of knowns) {
  p333[item.en] = {
    streak: 4,
    wrongs: 0,
    lastSeen: now - 30 * 60_000,
    ease: 2.8,
  }
}
const rest = big.slice(30, 40)
for (const item of rest) {
  p333[item.en] = {
    streak: 2,
    wrongs: 0,
    lastSeen: now - 30 * 60_000,
    ease: 2.2,
  }
}
const mix = pickSession(big, p333, {
  theme: THEME,
  now,
  missedEns: missed3,
  preferMissed: true,
})
const mset = new Set(missed3)
const nNew = mix.filter((x) => !p333[x.en]).length
const nWrong = mix.filter((x) => mset.has(x.en)).length
const nKnown = mix.filter((x) => {
  const p = p333[x.en]
  return p && p.streak >= 2 && !isDue(p, now) && !mset.has(x.en)
}).length
assert(
  nWrong === 3 && nNew === 3 && nKnown === 2,
  `3+3+2 when pools allow (wrong=${nWrong} new=${nNew} known=${nKnown})`,
)

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll LD-v1 session-mix checks passed.')
