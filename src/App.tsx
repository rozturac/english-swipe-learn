import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import vocabRaw from './data/vocab.json'
import { EnglishSentence } from './components/EnglishSentence'
import { OptionStrip } from './components/OptionStrip'
import { useSwipe } from './hooks/useSwipe'
import { buildOptions } from './lib/distractors'
import {
  DECK_SHORT,
  EXPERIMENTAL_DECKS,
  PRIMARY_DECKS,
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

/** Below-hairline Reels translate — keep in sync with CSS (~450ms correct). */
const REEL_MS = 450
/**
 * Wrong/timeout → next: gentle Reels exit/enter. Sync with CSS.
 * Fuses former static Doğru cevap dwell (3200) + slide (1700) into one slide
 * so the teach reveal stays visible on the exiting page while it moves up.
 */
const REEL_WRONG_MS = 4900
/** prefers-reduced-motion wrong path: short fade, not a 4.9s transform. */
const REEL_WRONG_REDUCED_MS = 1000
/** Review enter/exit Reels (↓ previous / ↑ back) — same snap as success. */
const REVIEW_REEL_MS = 450
const REVIEW_REEL_REDUCED_MS = 300
/** Brief feedback before the below-line content turns. */
const FEEDBACK_OK_MS = 220
/** Wrong/timeout: brief red flash, then teach reveal + immediate gentle exit. */
const FEEDBACK_LEARN_RED_MS = 280
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
  /** Slower Reels turn after a wrong lock / timeout reveal. */
  gentle?: boolean
}

/** Completed-card snapshot for ↓ read-only review. */
type HistorySnap = {
  id: string
  item: VocabItem
  options: string[]
  selected: number
  correctIndex: number
  revealCorrect: number | null
  flash: FlashKind
  wasCorrect: boolean
}

type ReviewPane = { kind: 'active' } | { kind: 'review'; snap: HistorySnap }

