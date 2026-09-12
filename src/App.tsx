import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import vocabRaw from './data/vocab.json'
import { EnglishSentence } from './components/EnglishSentence'
import { OptionStrip } from './components/OptionStrip'
import { useSwipe } from './hooks/useSwipe'
import { buildOptions } from './lib/distractors'
import {
  SESSION_LEN,
  loadProgress,
  pickSession,
  recordAnswer,
  requeueWrong,
} from './lib/progress'
import type { FlashKind, ProgressMap, VocabItem } from './types'
import './App.css'

const vocab = vocabRaw as VocabItem[]

const TIMER_OPTIONS = [0, 3, 5, 8, 10] as const
type TimerSec = (typeof TIMER_OPTIONS)[number]
const TIMER_KEY = 'esl-timer-sec'
const COACH_KEY = 'esl-coach-v1'

/** Full-page Reels translate — keep in sync with CSS (~450ms). */
const REEL_MS = 450
/** Brief feedback before the page turns (wrong shows reveal). */
const FEEDBACK_OK_MS = 200
const FEEDBACK_TIMEOUT_MS = 280
const FEEDBACK_WRONG_MS = 420

function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0
  return ((i % n) + n) % n
}

function loadTimerPref(): TimerSec {
  try {
    const v = Number(localStorage.getItem(TIMER_KEY) ?? '0')
    return (TIMER_OPTIONS as readonly number[]).includes(v) ? (v as TimerSec) : 0
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

type PageSnap = {
  id: string
  item: VocabItem
  options: string[]
  selected: number
  correctIndex: number
  revealCorrect: number | null
  flash: FlashKind
  doneCount: number
  score: { ok: number; wrong: number }
}

type ReelPageProps = {
  item: VocabItem
  options: string[]
  selected: number
  revealCorrect: number | null
  flash: FlashKind
  doneCount: number
  score: { ok: number; wrong: number }
  timerSec: TimerSec
  remain: number | null
  showRemain: boolean
  remainUrgent: boolean
  frozen: boolean
  stripDrag: number
  dragging: boolean
  liftY: number
  onChooseTimer: (sec: TimerSec) => void
  onStripStep: (step: number) => void
  stopBubble: {
    onPointerDown: (e: PointerEvent) => void
    onClick: (e: MouseEvent) => void
  }
  /** Stable key for OptionStrip remount per sentence (not mid-exit). */
  stripKey: string
}

function ReelPage({
  item,
  options,
  selected,
  revealCorrect,
  flash,
  doneCount,
  score,
  timerSec,
  remain,
  showRemain,
  remainUrgent,
  frozen,
  stripDrag,
  dragging,
  liftY,
  onChooseTimer,
  onStripStep,
  stopBubble,
  stripKey,
}: ReelPageProps) {
  const progressText = `${Math.min(doneCount, SESSION_LEN)} / ${SESSION_LEN} cümle`
  const flashClass =
    flash === 'correct' ? 'flash-correct' : flash === 'wrong' ? 'flash-wrong' : ''

  return (
    <div className={`reel-page-inner ${flashClass}`}>
      <div className="flash-veil" aria-hidden />

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
            onClick={() => onChooseTimer(sec)}
            aria-pressed={timerSec === sec}
            tabIndex={frozen ? -1 : 0}
          >
            {sec === 0 ? 'Off' : `${sec}s`}
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

      <div className="play-stage">
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
          />
        </section>
      </div>
    </div>
  )
}

export default function App() {
  const [, setProgress] = useState<ProgressMap>(() => loadProgress())
  const [queue, setQueue] = useState<VocabItem[]>(() =>
    pickSession(vocab, loadProgress()),
  )
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
  const [showCoach, setShowCoach] = useState(() => !loadCoachSeen())
  /** Snapshot of the page that is sliding UP — kept mounted for the full exit. */
  const [exiting, setExiting] = useState<PageSnap | null>(null)
  const advanceTimer = useRef<number | null>(null)
  const reelClearTimer = useRef<number | null>(null)
  const doneRef = useRef(0)
  const lockingRef = useRef(false)
  const snapIdRef = useRef(0)

  const current = !sessionOver ? (queue[0] ?? null) : null
  const reeling = exiting !== null

  const builtForEn = useRef<string | null>(null)

  const rebuildOptions = useCallback((item: VocabItem, unlock = true) => {
    const { options: opts, correctIndex: ci } = buildOptions(item, vocab)
    setOptions(opts)
    setCorrectIndex(ci)
    setSelected(Math.floor(Math.random() * 3))
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
  }, [])

  // Safety net (initial mount / session restart): settle options before paint
  useLayoutEffect(() => {
    if (current && builtForEn.current !== current.en) {
      rebuildOptions(current)
    }
  }, [current, rebuildOptions])

  useEffect(() => {
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
      if (reelClearTimer.current) window.clearTimeout(reelClearTimer.current)
    }
  }, [])

  const dismissCoach = useCallback(() => {
    saveCoachSeen()
    setShowCoach(false)
  }, [])

  const clearExiting = useCallback(() => {
    setExiting(null)
    lockingRef.current = false
    setLocking(false)
  }, [])

  const startNewSession = useCallback(() => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    if (reelClearTimer.current) window.clearTimeout(reelClearTimer.current)
    setExiting(null)
    const p = loadProgress()
    setProgress(p)
    const next = pickSession(vocab, p)
    setQueue(next)
    setDoneCount(0)
    doneRef.current = 0
    setScore({ ok: 0, wrong: 0 })
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
  }, [rebuildOptions])

  const goNext = useCallback((wasCorrect: boolean, item: VocabItem) => {
    const nextDone = doneRef.current + 1
    doneRef.current = nextDone
    setDoneCount(nextDone)

    if (nextDone >= SESSION_LEN) {
      setSessionOver(true)
      setFlash('none')
      setRevealCorrect(null)
      // Stay locked until exiting page finishes sliding up
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
      if (!wasCorrect) nextQueue = requeueWrong(rest, item)
      else {
        const entry = loadProgress()[item.en]
        const streak = entry?.streak ?? 0
        if (streak >= 3 && Math.random() < 0.12) {
          nextQueue = [...rest, item]
        } else if (rest.length === 0) {
          const filler = pickSession(vocab, loadProgress()).filter(
            (x) => x.en !== item.en,
          )
          nextQueue = filler.slice(0, 3)
        } else {
          nextQueue = rest
        }
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
  }, [rebuildOptions])

  const resolveAnswer = useCallback(
    (forceWrong = false) => {
      if (!current || lockingRef.current || exiting) return
      if (!forceWrong && options.length !== 3) return
      lockingRef.current = true
      setLocking(true)
      setDragX(0)
      setDragY(0)
      setDragging(false)
      setRemain(null)

      const ok = !forceWrong && options.length === 3 && selected === correctIndex
      const nextScore = ok
        ? { ok: score.ok + 1, wrong: score.wrong }
        : { ok: score.ok, wrong: score.wrong + 1 }
      const nextReveal = ok ? null : options.length === 3 ? correctIndex : null
      const nextFlash: FlashKind = ok ? 'correct' : 'wrong'

      setProgress((p) => recordAnswer(p, current.en, ok))
      setScore(nextScore)
      setFlash(nextFlash)
      if (nextReveal !== null) setRevealCorrect(nextReveal)

      const item = current
      const snapOptions = options
      const snapSelected = selected
      const snapCorrect = correctIndex
      const snapDone = doneCount
      const delay = ok
        ? FEEDBACK_OK_MS
        : forceWrong
          ? FEEDBACK_TIMEOUT_MS
          : FEEDBACK_WRONG_MS

      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
      advanceTimer.current = window.setTimeout(() => {
        snapIdRef.current += 1
        // Keep exiting page mounted for the full translateY — do NOT remount mid-flight.
        setExiting({
          id: `${item.en}-${snapIdRef.current}`,
          item,
          options: snapOptions,
          selected: snapSelected,
          correctIndex: snapCorrect,
          revealCorrect: nextReveal,
          flash: nextFlash,
          doneCount: snapDone,
          score: nextScore,
        })
        goNext(ok, item)
        if (reelClearTimer.current) window.clearTimeout(reelClearTimer.current)
        reelClearTimer.current = window.setTimeout(() => {
          clearExiting()
        }, REEL_MS)
      }, delay)
    },
    [
      current,
      exiting,
      options,
      selected,
      correctIndex,
      score,
      doneCount,
      goNext,
      clearExiting,
    ],
  )

  const resolveRef = useRef(resolveAnswer)
  resolveRef.current = resolveAnswer

  const lockAnswer = useCallback(() => {
    resolveAnswer(false)
  }, [resolveAnswer])

  useEffect(() => {
    if (!current || sessionOver || locking || reeling || timerSec === 0 || showCoach) {
      if (timerSec === 0 || !current || sessionOver || showCoach) setRemain(null)
      return
    }
    const totalMs = timerSec * 1000
    const started = performance.now()
    let fired = false
    const fire = () => {
      if (fired || lockingRef.current) return
      fired = true
      setRemain(null)
      resolveRef.current(true)
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
  }, [current?.en, doneCount, timerSec, sessionOver, locking, reeling, showCoach])

  const selectPrev = useCallback(() => {
    if (locking || reeling) return
    setSelected((s) => wrapIndex(s - 1, 3))
  }, [locking, reeling])

  const selectNext = useCallback(() => {
    if (locking || reeling) return
    setSelected((s) => wrapIndex(s + 1, 3))
  }, [locking, reeling])

  const onHorizontal = useCallback(
    (deltaIndexes: number) => {
      if (locking || reeling || !deltaIndexes) return
      setSelected((s) => wrapIndex(s + deltaIndexes, 3))
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
      disabled: locking || reeling || !current || showCoach,
      getStep: () => stepRef.current,
      onDragStart: () => {
        if (lockingRef.current || exiting) return
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
      if (locking || reeling || !current) return
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

  const accuracy =
    score.ok + score.wrong > 0
      ? Math.round((score.ok / (score.ok + score.wrong)) * 100)
      : 0

  const showSessionEnd = sessionOver && !exiting

  return (
    <>
      <div className="cosmos" aria-hidden>
        <span className="cosmos-photo" />
        <span className="cosmos-vignette" />
      </div>
      <div className={`app${frozen ? ' is-frozen' : ''}${reeling ? ' is-reeling' : ''}`} {...swipe}>
        {showSessionEnd || (!current && !exiting) ? (
          <div className="session-end">
            <div className="session-end-card">
              <p className="session-end-kicker">Oturum tamam</p>
              <h1>Tebrikler</h1>
              <p className="session-end-sub">{SESSION_LEN} cümle bitti.</p>
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
              <button type="button" className="primary" onClick={startNewSession}>
                Tekrar oyna
              </button>
            </div>
          </div>
        ) : (
          <div className="reel-viewport">
            {exiting && (
              <div className="reel-page is-exiting" key={`exit-${exiting.id}`}>
                <ReelPage
                  item={exiting.item}
                  options={exiting.options}
                  selected={exiting.selected}
                  revealCorrect={exiting.revealCorrect}
                  flash={exiting.flash}
                  doneCount={exiting.doneCount}
                  score={exiting.score}
                  timerSec={timerSec}
                  remain={null}
                  showRemain={false}
                  remainUrgent={false}
                  frozen
                  stripDrag={0}
                  dragging={false}
                  liftY={0}
                  onChooseTimer={chooseTimer}
                  onStripStep={onStripStep}
                  stopBubble={stopBubble}
                  stripKey={`exit-${exiting.id}`}
                />
              </div>
            )}
            {current && (
              <div
                className={`reel-page${reeling ? ' is-entering' : ''}`}
                key={`live-${current.en}`}
              >
                <ReelPage
                  item={current}
                  options={options}
                  selected={selected}
                  revealCorrect={revealCorrect}
                  flash={reeling ? 'none' : flash}
                  doneCount={doneCount}
                  score={score}
                  timerSec={timerSec}
                  remain={remain}
                  showRemain={showRemain}
                  remainUrgent={remainUrgent}
                  frozen={frozen}
                  stripDrag={stripDrag}
                  dragging={dragging}
                  liftY={liftY}
                  onChooseTimer={chooseTimer}
                  onStripStep={onStripStep}
                  stopBubble={stopBubble}
                  stripKey={current.en}
                />
              </div>
            )}
          </div>
        )}

        {showCoach && current && (
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
                  <span className="coach-key">← →</span> Türkçe seçeneği kaydır
                </li>
                <li>
                  <span className="coach-key">↑</span> Cevabı kilitle
                </li>
                <li>
                  <span className="coach-key">⏱</span> Süre dolarsa yukarı kayar · yanlış
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
