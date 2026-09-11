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
const { pickDistractorItems, detectRegister, buildOptions } = mod

const samples = [
  'go ahead',
  'catch you later',
  'have a good one',
  'could you repeat that?',
  'nice to finally meet you',
  'any plans for the weekend?',
]

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

let failed = 0
for (const en of samples) {
  const item = vocab.find((x) => x.en === en)
  assert(item, `missing seed phrase: ${en}`)
  const picks = pickDistractorItems(item, vocab)
  const regT = detectRegister(item)
  const regs = picks.map((p) => detectRegister(p))
  const themes = picks.map((p) => p.t)
  const jargonLeak = regT !== 'jargon' && regs.some((r) => r === 'jargon')
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
    const sameThemePool = vocab.filter(
      (x) => x.t === item.t && x.en !== item.en && x.exTr !== item.exTr,
    )
    if (sameThemePool.length >= 2) {
      assert(themeOk, `expected same-theme distractors for "${en}"`)
    }
    if (regT === 'farewell' || regT === 'turn-permission') {
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
console.log('\n=== BEFORE (reported bug) ===')
console.log('EN: go ahead → "Güncellemem bitti; hazır olduğunuzda devam edin."')
console.log('Bad distractors: "dünya küçük" (small world), "air cover" jargon')
console.log('=== AFTER ===')
for (const p of goPicks) {
  console.log(`- [${detectRegister(p)}] ${p.en}: ${p.exTr}`)
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
