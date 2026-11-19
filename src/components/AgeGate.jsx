// Asked before anything else (Nuel, Nov 10: "Ask about age before
// anything", "Our limit is 16 for now"). Email sign-up asks on the form;
// this catches accounts made with Google or Apple, and older accounts.
// A date of birth given on the sign-up page before going to Google or
// Apple is sent straight away, so nobody is asked twice.
import { useEffect, useState } from 'react'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'
import { MIN_AGE, ageOn, latestBirthDate, savedBirthDate, savedRef, clearSignUpCarryOver } from '../age.js'

export default function AgeGate() {
  const { user, setUser, logout } = useApp()
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const needs = !!user?.needsAge

  const send = async (d) => {
    setBusy(true); setError('')
    try {
      let country = ''
      try { country = localStorage.getItem('voidaj_country') || ''; localStorage.removeItem('voidaj_country') } catch { /* private mode */ }
      const u = await api.setAge(d, savedRef(), country)
      clearSignUpCarryOver()
      setUser(u)
    } catch (e) { setError(e.message) }
    setBusy(false)
  }
  useEffect(() => {
    const early = savedBirthDate()
    if (needs && early) send(early)
  }, [needs]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!needs) return null
  const age = ageOn(birthDate)
  const tooYoung = age !== null && age < MIN_AGE
  return (
    <div className="modal-backdrop age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <form className="card modal-card age-gate-card" onSubmit={(e) => { e.preventDefault(); if (age !== null && !tooYoung) send(birthDate) }}>
        <Icon name="calendar" size={28} />
        <h2 id="age-gate-title">Before anything else</h2>
        <p className="meta-dim">VOIDAJ is for people aged {MIN_AGE} and over. When were you born? Only you can see this.</p>
        <input className="job-input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={latestBirthDate()} min="1900-01-01" aria-label="Date of birth" autoFocus />
        {(tooYoung || error) && <p className="auth-error" role="alert">{tooYoung ? `Sorry — you need to be at least ${MIN_AGE} to use VOIDAJ.` : error}</p>}
        <button className="btn primary" disabled={busy || age === null || tooYoung}>{busy ? 'One moment…' : 'Continue'}</button>
        <button type="button" className="link-btn" onClick={logout}>Sign out</button>
      </form>
    </div>
  )
}
