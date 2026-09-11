import { splitHighlight } from '../lib/highlight'

type Props = {
  ex: string
  en: string
  onListen?: () => void
}

export function EnglishSentence({ ex, en, onListen }: Props) {
  const parts = splitHighlight(ex, en)

  return (
    <div className="en-block">
      <p className="en-sentence" lang="en">
        {parts ? (
          <>
            {parts.before}
            <mark className="en-highlight">{parts.match}</mark>
            {parts.after}
          </>
        ) : (
          ex
        )}
      </p>
      {onListen && (
        <button
          type="button"
          className="listen-btn"
          onClick={(e) => {
            e.stopPropagation()
            onListen()
          }}
          aria-label="Dinle"
          title="Dinle"
        >
          <span aria-hidden>🔊</span>
          <span className="listen-label">Dinle</span>
        </button>
      )}
    </div>
  )
}
