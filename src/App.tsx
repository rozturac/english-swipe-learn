import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import vocabRaw from './data/vocab.json'
import { EnglishSentence } from './components/EnglishSentence'
import { OptionStrip } from './components/OptionStrip'
import { useSwipe } from './hooks/useSwipe'
import { buildOptions } from './lib/distractors'
import {
  DECK_SHORT,
  OPEN_DECKS,
  RETRY_SIZE,
  SESSION_LEN,
  loadDeckPref,
  loadProgress,
  pickSession,
  recordAnswer,
  saveDeckPref,
  type OpenDeck,
} from './lib/progress'
import type { FlashKind, ProgressMap, VocabItem } from './types'
import './App.css'

const vocab = vocabRaw as VocabItem[]

const TIMER_OPTIONS = [0, 6, 12, 18] as const
type TimerSec = (typeof TIMER_OPTIONS)[number]
const TIMER_KEY = 'esl-timer-sec'
const COACH_KEY = 'esl-coach-v1'

/** Below-hairline Reels translate — keep in sync with CSS (~450ms). */
const REEL_MS = 450
/** Brief feedback before the below-line content turns. */
const FEEDBACK_OK_MS = 220
/** Wrong/timeout: brief red on card, then green correct readable hold. */
const FEEDBACK_LEARN_RED_MS = 280
const FEEDBACK_LEARN_GREEN_MS = 2200
const GHOST_KEY = 'esl-ghost-v1'

function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0
  return ((i % n) + n) % n
}

function migrateTimerSec(v: number): TimerSec {
  if ((TIMER_OPTIONS as readonly number[]).includes(v)) return v as TimerSec
  // Legacy chips 5 / 8 / 10 → nearest new option (or Off if unusable).
  const legacy = [5, 8, 10]
  if (!legacy.includes(v) || !Number.isFinite(v) || v <= 0) return 0
  const candidates = TIMER_OPTIONS.filter((s) => s > 0)
  let best: TimerSec = candidates[0]
  let bestDist = Math.abs(v - best)
  for (const c of candidates) {
    const d = Math.abs(v - c)
    if (d < bestDist) {
      best = c
      bestDist = d
    }
  }
  return best
}

function loadTimerPref(): TimerSec {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    const v = Number(raw ?? '0')
    const sec = migrateTimerSec(Number.isFinite(v) ? v : 0)
    if (raw != null && String(sec) !== raw) saveTimerPref(sec)
    return sec
  } catch {
    return 0
  }
}

function saveTimerPref(sec: TimerSec) {
  try {
    localStorage.setItem(TIMER_KEY, String(sec))
  } catch {
    /* ignore */
  }
}

function loadCoachSeen(): boolean {
  try {
    return localStorage.getItem(COACH_KEY) === '1'
  } catch {
    return false
  }
}

function saveCoachSeen() {
  try {
    localStorage.setItem(COACH_KEY, '1')
  } catch {
    /* ignore */
  }
}

function loadGhostSeen(): boolean {
  try {
    return localStorage.getItem(GHOST_KEY) === '1'
  } catch {
    return false
  }
}

