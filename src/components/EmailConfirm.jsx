// "Confirm your email" (PLAN-NOTES-AND-GLOBAL.md §1). New accounts get a
// 6-digit code by email. Until it's typed in, this banner sits at the top
// of the page, and posting jobs, creating events or communities and
// starting conversations wait for it.
import { useState } from 'react'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'

export default function EmailConfirm() {
  const { user, setUser } = useApp()
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [later, setLater] = useState(() => { try { return sessionStorage.getItem('voidaj_confirm_later') === '1' } catch { return false } })
  if (!user || user.emailConfirmed !== false || user.needsAge || !user.email || later) return null

  const confirm = async (e) => {
    e.preventDefault()
    if (code.replace(/\D/g, '').length !== 6 || busy) return
    setBusy(true); setError('')
    try { setUser(await api.confirmEmail(code)) } catch (err) { setError(err.message) }
    setBusy(false)
  }
  const resend = async () => {
    setError(''); setNote('')
    try {
      const r = await api.resendEmailCode()
      setNote(r.sent === false ? 'New code made. (Email isn’t switched on here yet: it’s in the server log.)' : 'New code sent. Check your inbox.')
    } catch (err) { setError(err.message) }
  }
  const dismiss = () => { setLater(true); try { sessionStorage.setItem('voidaj_confirm_later', '1') } catch { /* private mode */ } }

  return (
    <form className="email-confirm card" onSubmit={confirm} aria-label="Confirm your email">
      <Icon name="mail" size={18} />
      <span className="email-confirm-text">
        <b>Confirm your email</b>
        <em>We sent a 6-digit code to {user.email}.</em>
      </span>
      <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={7} aria-label="6-digit code" />
      <button className="btn primary small" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? 'Checking…' : 'Confirm'}</button>
      <button type="button" className="link-btn" onClick={resend}>Send a new code</button>
      <button type="button" className="icon-btn subtle" onClick={dismiss} aria-label="Remind me later"><Icon name="x" size={14} /></button>
      {(error || note) && <p className={error ? 'auth-error' : 'meta-dim'} role={error ? 'alert' : undefined}>{error || note}</p>}
    </form>
  )
}
