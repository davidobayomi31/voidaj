// ID verification: a photo of an official ID and a selfie holding it,
// checked by a person on the VOIDAJ team (server/id-checks.js). Used in
// Settings → Verification and the Quick Jobs "Get verified" window.
import { useEffect, useRef, useState } from 'react'
import * as api from '../api.js'
import { useApp } from '../state.jsx'
import { Icon } from './Icons.jsx'
import { compressPhoto } from './Media.jsx'

const DOC_TYPES = {
  nin: 'NIN slip or card',
  passport: 'International passport',
  drivers: 'Driver’s licence',
  voters: 'Voter’s card',
}

function PhotoPick({ label, hint, value, onChange, selfie }) {
  const ref = useRef(null)
  const [error, setError] = useState('')
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    try { onChange((await compressPhoto(f)).src) } catch (err) { setError(err.message) }
  }
  return (
    <div className="idv-photo">
      <input ref={ref} type="file" accept="image/*" capture={selfie ? 'user' : 'environment'} hidden onChange={pick} />
      <button type="button" className={`idv-drop ${value ? 'has' : ''}`} onClick={() => ref.current?.click()}>
        {value
          ? <img src={value} alt={label} />
          : <span><Icon name={selfie ? 'user' : 'camera'} size={22} /><b>{label}</b><em>{hint}</em></span>}
      </button>
      {value && <button type="button" className="btn ghost small" onClick={() => ref.current?.click()}>Retake</button>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}

const when = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')

export function IdVerify({ onDone }) {
  const { user, refreshMe } = useApp()
  const [state, setState] = useState(null)
  const [form, setForm] = useState({ docType: 'nin', legalName: '', document: '', selfie: '', consent: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(false)

  useEffect(() => { api.myVerification().then(setState).catch((e) => setError(e.message)) }, [])

  if (user?.features?.idVerification === false && !user?.idVerified) {
    return <p className="meta-dim">ID verification isn’t available in your country yet.</p>
  }
  if (user?.idVerified || state?.verified) {
    return <p className="settings-ok"><Icon name="badge-check" size={16} /> You’re verified. Your ID was checked by the VOIDAJ team.</p>
  }
  if (!state) return <p className="meta-dim">{error || 'Loading…'}</p>

  const check = state.check
  if (check?.status === 'pending') {
    return (
      <div className="idv-status">
        <Icon name="clock" size={18} />
        <p><b>Your {check.docLabel} is being checked.</b><br />
          <span className="meta-dim">Sent {when(check.submittedAt)}. Someone on the VOIDAJ team looks at it, usually within a day or two. Your Verified badge appears as soon as it’s approved.</span></p>
      </div>
    )
  }
  if (check?.status === 'rejected' && !retry) {
    return (
      <div className="idv-status bad">
        <Icon name="info" size={18} />
        <p><b>We couldn’t verify that ID.</b><br />
          <span className="meta-dim">“{check.reason}”</span></p>
        <button className="btn primary small" onClick={() => setRetry(true)}>Try again</button>
      </div>
    )
  }

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }))
  const ready = form.legalName.trim().length >= 3 && form.document && form.selfie && form.consent

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !ready) return
    setBusy(true); setError('')
    try {
      const c = await api.sendVerification(form)
      setState((s) => ({ ...s, check: c })); setRetry(false)
      await refreshMe?.()
      onDone?.(c)
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <form className="idv-form" onSubmit={submit}>
      <p className="meta-dim">
        A person on the VOIDAJ team checks your ID by eye. As soon as it’s decided, both photos are
        deleted. We keep only whether you passed. Nobody else ever sees them.
      </p>
      <label className="field">
        <span><Icon name="badge-check" size={14} /> Type of ID</span>
        <select className="job-select" value={form.docType} onChange={set('docType')}>
          {Object.entries(state.docTypes || DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="field">
        <span><Icon name="user" size={14} /> Full name, exactly as on the ID</span>
        <input value={form.legalName} onChange={set('legalName')} autoComplete="name" maxLength={100} />
      </label>
      <div className="idv-photos">
        <PhotoPick label="Photo of your ID" hint="Front, flat, all four corners, no glare" value={form.document} onChange={set('document')} />
        <PhotoPick selfie label="Selfie holding the ID" hint="Your face and the ID both clear" value={form.selfie} onChange={set('selfie')} />
      </div>
      <label className="admin-check">
        <input type="checkbox" checked={form.consent} onChange={set('consent')} />
        <span>I agree to VOIDAJ checking this ID against my selfie. The photos are deleted once it’s decided.</span>
      </label>
      {error && <p className="auth-error"><Icon name="x" size={14} /> {error}</p>}
      <button className="btn primary small" disabled={busy || !ready}>{busy ? 'Sending…' : 'Send for checking'}</button>
    </form>
  )
}
