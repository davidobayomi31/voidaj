// Share a job or service to friends (Nuel, Nov 22: "Ability to share job or
// service updates to friends"). Uses the phone's share sheet where there is
// one, so it goes straight to WhatsApp, Messages and so on; otherwise the
// link is copied.
import { useState } from 'react'
import { Icon } from './Icons.jsx'

export function ShareLinkButton({ path, title, text = '', label = 'Share', className = 'btn ghost small' }) {
  const [note, setNote] = useState('')
  const share = async () => {
    const url = `${window.location.origin}${path}`
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); setNote('Shared') }
      else { await navigator.clipboard.writeText(url); setNote('Link copied') }
    } catch { /* closed the share sheet */ }
    setTimeout(() => setNote(''), 2500)
  }
  return (
    <button type="button" className={className} onClick={share} aria-live="polite">
      <Icon name={note ? 'check' : 'share'} size={14} /> {note || label}
    </button>
  )
}
