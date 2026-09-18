#!/usr/bin/env node
/**
 * Pre-render EN example clips for new-card TTS (spike).
 *
 * Usage:
 *   node scripts/render-clips.mjs
 *   node scripts/render-clips.mjs --text "Some sentence."
 *   node scripts/render-clips.mjs --from-gold 3
 *
 * Output:
 *   public/audio/clips/<sha256(ex)[:16]>.mp3
 *   src/data/clip-manifest.json  — { "<ex text>": "<hash>.mp3", ... }
 *
 * Engine preference (first available):
 *   1) Piper  (PIPER_BIN + PIPER_MODEL, or ./tools/piper)
 *   2) espeak-ng + ffmpeg
 *
 * Env:
 *   PIPER_BIN    path to piper binary (default: auto)
 *   PIPER_MODEL  path to .onnx voice (default: auto en_US-lessac-medium)
 *   ESL_CLIPS_DIR  override output dir
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_DIR = process.env.ESL_CLIPS_DIR
  ? resolve(process.env.ESL_CLIPS_DIR)
  : join(ROOT, 'public/audio/clips')
const MANIFEST = join(ROOT, 'src/data/clip-manifest.json')

const DEFAULT_EXS = [
  'Before we dive into the agenda, let me share a bit about me.',
  "We're wrapping up early on Friday. Any plans for the weekend?",
  'I just joined the Zoom. Can you hear me okay?',
]

function hashEx(text) {
  return createHash('sha256').update(text.trim(), 'utf8').digest('hex').slice(0, 16)
}

function which(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

function findPiper() {
  const bin =
    process.env.PIPER_BIN ||
    [
      join(ROOT, 'tools/piper/piper'),
      '/tmp/piper-try/piper/piper',
      which('piper'),
    ].find((p) => p && existsSync(p))
  const model =
    process.env.PIPER_MODEL ||
    [
      join(ROOT, 'tools/piper/voices/en_US-lessac-medium.onnx'),
      '/tmp/piper-try/voices/en_US-lessac-medium.onnx',
    ].find((p) => p && existsSync(p))
  if (bin && model) return { bin, model }
  return null
}

function loadManifest() {
  if (!existsSync(MANIFEST)) return {}
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  } catch {
    return {}
  }
}

function saveManifest(map) {
  mkdirSync(dirname(MANIFEST), { recursive: true })
  const sorted = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n')
}

function renderWithPiper(text, wavPath, piper) {
  const r = spawnSync(
    piper.bin,
    ['--model', piper.model, '--output_file', wavPath, '--length_scale', '1.05'],
    {
      input: text.trim() + '\n',
      encoding: 'utf8',
      env: { ...process.env, LD_LIBRARY_PATH: dirname(piper.bin) },
    },
  )
  if (r.status !== 0) {
    throw new Error(`piper failed: ${(r.stderr || r.stdout || '').slice(0, 400)}`)
  }
}

function renderWithEspeak(text, wavPath) {
  const espeak = which('espeak-ng') || which('espeak')
  if (!espeak) throw new Error('espeak-ng not found')
  const r = spawnSync(
    espeak,
    ['-v', 'en-us', '-s', '150', '-w', wavPath, text.trim()],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`espeak failed: ${(r.stderr || '').slice(0, 400)}`)
  }
}

function wavToMp3(wavPath, mp3Path) {
  const ffmpeg = which('ffmpeg')
  if (!ffmpeg) throw new Error('ffmpeg not found (needed to encode mp3)')
  const r = spawnSync(
    ffmpeg,
    ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-qscale:a', '4', mp3Path],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed: ${(r.stderr || '').slice(-400)}`)
  }
}

function collectTexts(argv) {
  const texts = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--text' && argv[i + 1]) {
      texts.push(argv[++i])
    } else if (argv[i] === '--from-gold') {
      const n = Number(argv[i + 1]) || 3
      i++
      const goldPath = join(ROOT, 'src/data/gold-set.json')
      const alt = join(ROOT, 'gold-set.json')
      const path = existsSync(goldPath) ? goldPath : alt
      const gold = JSON.parse(readFileSync(path, 'utf8'))
      const gunluk = gold.filter(
        (x) => x.t && String(x.t).includes('Günlük') && x.ex,
      )
      for (const row of gunluk.slice(0, n)) texts.push(row.ex)
    }
  }
  if (!texts.length) texts.push(...DEFAULT_EXS)
  return [...new Set(texts.map((t) => t.trim()).filter(Boolean))]
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const piper = findPiper()
  const engine = piper ? `piper (${piper.model})` : which('espeak-ng') || which('espeak')
    ? 'espeak-ng+ffmpeg'
    : null

  if (!engine) {
    console.error(`
BLOCKER: no TTS engine found.
  Prefer: install Piper binary + en_US-lessac-medium.onnx
    mkdir -p tools/piper && download piper_linux_x86_64 + voice into tools/piper/
    or set PIPER_BIN / PIPER_MODEL
  Else: apt install espeak-ng ffmpeg
`)
    process.exit(1)
  }

  if (!which('ffmpeg')) {
    console.error('BLOCKER: ffmpeg required to write mp3 (apt install ffmpeg)')
    process.exit(1)
  }

  const texts = collectTexts(process.argv.slice(2))
  const manifest = loadManifest()
  console.log(`engine: ${engine}`)
  console.log(`out: ${OUT_DIR}`)
  console.log(`rendering ${texts.length} clip(s)…`)

  for (const ex of texts) {
    const h = hashEx(ex)
    const base = `${h}.mp3`
    const mp3Path = join(OUT_DIR, base)
    const wavPath = join(OUT_DIR, `${h}.wav`)
    try {
      if (piper) renderWithPiper(ex, wavPath, piper)
      else renderWithEspeak(ex, wavPath)
      wavToMp3(wavPath, mp3Path)
      try {
        spawnSync('rm', ['-f', wavPath])
      } catch {
        /* ignore */
      }
      manifest[ex] = base
      console.log(`  ok  ${base}  ← ${ex.slice(0, 64)}${ex.length > 64 ? '…' : ''}`)
    } catch (err) {
      console.error(`  FAIL ${h}: ${err.message}`)
      process.exitCode = 1
    }
  }

  saveManifest(manifest)
  console.log(`manifest: ${MANIFEST} (${Object.keys(manifest).length} entries)`)
  const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp3'))
  console.log(`clips on disk: ${files.length}`)
}

main()
