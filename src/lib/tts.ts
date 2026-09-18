/** Web Speech API — EN prompt only; fire-and-forget; never blocks swipe. */

const TTS_KEY = 'esl-tts'
/** Default pacing — human-ish, not monologue-fast. */
const RATE = 0.85
const PITCH = 1
/** Inter-word gap (ms) — loosely aligned with EN stagger. */
const WORD_GAP_MS = 150

let gestureUnlocked = false
let pendingText: string | null = null
let pendingKey: string | null = null
/** Latch only after an utterance actually starts (or is intentionally skipped). */
let lastSpokenKey: string | null = null
/** Bumps on cancel — drops in-flight word chains / timeouts. */
let speakGen = 0
let gapTimer: ReturnType<typeof setTimeout> | null = null

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null
  } catch {
    return null
  }
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

/** Default ON — missing key → write esl-tts=1. */
export function loadTtsPref(): boolean {
  try {
    const v = localStorage.getItem(TTS_KEY)
    if (v === null) {
      localStorage.setItem(TTS_KEY, '1')
      return true
    }
    return v === '1'
  } catch {
    return true
  }
}

export function saveTtsPref(on: boolean): void {
  try {
    localStorage.setItem(TTS_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/**
 * Prefer natural en-US voices: Google US English, Samantha, similar;
 * then any en-US; then other en-*.
 */
function scoreEnVoice(v: SpeechSynthesisVoice): number {
  const lang = v.lang || ''
  if (!/^en(-|_|$)/i.test(lang)) return -1
  const name = v.name || ''
  let score = 0
  if (/en-US/i.test(lang)) score += 40
  else if (/en-GB/i.test(lang)) score += 15
  else score += 5

  // Named preferences (highest first)
  if (/google\s*us\s*english/i.test(name) || (/google/i.test(name) && /en-US/i.test(lang)))
    score += 100
  if (/samantha/i.test(name)) score += 90
  if (/microsoft\s*(aria|jenny|zira|guy|david)/i.test(name) && /en-US/i.test(lang))
    score += 80
  if (/\b(alex|allison|ava|susan|victoria|siri|karen|moira|daniel)\b/i.test(name))
    score += 70
  if (/natural|neural|premium|enhanced/i.test(name)) score += 10
  if (v.localService) score += 5
  return score
}

function pickEnVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = s.getVoices()
  if (!voices.length) return null
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -1
  for (const v of voices) {
    const sc = scoreEnVoice(v)
    if (sc > bestScore) {
      bestScore = sc
      best = v
    }
  }
  return best
}

function clearGapTimer() {
  if (gapTimer != null) {
    clearTimeout(gapTimer)
    gapTimer = null
  }
}

function makeUtterance(text: string, voice: SpeechSynthesisVoice | null): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = voice?.lang || 'en-US'
  u.rate = RATE
  u.pitch = PITCH
  if (voice) u.voice = voice
  return u
}

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean)
}

/**
 * Speak EN text: word-by-word with ~150ms gaps (human pacing).
 * prefers-reduced-motion → single slow utterance (no chain).
 * Always cancel() before starting so mid-card swipe drops mid-utterance.
 */
function speakNow(text: string, key?: string | null) {
  const s = synth()
  if (!s || !text.trim()) return
  try {
    clearGapTimer()
    s.cancel()
    const gen = ++speakGen
    const trimmed = text.trim()

    const run = () => {
      if (gen !== speakGen) return
      try {
        const voice = pickEnVoice(s)
        const words = wordsOf(trimmed)
        const reduced = prefersReducedMotion()

        // Reduced motion or single token: one utterance at slow rate.
        if (reduced || words.length <= 1) {
          const u = makeUtterance(trimmed, voice)
          if (key) {
            u.onstart = () => {
              if (gen === speakGen) lastSpokenKey = key
            }
          }
          s.speak(u)
          return
        }

        // Word-by-word with inter-word pause (aligned with stagger feel).
        let i = 0
        const gap = WORD_GAP_MS
        const speakNext = () => {
          if (gen !== speakGen) return
          if (i >= words.length) return
          const u = makeUtterance(words[i]!, voice)
          if (i === 0 && key) {
            u.onstart = () => {
              if (gen === speakGen) lastSpokenKey = key
            }
          }
          u.onend = () => {
            if (gen !== speakGen) return
            i += 1
            if (i >= words.length) return
            clearGapTimer()
            gapTimer = setTimeout(() => {
              gapTimer = null
              if (gen !== speakGen) return
              speakNext()
            }, gap)
          }
          u.onerror = () => {
            /* stop chain on error / cancel */
          }
          try {
            s.speak(u)
          } catch {
            /* best-effort */
          }
        }
        speakNext()
      } catch {
        /* best-effort */
      }
    }

    if (s.getVoices().length === 0) {
      const once = () => {
        s.removeEventListener('voiceschanged', once)
        run()
      }
      s.addEventListener('voiceschanged', once)
      window.setTimeout(run, 120)
    } else {
      run()
    }
  } catch {
    /* best-effort */
  }
}

/**
 * iOS / autoplay unlock — call from coach “Anladım” or first swipe gesture.
 * No extra enable-sound UI.
 */
export function unlockTts(): void {
  gestureUnlocked = true
  const s = synth()
  if (s) {
    try {
      const warm = new SpeechSynthesisUtterance('')
      warm.volume = 0
      s.speak(warm)
      s.cancel()
    } catch {
      /* ignore */
    }
  }
  if (pendingText && loadTtsPref()) {
    const t = pendingText
    const k = pendingKey
    pendingText = null
    pendingKey = null
    speakNow(t, k)
  } else {
    pendingText = null
    pendingKey = null
  }
}

/** Cancel in-flight / pending (card change, mute, unmount). */
export function cancelTts(): void {
  pendingText = null
  pendingKey = null
  speakGen += 1
  clearGapTimer()
  const s = synth()
  if (!s) return
  try {
    s.cancel()
  } catch {
    /* ignore */
  }
}

/**
 * Auto-read EN prompt 1× per card key when pref ON.
 * If not yet gesture-unlocked, queues until unlockTts().
 */
export function speakEnAuto(text: string, key: string): void {
  if (!loadTtsPref()) return
  if (!text.trim()) return
  if (lastSpokenKey === key) return
  if (!synth()) return

  if (gestureUnlocked) {
    speakNow(text, key)
    return
  }
  // Queue for coach Anladım / first swipe — do not latch until spoken.
  pendingText = text
  pendingKey = key
}

/** Fire-and-forget speak now (pref must be ON). */
export function speakEnNow(text: string, key?: string): void {
  if (!loadTtsPref()) return
  gestureUnlocked = true
  pendingText = null
  pendingKey = null
  speakNow(text, key ?? null)
}

/** Clear once-per-card latch (session restart or unmute). */
export function clearTtsLatch(key?: string): void {
  if (key == null || lastSpokenKey === key) lastSpokenKey = null
}
