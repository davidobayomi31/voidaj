// Collect funds for an event (Nuel, Nov 21: "we can collect funds for
// events"). The host turns it on (a goal and a note are optional) and
// people give through Paystack, straight to the host's bank account. VOIDAJ
// never holds the money. Shows nothing when payments aren't switched on and
// the event isn't collecting.
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'

const naira = (kobo) => `₦${(Number(kobo) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`

export function EventFunds({ event }) {
  const { user } = useApp()
  const [params, setParams] = useSearchParams()
  const [f, setF] = useState(null)
  const [amount, setAmount] = useState('')
  const [goal, setGoal] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [thanks, setThanks] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = () => api.eventFunds(event.id).then((d) => { setF(d); setGoal(d.goal ? String(d.goal / 100) : ''); setNote(d.note || '') }).catch(() => {})
  useEffect(() => { load() }, [event.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Back from Paystack: check the reference with the server, then tidy the address.
  const back = params.get('paystack')
  const reference = params.get('reference') || params.get('trxref')
  useEffect(() => {
    if (back !== 'fund' || !reference) return
    api.verifyPayment(reference)
      .then((r) => { if (r.ok) setThanks(true); else setError('That payment didn’t go through.') })
      .catch((e) => setError(e.message))
      .finally(() => {
        load()
        setParams((p) => { p.delete('paystack'); p.delete('reference'); p.delete('trxref'); return p }, { replace: true })
      })
  }, [back, reference]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!f || (!f.open && !f.isHost) || (!f.paymentsOn && !f.open)) return null

  const give = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { const { url } = await api.eventFundCheckout(event.id, amount); window.location.assign(url) }
    catch (err) { setError(err.message); setBusy(false) }
  }
  const save = async (open) => {
    setBusy(true); setError('')
    try { setF(await api.setEventFunds(event.id, { open, goal, note })); setEditing(false) } catch (err) { setError(err.message) }
    setBusy(false)
  }
  const pct = f.goal ? Math.min(100, Math.round((f.raised / f.goal) * 100)) : 0

  return (
    <section className="card evd-section evd-funds">
      <h2><Icon name="hand-coins" size={18} /> Support this event</h2>
      {f.open && (
        <>
          {f.note && <p>{f.note}</p>}
          <p className="evd-funds-total"><b>{naira(f.raised)}</b> raised{f.goal ? <> of {naira(f.goal)}</> : null} · {f.count} {f.count === 1 ? 'gift' : 'gifts'}</p>
          {f.goal ? <div className="evd-funds-bar" role="img" aria-label={`${pct}% of the goal`}><span style={{ width: `${pct}%` }} /></div> : null}
          {thanks && <p className="evd-funds-thanks"><Icon name="check" size={14} /> Thank you. Your gift went through.</p>}
          {user ? (
            <form className="evd-funds-form" onSubmit={give}>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₦5,000" inputMode="decimal" aria-label="Amount to give" />
              <button className="btn primary" disabled={busy || !amount.trim()}>{busy ? 'One moment…' : 'Give'}</button>
            </form>
          ) : <Link to="/auth" className="btn primary small">Sign in to give</Link>}
          <p className="meta-dim">Paid by card or bank through Paystack, straight to the host’s bank account. A small processing fee is added at checkout. VOIDAJ never holds the money, so give only to people you know and trust.</p>
        </>
      )}
      {f.isHost && (
        <div className="evd-funds-host">
          {!f.paymentsOn && <p className="meta-dim">Collecting funds isn’t switched on for VOIDAJ yet.</p>}
          {f.paymentsOn && !f.hasPayout && <p className="meta-dim">Add the bank account you want paid into first: <Link to="/settings/payments">Settings → Payments</Link>.</p>}
          {f.paymentsOn && !editing && <button type="button" className="btn ghost small" onClick={() => (f.open ? setEditing(true) : setEditing(true))}>{f.open ? 'Edit funds' : 'Collect funds for this event'}</button>}
          {editing && (
            <div className="evd-funds-edit">
              <label className="field"><span>Goal <em>optional</em></span><input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="₦200,000" inputMode="decimal" /></label>
              <label className="field"><span>What is it for?</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Venue, food and sound" maxLength={240} /></label>
              <div className="composer-foot">
                <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>Cancel</button>
                {f.open && <button type="button" className="btn ghost small" disabled={busy} onClick={() => save(false)}>Stop collecting</button>}
                <button type="button" className="btn primary small" disabled={busy} onClick={() => save(true)}>{f.open ? 'Save' : 'Start collecting'}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  )
}
