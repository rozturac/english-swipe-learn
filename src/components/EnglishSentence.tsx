import { splitHighlight } from '../lib/highlight'

type Props = {
  ex: string
  en: string
}

export function EnglishSentence({ ex, en }: Props) {
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
    </div>
  )
}