function saveGhostSeen() {
  try {
    localStorage.setItem(GHOST_KEY, '1')
  } catch {
    /* ignore */
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Snapshot of below-hairline play content for the exiting reel page. */
type PageSnap = {
  id: string
  item: VocabItem
  options: string[]
  selected: number
  correctIndex: number
  revealCorrect: number | null
  flash: FlashKind
}

type PlayPaneProps = {
  item: VocabItem
  options: string[]
  selected: number
  revealCorrect: number | null
  flash: FlashKind
  frozen: boolean
  stripDrag: number
  dragging: boolean
  liftY: number
  onStripStep: (step: number) => void
  /** Stable key for OptionStrip remount per sentence (not mid-exit). */
  stripKey: string
  showGhost?: boolean
}

/** EN + TR + jest hint — lives inside the sliding reel page. */
function PlayPane({
  item,
  options,
  selected,
  revealCorrect,
  flash,
  frozen,
  stripDrag,
  dragging,
  liftY,
  onStripStep,
  stripKey,
  showGhost = false,
}: PlayPaneProps) {
  // Correct may keep a soft veil; wrong/timeout flash is card-only (cosmos stays still).
  const flashClass = flash === 'correct' ? 'flash-correct' : ''

  return (
    <div className={`play-stage ${flashClass}`}>
      <div className="flash-veil" aria-hidden />

      <section
        className="en-area"
        style={frozen ? undefined : { transform: `translate3d(0, ${liftY}px, 0)` }}
      >
        <EnglishSentence ex={item.ex} en={item.en} category={item.t} />
      </section>

      <section className={`tr-area${frozen ? ' is-frozen' : ''}`}>
        <OptionStrip
          key={stripKey}
          options={options}
          selected={selected}
          revealCorrect={revealCorrect}
          dragX={stripDrag}
          dragging={dragging}
          frozen={frozen}
          onStep={onStripStep}
          wrongFlash={flash === 'wrong'}
          successFlash={flash === 'correct'}
          showGhost={showGhost}
        />
      </section>
    </div>
  )
}

export default function App() {
  const [, setProgress] = useState<ProgressMap>(() => loadProgress())
  const [deck, setDeck] = useState<OpenDeck>(() => loadDeckPref())
  const [pickingDeck, setPickingDeck] = useState(() => loadCoachSeen())
  const [queue, setQueue] = useState<VocabItem[]>([])
  const [doneCount, setDoneCount] = useState(0)
  const [selected, setSelected] = useState(0)
  const [options, setOptions] = useState<string[]>([])
  const [correctIndex, setCorrectIndex] = useState(0)
  const [flash, setFlash] = useState<FlashKind>('none')
  const [revealCorrect, setRevealCorrect] = useState<number | null>(null)
  const [dragX, setDragX] = useState(0)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [locking, setLocking] = useState(false)
  const [sessionOver, setSessionOver] = useState(false)
  const [timerSec, setTimerSec] = useState<TimerSec>(loadTimerPref)
  const [remain, setRemain] = useState<number | null>(null)
  const [score, setScore] = useState({ ok: 0, wrong: 0 })
  const [missed, setMissed] = useState<VocabItem[]>([])
  const [sessionLen, setSessionLen] = useState(SESSION_LEN)
  const [showCoach, setShowCoach] = useState(() => !loadCoachSeen())
  const [showGhost, setShowGhost] = useState(
    () => !loadGhostSeen() && !prefersReducedMotion(),
  )
  /** Snapshot of the below-line page sliding UP — kept mounted for the full exit. */
  const [exiting, setExiting] = useState<PageSnap | null>(null)
  const advanceTimer = useRef<number | null>(null)
  const learnTimer = useRef<number | null>(null)
  const reelClearTimer = useRef<number | null>(null)
  const doneRef = useRef(0)
  const lockingRef = useRef(false)
  const snapIdRef = useRef(0)
  /** Session-wide exTr used as correct or distractor. */
  const usedExTrRef = useRef<Set<string>>(new Set())
  /** Session-wide EN prompts already shown (main session uniqueness). */
  const usedEnRef = useRef<Set<string>>(new Set())
  const sessionLenRef = useRef(SESSION_LEN)
  const selectedRef = useRef(0)
  /** Timer preference to restore after a retry run forced Off. */
  const timerBeforeRetryRef = useRef<TimerSec | null>(null)
  const retryRunRef = useRef(false)

  const current = !sessionOver ? (queue[0] ?? null) : null
  const reeling = exiting !== null

  const builtForEn = useRef<string | null>(null)

  const deckPool = useCallback(
    (theme: string) => vocab.filter((x) => x.t === theme),
    [],
  )

  const rebuildOptions = useCallback((item: VocabItem, unlock = true) => {
    usedEnRef.current.add(item.en)
    const used = usedExTrRef.current
    const pool = deckPool(item.t)
    const { options: opts, correctIndex: ci } = buildOptions(item, pool, used)
    for (const o of opts) used.add(o)
    setOptions(opts)
    setCorrectIndex(ci)
    const sel = Math.floor(Math.random() * 3)
    selectedRef.current = sel
    setSelected(sel)
    setRevealCorrect(null)
    setFlash('none')
    if (unlock) {
      lockingRef.current = false
      setLocking(false)
    }
    setDragX(0)
    setDragY(0)
    setDragging(false)
    builtForEn.current = item.en
  }, [deckPool])

  // Safety net (initial mount / session restart): settle options before paint
  useLayoutEffect(() => {
    if (current && builtForEn.current !== current.en) {
      rebuildOptions(current)
    }
  }, [current, rebuildOptions])

  useEffect(() => {
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
      if (learnTimer.current) window.clearTimeout(learnTimer.current)
      if (reelClearTimer.current) window.clearTimeout(reelClearTimer.current)
    }
  }, [])

  const dismissCoach = useCallback(() => {
    saveCoachSeen()
    setShowCoach(false)
    setPickingDeck(true)
  }, [])

  const dismissGhost = useCallback(() => {
    saveGhostSeen()
    setShowGhost(false)
  }, [])

  useEffect(() => {
    if (!showGhost || showCoach) return
    const t = window.setTimeout(() => dismissGhost(), 4200)
    return () => window.clearTimeout(t)
  }, [showGhost, showCoach, dismissGhost])

  const clearExiting = useCallback(() => {
    setExiting(null)
    lockingRef.current = false
    setLocking(false)
  }, [])

  const beginSession = useCallback(
    (next: VocabItem[]) => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
      if (learnTimer.current) window.clearTimeout(learnTimer.current)
      if (reelClearTimer.current) window.clearTimeout(reelClearTimer.current)
      setExiting(null)
      usedExTrRef.current = new Set()
      usedEnRef.current = new Set()
      sessionLenRef.current = Math.max(1, next.length)
      setSessionLen(sessionLenRef.current)
      setQueue(next)
      setDoneCount(0)
      doneRef.current = 0
      setScore({ ok: 0, wrong: 0 })
      setMissed([])
      setSessionOver(false)
      setRemain(null)
      const head = next[0]
      if (head) rebuildOptions(head)
      else {
        setFlash('none')
        setRevealCorrect(null)
        lockingRef.current = false
        setLocking(false)
        setDragX(0)
        setDragY(0)
        setDragging(false)
        builtForEn.current = null
      }
    },
    [rebuildOptions],
  )

  const startNewSession = useCallback(
    (theme: OpenDeck = deck) => {
      if (retryRunRef.current) {
        const prior = timerBeforeRetryRef.current
        retryRunRef.current = false
        timerBeforeRetryRef.current = null
        if (prior !== null) {
          setTimerSec(prior)
          saveTimerPref(prior)
        }
      }
      const p = loadProgress()
      setProgress(p)
      setPickingDeck(false)
      beginSession(
        pickSession(vocab, p, { theme, preferMissed: true }),
      )
    },
    [beginSession, deck],
  )

  const chooseDeck = useCallback(
    (next: OpenDeck) => {
      setDeck(next)
      saveDeckPref(next)
      startNewSession(next)
    },
    [startNewSession],
  )

  const openDeckPicker = useCallback(() => {
    if (retryRunRef.current) {
      const prior = timerBeforeRetryRef.current
      retryRunRef.current = false
      timerBeforeRetryRef.current = null
      if (prior !== null) {
        setTimerSec(prior)
        saveTimerPref(prior)
      }
    }
    setSessionOver(false)
    setQueue([])
    setExiting(null)
    setPickingDeck(true)
    lockingRef.current = false
    setLocking(false)
    builtForEn.current = null
  }, [])

  const startRetryMissed = useCallback(() => {
    if (missed.length === 0) {
      startNewSession()
      return
    }
    // Dedupe by en, keep order — retry may intentionally re-show prior EN
    const seen = new Set<string>()
    const mini: VocabItem[] = []
    for (const m of missed) {
      if (seen.has(m.en)) continue
      seen.add(m.en)
      mini.push(m)
      if (mini.length >= RETRY_SIZE) break
    }
    if (!retryRunRef.current) {
      timerBeforeRetryRef.current = timerSec
      retryRunRef.current = true
    }
    setTimerSec(0)
    setPickingDeck(false)
    setProgress(loadProgress())
    beginSession(mini)
  }, [missed, beginSession, startNewSession, timerSec])

  const goNext = useCallback((_wasCorrect: boolean, _item: VocabItem) => {
    const nextDone = doneRef.current + 1
    doneRef.current = nextDone
    setDoneCount(nextDone)

    if (nextDone >= sessionLenRef.current) {
      setSessionOver(true)
      setFlash('none')
      setRevealCorrect(null)
      // Stay locked until exiting page finishes sliding up — then results card.
      setQueue([])
      setRemain(null)
      setDragX(0)
      setDragY(0)
      setDragging(false)
      builtForEn.current = null
      return
    }

    let nextQueue: VocabItem[] = []
    setQueue((q) => {
      const rest = q.slice(1)
      // Main session stays unique by en — wrongs go to retry CTA, not requeue.
      if (rest.length === 0) {
        const filler = pickSession(vocab, loadProgress(), { theme: deck }).filter(
          (x) => !usedEnRef.current.has(x.en) && !usedExTrRef.current.has(x.exTr),
        )
        nextQueue = filler.slice(0, 3)
      } else {
        nextQueue = rest
      }
      return nextQueue
    })

    // Rebuild in the same turn as queue advance so first paint is settled (no TR jitter).
    // Keep locked until reel exit finishes.
    const head = nextQueue[0]
    if (head) rebuildOptions(head, false)
    else {
      setFlash('none')
      setRevealCorrect(null)
      setDragX(0)
      setDragY(0)
      setDragging(false)
    }
  }, [rebuildOptions, deck])

  const resolveAnswer = useCallback(
    () => {
      if (!current || lockingRef.current || exiting) return
      if (options.length !== 3) return
      lockingRef.current = true
      setLocking(true)
      setDragX(0)
      setDragY(0)
      setDragging(false)
      setRemain(null)
      dismissGhost()

      // Timeout and swipe-up both grade the centered / selected card.
      const sel = selectedRef.current
      const ok = sel === correctIndex
      const nextScore = ok
        ? { ok: score.ok + 1, wrong: score.wrong }
        : { ok: score.ok, wrong: score.wrong + 1 }
      const nextReveal = ok ? null : correctIndex

      setProgress((p) => recordAnswer(p, current.en, ok))
      setScore(nextScore)
      if (!ok) {
        setMissed((m) => (m.some((x) => x.en === current.en) ? m : [...m, current]))
      }

      const item = current
      const snapOptions = options
      const snapCorrect = correctIndex
      const snapSelected = sel

      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
      if (learnTimer.current) window.clearTimeout(learnTimer.current)

      const finishAdvance = (exitSelected: number, exitFlash: FlashKind, exitReveal: number | null) => {
        const willEnd = doneRef.current + 1 >= sessionLenRef.current
        if (willEnd) {
          // 8/8 (or mini-set end) → results card directly; no empty cosmos + hint frame.
          goNext(ok, item)
          setExiting(null)
          setFlash('none')
          setRevealCorrect(null)
          lockingRef.current = false
          setLocking(false)
          return
        }
        snapIdRef.current += 1
        setExiting({
          id: `${item.en}-${snapIdRef.current}`,
          item,
          options: snapOptions,
          selected: exitSelected,
          correctIndex: snapCorrect,
          revealCorrect: exitReveal,
          flash: exitFlash,
        })
        goNext(ok, item)
        if (reelClearTimer.current) window.clearTimeout(reelClearTimer.current)
        reelClearTimer.current = window.setTimeout(() => {
          clearExiting()
        }, REEL_MS)
      }

      if (ok) {
        setFlash('correct')
        setRevealCorrect(null)
        advanceTimer.current = window.setTimeout(() => {
          finishAdvance(snapSelected, 'correct', null)
        }, FEEDBACK_OK_MS)
      } else {
        // × on selected, then teach/reveal (neutral + Doğru cevap) ~2200ms.
        setFlash('wrong')
        if (nextReveal !== null) setRevealCorrect(nextReveal)
        learnTimer.current = window.setTimeout(() => {
          selectedRef.current = snapCorrect
          setSelected(snapCorrect)
          setFlash('none')
          if (nextReveal !== null) setRevealCorrect(nextReveal)
        }, FEEDBACK_LEARN_RED_MS)
        advanceTimer.current = window.setTimeout(() => {
          finishAdvance(snapCorrect, 'none', nextReveal)
        }, FEEDBACK_LEARN_RED_MS + FEEDBACK_LEARN_GREEN_MS)
      }
    },
    [
      current,
      exiting,
      options,
      correctIndex,
      score,
      goNext,
      clearExiting,
      dismissGhost,
    ],
  )

  const resolveRef = useRef(resolveAnswer)
  resolveRef.current = resolveAnswer

  const lockAnswer = useCallback(() => {
    resolveAnswer()
  }, [resolveAnswer])

  useEffect(() => {
    if (!current || sessionOver || locking || reeling || timerSec === 0 || showCoach || pickingDeck) {
      if (timerSec === 0 || !current || sessionOver || showCoach || pickingDeck) setRemain(null)
      return
    }
    const totalMs = timerSec * 1000
    const started = performance.now()
    let fired = false
    const fire = () => {
      if (fired || lockingRef.current) return
      fired = true
      setRemain(null)
      resolveRef.current()
    }
    setRemain(timerSec)
    const id = window.setInterval(() => {
      const left = totalMs - (performance.now() - started)
      if (left <= 80) {
        window.clearInterval(id)
        fire()
        return
      }
      setRemain(left / 1000)
    }, 50)
    const to = window.setTimeout(fire, totalMs)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(to)
    }
  }, [current?.en, doneCount, timerSec, sessionOver, locking, reeling, showCoach, pickingDeck])

  const selectPrev = useCallback(() => {
    if (locking || reeling) return
    setSelected((s) => {
      const n = wrapIndex(s - 1, 3)
      selectedRef.current = n
      return n
    })
  }, [locking, reeling])

  const selectNext = useCallback(() => {
    if (locking || reeling) return
    setSelected((s) => {
      const n = wrapIndex(s + 1, 3)
      selectedRef.current = n
      return n
    })
  }, [locking, reeling])

  const onHorizontal = useCallback(
    (deltaIndexes: number) => {
      if (locking || reeling || !deltaIndexes) return
      setSelected((s) => {
        const n = wrapIndex(s + deltaIndexes, 3)
        selectedRef.current = n
        return n
      })
    },
    [locking, reeling],
  )

  const stepRef = useRef(360 * 0.93 + 14)
  const onStripStep = useCallback((step: number) => {
    stepRef.current = step
  }, [])

  const swipe = useSwipe(
    { onHorizontal, onUp: lockAnswer },
    {
      disabled: locking || reeling || !current || showCoach || pickingDeck,
      getStep: () => stepRef.current,
      onDragStart: () => {
        if (lockingRef.current || exiting) return
        dismissGhost()
        setDragging(true)
      },
      onDrag: (dx, dy) => {
        if (lockingRef.current || exiting) return
        setDragX(dx)
        setDragY(dy)
      },
      onDragEnd: () => {
        setDragging(false)
        setDragX(0)
        setDragY(0)
      },
    },
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showCoach) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          dismissCoach()
        }
        return
      }
      if (pickingDeck || locking || reeling || !current) return
      if (e.key === 'ArrowLeft') selectPrev()
      else if (e.key === 'ArrowRight') selectNext()
      else if (e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        lockAnswer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    locking,
    reeling,
    current,
    selectPrev,
    selectNext,
    lockAnswer,
    showCoach,
    pickingDeck,
    dismissCoach,
  ])

  const chooseTimer = (sec: TimerSec) => {
    setTimerSec(sec)
    saveTimerPref(sec)
  }

  const frozen = locking || flash !== 'none' || reeling
  const liftY = frozen ? 0 : Math.max(-40, Math.min(0, dragY * 0.22))
  const stripDrag = frozen ? 0 : dragX
  const remainUrgent = remain !== null && remain <= 2 && !frozen
  const showRemain =
    remain !== null && remain > 0.12 && !sessionOver && !reeling && !locking

  const stopBubble = {
    onPointerDown: (e: PointerEvent) => e.stopPropagation(),
    onClick: (e: MouseEvent) => e.stopPropagation(),
  }

  const answered = score.ok + score.wrong
  const accuracy = answered > 0 ? Math.round((score.ok / answered) * 100) : 0

  const progressText = `${Math.min(doneCount, sessionLen)} / ${sessionLen} cümle`
  const showSessionEnd = sessionOver && !exiting && !pickingDeck
  const showPicker = pickingDeck && !showCoach && !showSessionEnd
  const deckShort = DECK_SHORT[deck] ?? deck
  const missedPreview = missed.slice(0, 4)

  return (
    <>
      <div className="cosmos" aria-hidden>
        <span className="cosmos-photo" />
        <span className="cosmos-vignette" />
      </div>
      <div className={`app${frozen ? ' is-frozen' : ''}${reeling ? ' is-reeling' : ''}`} {...swipe}>
        {/* FIXED chrome — never translates with the Reels page turn */}
        <header className="topbar">
          <div className="progress-row">
            <div className="progress">{progressText}</div>
            <div
              className="session-score"
              aria-label={`Bildin ${score.ok}, Bilemedin ${score.wrong}`}
            >
              <span className="score-ok">✓ {score.ok}</span>
              <span className="score-sep">·</span>
              <span className="score-bad">× {score.wrong}</span>
            </div>
          </div>
        </header>

        <div className="timer-row" {...stopBubble}>
          {TIMER_OPTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              className={timerSec === sec ? 'timer-chip on' : 'timer-chip'}
              onClick={() => chooseTimer(sec)}
              aria-pressed={timerSec === sec}
              tabIndex={frozen ? -1 : 0}
            >
              {sec === 0 ? 'Off' : sec === 6 ? 'Hızlı · 6s' : `${sec}s`}
            </button>
          ))}
          {showRemain && remain !== null && (
            <span
              className={`timer-count ${remainUrgent ? 'urgent' : ''}`}
              aria-live="polite"
            >
              {remain.toFixed(1)}
            </span>
          )}
        </div>
        <div className="top-rule" aria-hidden />

        {/* BELOW the hairline — dual-page Reels (EN + TR + SWIPE only) */}
        {showPicker ? (
          <div className="session-end deck-picker" {...stopBubble}>
            <div className="session-end-card">
              <p className="session-end-kicker">Deck seç</p>
              <h1>Ne çalışalım?</h1>
              <p className="session-end-sub">
                ~3 dk · 8 kalıp · iş İngilizcesi
              </p>
              <div className="deck-chips" role="listbox" aria-label="Deck">
                {OPEN_DECKS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="option"
                    aria-selected={deck === d}
                    className={deck === d ? 'deck-chip on' : 'deck-chip'}
                    onClick={() => chooseDeck(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : showCoach && !current && !exiting ? (
          <div className="session-end" aria-hidden />
        ) : showSessionEnd || (!current && !exiting && !showCoach) ? (
          <div className="session-end">
            <div className="session-end-card">
              <p className="session-end-kicker">Oturum tamam</p>
              <h1>
                {accuracy >= 75
                  ? 'Tebrikler'
                  : `Oturum bitti — ${score.wrong} kalıp kaçtı`}
              </h1>
              <p className="session-end-sub">
                {deckShort} · {sessionLen} cümle · {accuracy}% isabet
              </p>
              {missedPreview.length > 0 && (
                <p className="session-end-missed" title={missed.map((m) => m.en).join(', ')}>
                  Kaçan: {missedPreview.map((m) => m.en).join(' · ')}
                  {missed.length > 4 ? '…' : ''}
                </p>
              )}
              <div className="session-end-stats">
                <div className="stat-pill ok">
                  <span className="stat-num">✓ {score.ok}</span>
                  <span className="stat-label">doğru</span>
                </div>
                <div className="stat-pill bad">
                  <span className="stat-num">✗ {score.wrong}</span>
                  <span className="stat-label">yanlış</span>
                </div>
                <div className="stat-pill acc">
                  <span className="stat-num">{accuracy}%</span>
                  <span className="stat-label">isabet</span>
                </div>
              </div>
              <button
                type="button"
                className="primary"
                onClick={missed.length > 0 ? startRetryMissed : openDeckPicker}
              >
                {missed.length > 0 ? 'Yanlışları tekrarla' : 'Tekrar oyna'}
              </button>
            </div>
          </div>
        ) : (
          <div className="reel-viewport">
            {exiting && (
              <div className="reel-page is-exiting" key={`exit-${exiting.id}`}>
                <PlayPane
                  item={exiting.item}
                  options={exiting.options}
                  selected={exiting.selected}
                  revealCorrect={exiting.revealCorrect}
                  flash={exiting.flash}
                  frozen
                  stripDrag={0}
                  dragging={false}
                  liftY={0}
                  onStripStep={onStripStep}
                  stripKey={`exit-${exiting.id}`}
                  showGhost={false}
                />
              </div>
            )}
            {current && (
              <div
                className={`reel-page${reeling ? ' is-entering' : ''}`}
                key={`live-${current.en}`}
              >
                <PlayPane
                  item={current}
                  options={options}
                  selected={selected}
                  revealCorrect={revealCorrect}
                  flash={reeling ? 'none' : flash}
                  frozen={frozen}
                  stripDrag={stripDrag}
                  dragging={dragging}
                  liftY={liftY}
                  onStripStep={onStripStep}
                  stripKey={current.en}
                  showGhost={showGhost && !showCoach && !reeling && !locking}
                />
              </div>
            )}
          </div>
        )}

        {showCoach && (
          <div
            className="coach-overlay"
            role="dialog"
            aria-label="Nasıl oynanır"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="coach-card">
              <p className="coach-title">Nasıl oynanır</p>
              <ul className="coach-list">
                <li>
                  <span className="coach-key">↔</span> seç
                </li>
                <li>
                  <span className="coach-key">↑</span> kilitle
                </li>
                <li>
                  <span className="coach-key">⏱</span> süre dolarsa seçili kart kilitlenir
                </li>
              </ul>
              <button type="button" className="primary coach-cta" onClick={dismissCoach}>
                Anladım
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
