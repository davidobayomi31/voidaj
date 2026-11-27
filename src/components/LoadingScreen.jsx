// The start-up screen (Nuel, Nov 24): "just the vj logo and the loading
// animation at the bottom", nothing else. A dark screen with the VJ mark and
// five bars that rise and fall. It stays up while the first session check
// runs, for at least a moment so it never flashes, then fades out.
import { useEffect, useState } from 'react'
import { VjMark } from './VoidajMark.jsx'

const MIN_MS = 700
const FADE_MS = 350

export default function LoadingScreen({ ready }) {
  const [minDone, setMinDone] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => { const t = setTimeout(() => setMinDone(true), MIN_MS); return () => clearTimeout(t) }, [])
  const leaving = ready && minDone
  useEffect(() => {
    if (!leaving) return undefined
    const t = setTimeout(() => setGone(true), FADE_MS)
    return () => clearTimeout(t)
  }, [leaving])

  if (gone) return null
  return (
    <div className={`loadscreen ${leaving ? 'leaving' : ''}`} role="status" aria-label="Loading">
      <VjMark size={64} title="" className="loadscreen-mark" />
      <span className="loadscreen-bars" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </span>
    </div>
  )
}
