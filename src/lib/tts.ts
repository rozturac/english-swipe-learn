/** EN prompt TTS — pre-rendered clips when available; Web Speech fallback. Never blocks swipe.
 *
 * Sync model (new cards): audio leads; EN word stagger is its own ≤450ms visual track.
 * Start within ~100–150ms of card mount. If audio has not begun by 300ms → abort, stay silent
 * (no late echo after the user has moved on).
 */

import clipManifest from '../data/clip-manifest.json'

const TTS_KEY = 'esl-tts'
/** Comfortable full-sentence rate (audio-lead path; not lockstep). */
const RATE = 0.9
const PITCH = 1
/** If playback has not started by then, cancel — no late echo. */
const START_DEADLINE_MS = 300

const CLIPS: Record<string, string> = clipManifest as Record<string, string>
const CLIP_BASE = import.meta.env.BASE_URL + 'audio/clips/'

let gestureUnlocked = false
let pendingText: string | null = null
let pendingKey: string | null = null
/** Latch only after audio actually starts. */
let lastSpokenKey: string | null = null
/** Bumps on cancel / late-abort — drops in-flight plays. */
let speakGen = 0
let startDeadlineTimer: ReturnType<typeof setTimeout> | null = null
let startedForGen = false
/** Optional UI hook — soft pulse on silent abort (no toast). */
let silentFailListener: (() => void) | null = null

/** Subscribe to silent TTS abort (300ms no-start). Returns unsubscribe. */
export function onTtsSilentFail(fn: () => void): () => void {
  silentFailListener = fn
  return () => {
    if (silentFailListener === fn) silentFailListener = null
  }
}

function notifySilentFail() {
  try {
    silentFailListener?.()
  } catch {
    /* ignore */
  }
}
/** Currently playing (or last) clip element. */
let clipAudio: HTMLAudioElement | null = null
const preloadCache = new Map<string, HTMLAudioElement>()

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

/** Public URL for a pre-rendered clip of this exact ex text, or null. */
export function clipUrlFor(text: string): string | null {
  const file = CLIPS[text.trim()]
  return file ? CLIP_BASE + file : null
}

function clearStartDeadline() {
  if (startDeadlineTimer != null) {
    clearTimeout(startDeadlineTimer)
    startDeadlineTimer = null
  }
}

function markStarted(gen: number, key?: string | null) {
  if (gen !== speakGen) return
  startedForGen = true
  clearStartDeadline()
  if (key) lastSpokenKey = key
}

/** Arm 300ms start gate for this generation. */
function armStartDeadline(gen: number) {
  clearStartDeadline()
  startedForGen = false
  startDeadlineTimer = setTimeout(() => {
    startDeadlineTimer = null
    if (gen !== speakGen) return
    if (startedForGen) return
    // Too late — kill attempt, stay silent (no echo after swipe-away).
    speakGen += 1
    stopClip()
    const s = synth()
    if (s) {
      try {
        s.cancel()
      } catch {
        /* ignore */
      }
    }
    notifySilentFail()
  }, START_DEADLINE_MS)
}

function ensureClipAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  if (!clipAudio) {
    clipAudio = new Audio()
    clipAudio.preload = 'auto'
  }
  return clipAudio
}

