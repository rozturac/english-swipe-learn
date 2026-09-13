/**
 * Regression check for the 80-card gold set (demo + quality gate).
 * Run: npm run check:gold
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const vocab = JSON.parse(readFileSync(join(root, 'src/data/vocab.json'), 'utf8'))
const gold = JSON.parse(readFileSync(join(root, 'src/data/gold-set.json'), 'utf8'))

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const DASH = /[—–−]/
const key = (x) => `${x.t}::${x.en}`
const vocabByKey = new Map(vocab.map((x) => [key(x), x]))

assert(Array.isArray(gold), 'gold-set must be an array')
assert(gold.length === 80, `gold-set size: expected 80, got ${gold.length}`)

const gunluk = gold.filter((x) => x.t === 'Günlük konuşma')
const is = gold.filter((x) => x.t === 'İş İngilizcesi')
assert(gunluk.length === 64, `expected 64 Günlük, got ${gunluk.length}`)
assert(is.length === 16, `expected 16 İş, got ${is.length}`)

let failed = 0
const seen = new Set()

for (const item of gold) {
  try {
    assert(item && typeof item.en === 'string', 'item needs en')
    const k = key(item)
    assert(!seen.has(k), `duplicate gold item: ${k}`)
    seen.add(k)

    const live = vocabByKey.get(k)
    assert(live, `gold item missing from vocab: ${k}`)
    assert(live.ex === item.ex, `ex drift for ${item.en}`)
    assert(live.exTr === item.exTr, `exTr drift for ${item.en}`)

    const blob = `${item.ex ?? ''}\n${item.exTr ?? ''}\n${item.tr ?? ''}`
    assert(!DASH.test(blob), `dash in ${item.en}`)

    const en = String(item.en).toLowerCase()
    const ex = String(item.ex ?? '').toLowerCase()
    assert(ex.includes(en), `en not in ex for "${item.en}"`)

    const exTr = String(item.exTr ?? '').trim()
    assert(exTr.length > 0, `empty exTr for ${item.en}`)
    assert(
      !/^[a-zçğıöşü]/.test(exTr),
      `exTr not sentence-case for ${item.en}: ${exTr}`,
    )
    assert(/[.!?…]$/.test(exTr), `exTr missing end punctuation for ${item.en}`)
  } catch (e) {
    failed++
    console.error('✗', e.message)
  }
}

if (failed) {
  console.error(`\n${failed} gold-set check(s) failed`)
  process.exit(1)
}

console.log(`✓ gold-set ok: ${gold.length} cards (${gunluk.length} Günlük + ${is.length} İş)`)
console.log(
  '  İş ens:',
  is.map((x) => x.en).join(' · '),
)
