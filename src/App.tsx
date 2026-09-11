import { useCallback, useEffect, useRef, useState } from 'react'
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

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.95
  window.speechSynthesis.speak(u)
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
  const advanceTimer = useRef<number | null>(null)
  const doneRef = useRef(0)

  const current = !sessionOver ? (queue[0] ?? null) : null

  const rebuildOptions = useCallback((item: VocabItem) => {
    const { options: opts, correctIndex: ci } = buildOptions(item, vocab)
    setOptions(opts)
    setCorrectIndex(ci)
    setSelected(Math.floor(Math.random() * 3))
    setRevealCorrect(null)
    setFlash('none')
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
    setSessionOver(false)
    setFlash('none')
    setRevealCorrect(null)
    setLocking(false)
  }, [])

  const goNext = useCallback((wasCorrect: boolean, item: VocabItem) => {
    const nextDone = doneRef.current + 1
    doneRef.current = nextDone
    setDoneCount(nextDone)

    if (nextDone >= SESSION_LEN) {
      setSessionOver(true)
      setFlash('none')
      setRevealCorrect(null)
      setLocking(false)
      setQueue([])
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
    setLocking(false)
    setDragX(0)
    setDragY(0)
  }, [])

  const lockAnswer = useCallback(() => {
    if (!current || locking || options.length !== 3) return
    setLocking(true)
    const ok = selected === correctIndex
    setProgress((p) => recordAnswer(p, current.en, ok))
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
  }, [current, locking, options.length, selected, correctIndex, goNext])

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

  const progressText = `${Math.min(doneCount, SESSION_LEN)} / ${SESSION_LEN} cümle`
  const flashClass =
    flash === 'correct' ? 'flash-correct' : flash === 'wrong' ? 'flash-wrong' : ''
  const liftY = locking ? 0 : Math.max(-48, Math.min(0, dragY * 0.28))

  return (
    <div className={`app ${flashClass}`} {...swipe}>
      <header className="topbar">
        <div className="progress">{progressText}</div>
        <button
          type="button"
          className="menu-btn"
          aria-label="Detay"
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu((v) => !v)
          }}
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

      {sessionOver || !current ? (
        <div className="session-end">
          <h1>Oturum bitti</h1>
          <p>{SESSION_LEN} cümle tamamlandı.</p>
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
            <EnglishSentence
              ex={current.ex}
              en={current.en}
              onListen={() => speak(current.ex)}
            />
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