function stopClip() {
  if (!clipAudio) return
  try {
    clipAudio.onplay = null
    clipAudio.onplaying = null
    clipAudio.onended = null
    clipAudio.onerror = null
    clipAudio.pause()
    try {
      clipAudio.currentTime = 0
    } catch {
      /* ignore */
    }
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

function makeUtterance(text: string, voice: SpeechSynthesisVoice | null): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = voice?.lang || 'en-US'
  u.rate = RATE
  u.pitch = PITCH
  if (voice) u.voice = voice
  return u
}

/**
 * Web Speech fallback — single full-sentence utterance (audio-lead).
 * Starts immediately; no word-chain / no voiceschanged wait (those caused lag).
 */
function speakWebSpeech(text: string, key: string | null | undefined, gen: number) {
  if (gen !== speakGen) return
  const s = synth()
  if (!s || !text.trim()) return
  try {
    s.cancel()
    const voice = pickEnVoice(s)
    const u = makeUtterance(text.trim(), voice)
    u.onstart = () => markStarted(gen, key)
    u.onerror = () => {
      /* cancelled / failed — deadline may still abort */
    }
    s.speak(u)
  } catch {
    /* best-effort */
  }
}

/**
 * Play pre-rendered clip (prefer warm preload cache for ≤150ms start).
 * On hard failure before deadline, fall back to Web Speech once.
 */
function playClip(url: string, text: string, key: string | null | undefined, gen: number): boolean {
  if (typeof Audio === 'undefined') return false
  try {
    const s = synth()
    if (s) {
      try {
        s.cancel()
      } catch {
        /* ignore */
      }
    }

    // Prefer warm preload so play() can start within ~100–150ms.
    let audio = preloadCache.get(url) ?? ensureClipAudio()
    if (!audio) return false
    stopClip()
    clipAudio = audio
    try {
      const abs = new URL(url, window.location.href).href
      if (audio.src !== abs) audio.src = url
    } catch {
      audio.src = url
    }
    // Re-bind after stopClip cleared handlers.
    audio.onplaying = () => markStarted(gen, key)
    audio.onplay = () => markStarted(gen, key)
    audio.onended = () => {
      /* noop */
    }
    audio.onerror = () => {
      if (gen !== speakGen) return
      if (startedForGen) return
      speakWebSpeech(text, key, gen)
    }
    try {
      audio.currentTime = 0
    } catch {
      /* ignore */
    }
    const p = audio.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        if (gen !== speakGen) return
        if (startedForGen) return
        speakWebSpeech(text, key, gen)
      })
    }
    return true
  } catch {
    return false
  }
}

/**
 * Speak EN text ASAP: clip if manifest hit, else Web Speech.
 * Arms 300ms start deadline. Cancel on card change via cancelTts().
 */
function speakNow(text: string, key?: string | null) {
  if (!text.trim()) return
  speakGen += 1
  const gen = speakGen
  stopClip()
  const s = synth()
  if (s) {
    try {
      s.cancel()
    } catch {
      /* ignore */
    }
  }
  armStartDeadline(gen)

  const trimmed = text.trim()
  const url = clipUrlFor(trimmed)
  if (url) {
    if (playClip(url, trimmed, key, gen)) return
  }
  speakWebSpeech(trimmed, key, gen)
}

/**
 * Warm a card's clip (current or next-in-queue) so play() can start ≤150ms.
 */
export function preloadClip(text: string | null | undefined): void {
  if (!text?.trim()) return
  const url = clipUrlFor(text)
  if (!url || typeof Audio === 'undefined') return
  if (preloadCache.has(url)) return
  try {
    const a = new Audio()
    a.preload = 'auto'
    a.src = url
    // Touch load without playing.
    try {
      a.load()
    } catch {
      /* ignore */
    }
    preloadCache.set(url, a)
  } catch {
    /* ignore */
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
  try {
    const a = ensureClipAudio()
    if (a) {
      a.src =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
      a.volume = 0
      const p = a.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
      a.pause()
      a.volume = 1
      a.removeAttribute('src')
      try {
        a.load()
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
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
  clearStartDeadline()
  startedForGen = false
  stopClip()
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
 * Fire immediately on mount (caller should useLayoutEffect) — do not wait for stagger.
 */
export function speakEnAuto(text: string, key: string): void {
  if (!loadTtsPref()) return
  if (!text.trim()) return
  if (lastSpokenKey === key) return
  if (!clipUrlFor(text) && !synth()) return

  // Warm current clip before play for faster start.
  preloadClip(text)

  if (gestureUnlocked) {
    speakNow(text, key)
    return
  }
  pendingText = text
  pendingKey = key
}

/** Fire-and-forget speak now (pref must be ON). */
export function speakEnNow(text: string, key?: string): void {
  if (!loadTtsPref()) return
  gestureUnlocked = true
  pendingText = null
  pendingKey = null
  preloadClip(text)
  speakNow(text, key ?? null)
}

/** Clear once-per-card latch (session restart or unmute). */
export function clearTtsLatch(key?: string): void {
  if (key == null || lastSpokenKey === key) lastSpokenKey = null
}