/** Dual-page transit while entering / leaving / browsing review. */
type ReviewNav = {
  dir: 'up' | 'down'
  leaving: ReviewPane
  entering: ReviewPane
  nextIndex: number | null
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
  reviewMode?: boolean
  showReviewHint?: boolean
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
  reviewMode = false,
  showReviewHint = false,
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
          reviewMode={reviewMode}
          showReviewHint={showReviewHint}
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
  /** Session stack of completed cards (chronological) for ↓ review. */
  const [history, setHistory] = useState<HistorySnap[]>([])
  /** null = active play; index into history while reviewing. */
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  /** Dual-page Reels transit for review enter/exit/browse. */
  const [reviewNav, setReviewNav] = useState<ReviewNav | null>(null)
  const advanceTimer = useRef<number | null>(null)
  const learnTimer = useRef<number | null>(null)
  const reelClearTimer = useRef<number | null>(null)
  const reviewNavTimer = useRef<number | null>(null)
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
  const historyRef = useRef<HistorySnap[]>([])
  historyRef.current = history
  const reviewIndexRef = useRef<number | null>(null)
  reviewIndexRef.current = reviewIndex
  const reviewingRef = useRef(false)

  const current = !sessionOver ? (queue[0] ?? null) : null
  const reeling = exiting !== null
  const reviewing = reviewIndex !== null || reviewNav !== null
  reviewingRef.current = reviewing

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
      if (reviewNavTimer.current) window.clearTimeout(reviewNavTimer.current)
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
      if (reviewNavTimer.current) window.clearTimeout(reviewNavTimer.current)
      setExiting(null)
      setHistory([])
      historyRef.current = []
      setReviewIndex(null)
      reviewIndexRef.current = null
      setReviewNav(null)
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
    setHistory([])
    historyRef.current = []
    setReviewIndex(null)
    setReviewNav(null)
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
      if (!current || lockingRef.current || exiting || reviewingRef.current) return
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
        snapIdRef.current += 1
        const hist: HistorySnap = {
          id: `hist-${item.en}-${snapIdRef.current}`,
          item,
          options: snapOptions,
          selected: exitSelected,
          correctIndex: snapCorrect,
          revealCorrect: exitReveal,
          flash: exitFlash,
          wasCorrect: ok,
        }
        setHistory((h) => {
          const next = [...h, hist]
          historyRef.current = next
          return next
        })

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
        setExiting({
          id: `${item.en}-${snapIdRef.current}`,
          item,
          options: snapOptions,
          selected: exitSelected,
          correctIndex: snapCorrect,
          revealCorrect: exitReveal,
          flash: exitFlash,
          gentle: !ok,
        })
        goNext(ok, item)
        if (reelClearTimer.current) window.clearTimeout(reelClearTimer.current)
        // Reduced motion: short fade (wrong ~1s); do not force the 4.9s slide.
        const reelMs = prefersReducedMotion()
          ? ok
            ? REEL_MS
            : REEL_WRONG_REDUCED_MS
          : ok
            ? REEL_MS
            : REEL_WRONG_MS
        reelClearTimer.current = window.setTimeout(() => {
          clearExiting()
        }, reelMs)
      }

      if (ok) {
        setFlash('correct')
        setRevealCorrect(null)
        advanceTimer.current = window.setTimeout(() => {
          finishAdvance(snapSelected, 'correct', null)
        }, FEEDBACK_OK_MS)
      } else {
        // × flash, then teach/reveal + start gentle exit immediately (no static dwell).
        setFlash('wrong')
        if (nextReveal !== null) setRevealCorrect(nextReveal)
        learnTimer.current = window.setTimeout(() => {
          selectedRef.current = snapCorrect
          setSelected(snapCorrect)
          setFlash('none')
          if (nextReveal !== null) setRevealCorrect(nextReveal)
          // Exiting snapshot keeps Doğru cevap visible for the full gentle slide.
          finishAdvance(snapCorrect, 'none', nextReveal)
        }, FEEDBACK_LEARN_RED_MS)
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

  const exitReviewRef = useRef<() => boolean>(() => false)

  const lockAnswer = useCallback(() => {
    // ↑ in review exits (or steps toward active) — never re-locks / re-scores.
    if (reviewIndexRef.current !== null || reviewingRef.current) {
      exitReviewRef.current()
      return
    }
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
    let pausedAt: number | null = null
    let pauseAccum = 0
    const fire = () => {
      if (fired || lockingRef.current || reviewingRef.current) return
      fired = true
      setRemain(null)
      resolveRef.current()
    }
    const effectiveElapsed = () => {
      if (pausedAt !== null) return pausedAt - started - pauseAccum
      return performance.now() - started - pauseAccum
    }
    setRemain(timerSec)
    const id = window.setInterval(() => {
      if (reviewingRef.current) {
        if (pausedAt === null) pausedAt = performance.now()
        return
      }
      if (pausedAt !== null) {
        pauseAccum += performance.now() - pausedAt
        pausedAt = null
      }
      const left = totalMs - effectiveElapsed()
      if (left <= 80) {
        window.clearInterval(id)
        fire()
        return
      }
      setRemain(left / 1000)
    }, 50)
    return () => {
      window.clearInterval(id)
    }
  }, [current?.en, doneCount, timerSec, sessionOver, locking, reeling, showCoach, pickingDeck])

  const clearReviewNav = useCallback(() => {
    setReviewNav(null)
  }, [])

  const startReviewNav = useCallback(
    (dir: 'up' | 'down', leaving: ReviewPane, entering: ReviewPane, nextIndex: number | null) => {
      if (reviewNavTimer.current) window.clearTimeout(reviewNavTimer.current)
      setDragX(0)
      setDragY(0)
      setDragging(false)
      setReviewNav({ dir, leaving, entering, nextIndex })
      const ms = prefersReducedMotion() ? REVIEW_REEL_REDUCED_MS : REVIEW_REEL_MS
      reviewNavTimer.current = window.setTimeout(() => {
        setReviewIndex(nextIndex)
        reviewIndexRef.current = nextIndex
        clearReviewNav()
      }, ms)
    },
    [clearReviewNav],
  )

  const enterOrDeepenReview = useCallback(() => {
    if (lockingRef.current || exiting || reviewNav || showCoach || pickingDeck || sessionOver) return
    const hist = historyRef.current
    const idx = reviewIndexRef.current
    if (idx === null) {
      if (hist.length === 0) return
      const target = hist.length - 1
      startReviewNav('down', { kind: 'active' }, { kind: 'review', snap: hist[target]! }, target)
      return
    }
    if (idx <= 0) return
    const older = idx - 1
    startReviewNav(
      'down',
      { kind: 'review', snap: hist[idx]! },
      { kind: 'review', snap: hist[older]! },
      older,
    )
  }, [exiting, reviewNav, showCoach, pickingDeck, sessionOver, startReviewNav])

  const exitOrShallowReview = useCallback(() => {
    if (exiting || reviewNav || showCoach || pickingDeck) return false
    const hist = historyRef.current
    const idx = reviewIndexRef.current
    if (idx === null) return false
    if (idx < hist.length - 1) {
      const newer = idx + 1
      startReviewNav(
        'up',
        { kind: 'review', snap: hist[idx]! },
        { kind: 'review', snap: hist[newer]! },
        newer,
      )
      return true
    }
    // Back to the live active card
    startReviewNav('up', { kind: 'review', snap: hist[idx]! }, { kind: 'active' }, null)
    return true
  }, [exiting, reviewNav, showCoach, pickingDeck, startReviewNav])

  useEffect(() => {
    exitReviewRef.current = exitOrShallowReview
  }, [exitOrShallowReview])

  const selectPrev = useCallback(() => {
    if (locking || reeling || reviewing) return
    setSelected((s) => {
      const n = wrapIndex(s - 1, 3)
      selectedRef.current = n
      return n
    })
  }, [locking, reeling, reviewing])

  const selectNext = useCallback(() => {
    if (locking || reeling || reviewing) return
    setSelected((s) => {
      const n = wrapIndex(s + 1, 3)
      selectedRef.current = n
      return n
    })
  }, [locking, reeling, reviewing])

  const onHorizontal = useCallback(
    (deltaIndexes: number) => {
      if (locking || reeling || reviewing || !deltaIndexes) return
      setSelected((s) => {
        const n = wrapIndex(s + deltaIndexes, 3)
        selectedRef.current = n
        return n
      })
    },
    [locking, reeling, reviewing],
  )

  const stepRef = useRef(360 * 0.93 + 14)
  const onStripStep = useCallback((step: number) => {
    stepRef.current = step
  }, [])

  const swipe = useSwipe(
    { onHorizontal, onUp: lockAnswer, onDown: enterOrDeepenReview },
    {
      disabled:
        locking ||
        reeling ||
        !!reviewNav ||
        showCoach ||
        pickingDeck ||
        sessionOver ||
        (!current && reviewIndex === null),
      getStep: () => stepRef.current,
      onDragStart: () => {
        if (lockingRef.current || exiting || reviewNav) return
        dismissGhost()
        setDragging(true)
      },
      onDrag: (dx, dy) => {
        if (lockingRef.current || exiting || reviewNav) return
        if (reviewIndex !== null) {
          // Review: vertical only (no L/R re-selection).
          setDragX(0)
          setDragY(dy)
          return
        }
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
      if (pickingDeck || locking || reeling || reviewNav) return
      if (reviewIndex !== null) {
        if (e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          exitOrShallowReview()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          enterOrDeepenReview()
        }
        return
      }
      if (!current) return
      if (e.key === 'ArrowLeft') selectPrev()
      else if (e.key === 'ArrowRight') selectNext()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        enterOrDeepenReview()
      } else if (e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        lockAnswer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    locking,
    reeling,
    reviewNav,
    reviewIndex,
    current,
    selectPrev,
    selectNext,
    lockAnswer,
    enterOrDeepenReview,
    exitOrShallowReview,
    showCoach,
    pickingDeck,
    dismissCoach,
  ])

  const chooseTimer = (sec: TimerSec) => {
    setTimerSec(sec)
    saveTimerPref(sec)
  }

  const frozen = locking || flash !== 'none' || reeling || reviewing
  const canPullReview =
    history.length > 0 &&
    !locking &&
    !reeling &&
    !reviewing &&
    flash === 'none'
  const atOldestReview = reviewIndex === 0
  // Active: ↑ lifts EN; ↓ pulls toward review (or soft rubber if none).
  // Review: vertical rubber only at stack ends.
  const liftY = (() => {
    if (reeling || reviewNav || locking || flash !== 'none') return 0
    if (reviewIndex !== null) {
      if (dragY < 0) return Math.max(-28, dragY * 0.18) // toward active
      if (atOldestReview) return Math.min(22, dragY * 0.1) // rubber
      return Math.min(36, dragY * 0.18)
    }
    if (dragY < 0) return Math.max(-40, dragY * 0.22)
    if (canPullReview) return Math.min(40, dragY * 0.22)
    return Math.min(22, dragY * 0.1) // soft rubber — no history
  })()
  const stripDrag = frozen || reviewIndex !== null ? 0 : dragX
  const remainUrgent = remain !== null && remain <= 2 && !frozen && !reviewing
  const showRemain =
    remain !== null &&
    remain > 0.12 &&
    !sessionOver &&
    !reeling &&
    !locking &&
    !reviewing

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
  const reviewSnap =
    reviewIndex !== null ? (history[reviewIndex] ?? null) : null
  const showReviewHint = history.length > 0 && !reviewing && !reeling

  const renderActivePane = (
    opts: {
      frozenPane: boolean
      stripDrag: number
      dragging: boolean
      liftY: number
      flashOverride?: FlashKind
      showGhost?: boolean
    },
  ) => {
    if (!current) return null
    return (
      <PlayPane
        item={current}
        options={options}
        selected={selected}
        revealCorrect={revealCorrect}
        flash={opts.flashOverride ?? (reeling ? 'none' : flash)}
        frozen={opts.frozenPane}
        stripDrag={opts.stripDrag}
        dragging={opts.dragging}
        liftY={opts.liftY}
        onStripStep={onStripStep}
        stripKey={current.en}
        showGhost={opts.showGhost ?? false}
        showReviewHint={showReviewHint}
      />
    )
  }

  const renderHistoryPane = (snap: HistorySnap) => (
    <PlayPane
      item={snap.item}
      options={snap.options}
      selected={snap.selected}
      revealCorrect={snap.revealCorrect}
      flash={snap.flash}
      frozen
      stripDrag={0}
      dragging={false}
      liftY={0}
      onStripStep={onStripStep}
      stripKey={`review-${snap.id}`}
      showGhost={false}
      reviewMode
    />
  )

  const renderReviewPane = (pane: ReviewPane, animKey: string) => {
    if (pane.kind === 'active') {
      return (
        <div className="reel-page-inner" key={`nav-active-${animKey}`}>
          {renderActivePane({
            frozenPane: true,
            stripDrag: 0,
            dragging: false,
            liftY: 0,
            flashOverride: 'none',
          })}
        </div>
      )
    }
    return (
      <div className="reel-page-inner" key={`nav-rev-${pane.snap.id}-${animKey}`}>
        {renderHistoryPane(pane.snap)}
      </div>
    )
  }

  return (
    <>
      <div className="cosmos" aria-hidden>
        <span className="cosmos-photo" />
        <span className="cosmos-vignette" />
      </div>
      <div
        className={`app${frozen ? ' is-frozen' : ''}${reeling ? ' is-reeling' : ''}${reviewing ? ' is-reviewing' : ''}`}
        {...swipe}
      >
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
                {PRIMARY_DECKS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="option"
                    aria-selected={deck === d}
                    className={deck === d ? 'deck-chip on' : 'deck-chip'}
                    onClick={() => chooseDeck(d)}
                  >
                    {DECK_SHORT[d]}
                  </button>
                ))}
                {EXPERIMENTAL_DECKS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="option"
                    aria-selected={deck === d}
                    className={
                      deck === d
                        ? 'deck-chip secondary on'
                        : 'deck-chip secondary'
                    }
                    onClick={() => chooseDeck(d)}
                  >
                    {DECK_SHORT[d]}
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
              <div
                className={`reel-page is-exiting${exiting.gentle ? ' is-gentle' : ''}`}
                key={`exit-${exiting.id}`}
              >
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
            {reviewNav && (
              <>
                <div
                  className={`reel-page ${
                    reviewNav.dir === 'down' ? 'is-exiting-down' : 'is-exiting'
                  }`}
                  key={`rev-leave-${reviewNav.dir}`}
                >
                  {renderReviewPane(reviewNav.leaving, 'leave')}
                </div>
                <div
                  className={`reel-page ${
                    reviewNav.dir === 'down' ? 'is-entering-from-top' : 'is-entering'
                  }`}
                  key={`rev-enter-${reviewNav.dir}`}
                >
                  {renderReviewPane(reviewNav.entering, 'enter')}
                </div>
              </>
            )}
            {!reviewNav && reviewSnap && (
              <div className="reel-page" key={`review-${reviewSnap.id}`}>
                {renderHistoryPane(reviewSnap)}
              </div>
            )}
            {!reviewNav && !reviewSnap && current && (
              <div
                className={`reel-page${reeling ? ' is-entering' : ''}${exiting?.gentle ? ' is-gentle' : ''}`}
                key={`live-${current.en}`}
              >
                {renderActivePane({
                  frozenPane: frozen,
                  stripDrag,
                  dragging,
                  liftY,
                  showGhost: showGhost && !showCoach && !reeling && !locking,
                })}
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
                  <span className="coach-key">↓</span> önceki (incele)
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
