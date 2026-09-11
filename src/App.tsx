import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
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
  resetProgress,
} from './lib/progress'
import type { FlashKind, ProgressMap, VocabItem } from './types'
import './App.css'

const vocab = vocabRaw as VocabItem[]

const TIMER_OPTIONS = [0, 3, 5, 8, 10] as const
type TimerSec = (typeof TIMER_OPTIONS)[number]
const TIMER_KEY = 'esl-timer-sec'

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
  const [locking, setLocking] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [sessionOver, setSessionOver] = useState(false)
  const [timerSec, setTimerSec] = useState<TimerSec>(loadTimerPref)
  const [remain, setRemain] = useState<number | null>(null)
  const [score, setScore] = useState({ ok: 0, wrong: 0 })
  const advanceTimer = useRef<number | null>(null)
  const doneRef = useRef(0)
  const lockingRef = useRef(false)

  const current = !sessionOver ? (queue[0] ?? null) : null

  const rebuildOptions = useCallback((item: VocabItem) => {
    const { options: opts, correctIndex: ci } = buildOptions(item, vocab)
    setOptions(opts)
    setCorrectIndex(ci)
    setSelected(Math.floor(Math.random() * 3))
    setRevealCorrect(null)
    setFlash('none')
    lockingRef.current = false
    setLocking(false)
    setDragX(0)
    setDragY(0)
  }, [])

  useEffect(() => {
    if (current) rebuildOptions(current)
  }, [current, rebuildOptions])

  useEffect(() => {
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    }
  }, [])

  const startNewSession = useCallback(() => {
    const p = loadProgress()
    setProgress(p)
    setQueue(pickSession(vocab, p))
    setDoneCount(0)
    doneRef.current = 0
    setScore({ ok: 0, wrong: 0 })
    setSessionOver(false)
    setFlash('none')
    setRevealCorrect(null)
    lockingRef.current = false
    setLocking(false)
    setRemain(null)
  }, [])

  const goNext = useCallback((wasCorrect: boolean, item: VocabItem) => {
    const nextDone = doneRef.current + 1
    doneRef.current = nextDone
    setDoneCount(nextDone)

    if (nextDone >= SESSION_LEN) {
      setSessionOver(true)
      setFlash('none')
      setRevealCorrect(null)
      lockingRef.current = false
      setLocking(false)
      setQueue([])
      setRemain(null)
      return
    }

    setQueue((q) => {
      const rest = q.slice(1)
      if (!wasCorrect) return requeueWrong(rest, item)
      // High streak → rarely resurface this session
      const entry = loadProgress()[item.en]
      const streak = entry?.streak ?? 0
      if (streak >= 3 && Math.random() < 0.12) {
        return [...rest, item]
      }
      // Ensure queue doesn't empty early: pad from fresh pick if needed
      if (rest.length === 0) {
        const filler = pickSession(vocab, loadProgress()).filter(
          (x) => x.en !== item.en,
        )
        return filler.slice(0, 3)
      }
      return rest
    })
    setFlash('none')
    setRevealCorrect(null)
    lockingRef.current = false
    setLocking(false)
    setDragX(0)
    setDragY(0)
  }, [])

  const resolveAnswer = useCallback(
    (forceWrong = false) => {
      if (!current || lockingRef.current || options.length !== 3) return
      lockingRef.current = true
      setLocking(true)
      const ok = !forceWrong && selected === correctIndex
      setProgress((p) => recordAnswer(p, current.en, ok))
      setScore((s) =>
        ok
          ? { ok: s.ok + 1, wrong: s.wrong }
          : { ok: s.ok, wrong: s.wrong + 1 },
      )
      if (ok) {
        setFlash('correct')
        advanceTimer.current = window.setTimeout(() => {
          goNext(true, current)
        }, 420)
      } else {
        setFlash('wrong')
        setRevealCorrect(correctIndex)
        advanceTimer.current = window.setTimeout(() => {
          goNext(false, current)
        }, 1100)
      }
    },
    [current, options.length, selected, correctIndex, goNext],
  )

  const resolveRef = useRef(resolveAnswer)
  resolveRef.current = resolveAnswer

  const lockAnswer = useCallback(() => {
    resolveAnswer(false)
  }, [resolveAnswer])

  useEffect(() => {
    if (!current || sessionOver || locking || timerSec === 0) {
      if (timerSec === 0 || !current || sessionOver) setRemain(null)
      return
    }
    const totalMs = timerSec * 1000
    const started = performance.now()
    setRemain(timerSec)
    const id = window.setInterval(() => {
      const left = Math.max(0, totalMs - (performance.now() - started))
      setRemain(left / 1000)
      if (left <= 0) {
        window.clearInterval(id)
        resolveRef.current(true)
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [current?.en, doneCount, timerSec, sessionOver, locking])

  const onLeft = useCallback(() => {
    if (locking) return
    setSelected((s) => Math.max(0, s - 1))
  }, [locking])

  const onRight = useCallback(() => {
    if (locking) return
    setSelected((s) => Math.min(2, s + 1))
  }, [locking])

  const swipe = useSwipe(
    { onLeft, onRight, onUp: lockAnswer },
    {
      disabled: locking || !current,
      onDrag: (dx, dy) => {
        setDragX(dx)
        setDragY(dy)
      },
      onDragEnd: () => {
        setDragX(0)
        setDragY(0)
      },
    },
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locking || !current) return
      if (e.key === 'ArrowLeft') onLeft()
      else if (e.key === 'ArrowRight') onRight()
      else if (e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        lockAnswer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locking, current, onLeft, onRight, lockAnswer])

  const chooseTimer = (sec: TimerSec) => {
    setTimerSec(sec)
    saveTimerPref(sec)
  }

  const progressText = `${Math.min(doneCount, SESSION_LEN)} / ${SESSION_LEN} cümle`
  const flashClass =
    flash === 'correct' ? 'flash-correct' : flash === 'wrong' ? 'flash-wrong' : ''
  const liftY = locking ? 0 : Math.max(-48, Math.min(0, dragY * 0.28))
  const remainPct =
    timerSec > 0 && remain !== null ? Math.max(0, Math.min(100, (remain / timerSec) * 100)) : 0
  const remainUrgent = remain !== null && remain <= 2

  const stopBubble = {
    onPointerDown: (e: PointerEvent) => e.stopPropagation(),
    onClick: (e: MouseEvent) => e.stopPropagation(),
  }

  return (
    <div className={`app ${flashClass}`} {...swipe}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="progress">{progressText}</div>
          <div
            className="session-score"
            aria-label={`Bildin ${score.ok}, Bilemedin ${score.wrong}`}
          >
            <span className="score-ok">✓ {score.ok}</span>
            <span className="score-sep">·</span>
            <span className="score-bad">✗ {score.wrong}</span>
          </div>
        </div>
        <button
          type="button"
          className="menu-btn"
          aria-label="Detay"
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu((v) => !v)
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          ···
        </button>
        {showMenu && (
          <div
            className="menu-pop"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="menu-hint">Kaydır: ← → seç · ↑ onayla</p>
            <button
              type="button"
              onClick={() => {
                resetProgress()
                setShowMenu(false)
                startNewSession()
              }}
            >
              Sıfırla
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false)
                startNewSession()
              }}
            >
              Yeni oturum
            </button>
          </div>
        )}
      </header>

      <div className="timer-row" {...stopBubble}>
        {TIMER_OPTIONS.map((sec) => (
          <button
            key={sec}
            type="button"
            className={timerSec === sec ? 'timer-chip on' : 'timer-chip'}
            onClick={() => chooseTimer(sec)}
            aria-pressed={timerSec === sec}
          >
            {sec === 0 ? 'Off' : `${sec}s`}
          </button>
        ))}
        {remain !== null && !sessionOver && (
          <span
            className={`timer-count ${remainUrgent ? 'urgent' : ''}`}
            aria-live="polite"
          >
            {remain.toFixed(1)}
          </span>
        )}
      </div>
      {timerSec > 0 && remain !== null && !sessionOver && (
        <div className="timer-bar" aria-hidden>
          <div
            className={`timer-bar-fill ${remainUrgent ? 'urgent' : ''}`}
            style={{ width: `${remainPct}%` }}
          />
        </div>
      )}

      {sessionOver || !current ? (
        <div className="session-end">
          <h1>Oturum bitti</h1>
          <p>{SESSION_LEN} cümle tamamlandı.</p>
          <p className="session-score-final">
            <span className="score-ok">✓ {score.ok}</span>
            <span className="score-sep">·</span>
            <span className="score-bad">✗ {score.wrong}</span>
          </p>
          <button type="button" className="primary" onClick={startNewSession}>
            Tekrar
          </button>
        </div>
      ) : (
        <>
          <section
            className="en-area"
            style={{ transform: `translate3d(0, ${liftY}px, 0)` }}
          >
            <EnglishSentence ex={current.ex} en={current.en} />
            <p className="theme-chip">{current.t}</p>
          </section>

          <section className="tr-area">
            <p className="swipe-hint" aria-hidden>
              ← → seç · ↑ kilitle
            </p>
            <OptionStrip
              options={options}
              selected={selected}
              revealCorrect={revealCorrect}
              dragX={dragX}
            />
          </section>
        </>
      )}
    </div>
  )
}
