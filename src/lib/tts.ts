/** Web Speech API — EN prompt only; fire-and-forget; never blocks swipe. */

const TTS_KEY = 'esl-tts'

let gestureUnlocked = false
let pendingText: string | null = null
let pendingKey: string | null = null
/** Latch only after an utterance actually starts (or is intentionally skipped). */
let lastSpokenKey: string | null = null

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null
  } catch {
    return null
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

function pickEnVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = s.getVoices()
  if (!voices.length) return null
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang))
  return (
    en.find((v) => /en-US/i.test(v.lang)) ??
    en.find((v) => /en-GB/i.test(v.lang)) ??
    en[0] ??
    null
  )
}

function makeUtterance(text: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.96
  u.pitch = 1
  const s = synth()
  if (s) {
    const voice = pickEnVoice(s)
    if (voice) u.voice = voice
  }
  return u
}

function speakNow(text: string, key?: string | null) {
  const s = synth()
  if (!s || !text.trim()) return
  try {
    s.cancel()
    const run = () => {
      try {
        const u = makeUtterance(text.trim())
        if (key) {
          u.onstart = () => {
            lastSpokenKey = key
          }
        }
        s.speak(u)
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
