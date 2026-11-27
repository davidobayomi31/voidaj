// The event form, shared by Add Hub and a community's Events tab. Given a
// `community` it's fixed to that community; without one it starts Public
// and lets you pick Public, your City or one of your communities — events
// don't have to go through a community (Nuel, Oct 28).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../state.jsx'
import { findCommunity } from '../communities.js'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'
import { AUDIENCES } from './Feed.jsx'
import { CoverPicker } from './CoverPicker.jsx'
import { CategorySelect } from './Categories.jsx'
import { deviceTimeZone } from '../countries.js'

// How people attend (Nuel's Events notes, Nov 9).
export const EVENT_FORMATS = [
  { id: 'in-person', label: 'In person', icon: 'map-pin' },
  { id: 'online', label: 'Online', icon: 'monitor' },
  { id: 'hybrid', label: 'Hybrid', icon: 'globe' },
]

const blank = { title: '', date: '', time: '', venue: '', description: '', cover: '', category: '', format: 'in-person', capacity: '', inviteOnly: false, keepFor: '' }

// An unfinished event is kept on this device as a draft (Events note:
// "save drafts"), one per place the form is opened from.
const draftKey = (community) => `voidaj_event_draft_${community?.id || 'open'}`
const readDraft = (community) => { try { return JSON.parse(localStorage.getItem(draftKey(community)) || 'null') } catch { return null } }
const writeDraft = (community, form) => {
  try {
    if (form.title.trim() || form.description.trim()) localStorage.setItem(draftKey(community), JSON.stringify({ ...form, cover: '' }))
    else localStorage.removeItem(draftKey(community))
  } catch { /* private mode */ }
}

// `editing` is an existing event: the same form, filled in, saving changes.
export function EventForm({ community, onCreated, onCancel, heading, editing }) {
  const { profile } = useApp()
  const [form, setForm] = useState(() => editing
    ? { ...blank, ...editing, capacity: editing.capacity ?? '', category: editing.category || '', inviteOnly: !!editing.inviteOnly }
    : { ...blank, ...(readDraft(community) || {}) })
  const [hadDraft] = useState(() => !editing && !!readDraft(community))
  useEffect(() => { if (!editing) writeDraft(community, form) }, [form]) // eslint-disable-line react-hooks/exhaustive-deps
  const [audience, setAudience] = useState(community ? 'community' : 'public')
  const [communityId, setCommunityId] = useState(community?.id ?? profile.communities[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const today = new Date().toISOString().slice(0, 10)
  const city = profile.city || 'your city'
  const mine = profile.communities.map(findCommunity).filter(Boolean)
  const ready = form.title.trim() && form.date && form.category && (editing || audience !== 'community' || communityId)

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true); setError('')
    try {
      if (editing) {
        onCreated(await api.updateEvent(editing.id, { ...form, capacity: form.capacity === '' ? null : form.capacity }))
        setBusy(false)
        return
      }
      // The time is in the zone of the device making it (shown to others
      // as "6:00 PM WAT", with their own time beside it).
      const body = { ...form, timezone: deviceTimeZone() }
      const ev = community
        ? await api.createEvent(community.id, body)
        : await api.createOpenEvent({ ...body, audience, communityId: audience === 'community' ? communityId : undefined })
      setForm(blank)
      writeDraft(community, blank)
      onCreated(ev)
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <form className="card composer-full event-form" onSubmit={submit}>
      {heading && <div className="side-card-head"><Icon name="calendar" size={15} /> {heading}</div>}
      {hadDraft && <p className="meta-dim ev-draft-note"><Icon name="edit" size={13} /> Picking up your draft. <button type="button" className="link-btn" onClick={() => setForm(blank)}>Start again</button></p>}
      {!community && !editing && (
        <>
          <div className="fc-audience" role="radiogroup" aria-label="Who is this event for?">
            {AUDIENCES.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={audience === a.id} className={audience === a.id ? 'on' : ''} onClick={() => setAudience(a.id)}>
                <Icon name={a.icon} size={14} /> {a.id === 'city' ? city : a.label}
              </button>
            ))}
          </div>
          {audience === 'community' && (
            mine.length ? (
              <select className="job-select" value={communityId} onChange={(e) => setCommunityId(e.target.value)} aria-label="Community">
                {mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : <p className="meta-dim">Join a community first to make an event in it. <Link to="/communities">Find one</Link></p>
          )}
        </>
      )}
      <input className="composer-title" value={form.title} onChange={set('title')} placeholder="What’s happening?" maxLength={100} autoFocus aria-label="Event title" />
      <div className="job-form-row two">
        <input className="job-input" type="date" min={today} value={form.date} onChange={set('date')} aria-label="Date" required />
        <input className="job-input" value={form.time} onChange={set('time')} placeholder="Time (e.g. 6:00 PM)" maxLength={20} aria-label="Time" />
      </div>
      <div className="job-form-row two">
        <CategorySelect value={form.category} onChange={(category) => setForm((f) => ({ ...f, category }))} />
        <input className="job-input" type="number" min="1" inputMode="numeric" value={form.capacity} onChange={set('capacity')} placeholder="Capacity (optional)" aria-label="Capacity" />
      </div>
      <div className="fc-audience" role="radiogroup" aria-label="How do people attend?">
        {EVENT_FORMATS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={form.format === f.id} className={form.format === f.id ? 'on' : ''} onClick={() => setForm((x) => ({ ...x, format: f.id }))}>
            <Icon name={f.icon} size={14} /> {f.label}
          </button>
        ))}
      </div>
      <input className="job-input" value={form.venue} onChange={set('venue')} placeholder={form.format === 'online' ? 'Link or platform (e.g. Zoom, Google Meet)' : 'Where? (venue or area)'} maxLength={100} aria-label="Venue" />
      <textarea className="composer-body" value={form.description} onChange={set('description')} placeholder="Tell people what to expect (optional)" rows={3} maxLength={600} />
      <CoverPicker kind="event" label="Event photo (optional)" value={form.cover} onChange={(cover) => setForm((f) => ({ ...f, cover }))} onBusy={setUploading} />
      {!editing && (
        <label className="field">
          <span>Keep this event up for <em>after the day it happens</em></span>
          <select value={form.keepFor} onChange={set('keepFor')}>
            <option value="">No end. Keep it up</option>
            <option value="1w">1 week</option>
            <option value="1m">1 month</option>
            <option value="3m">3 months</option>
          </select>
        </label>
      )}
      <label className="evd-visible ev-invite-only">
        <input type="checkbox" checked={!!form.inviteOnly} onChange={(e) => setForm((f) => ({ ...f, inviteOnly: e.target.checked }))} />
        <span>Invite only <em>People ask to join and you approve them, or you invite them yourself.</em></span>
      </label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="composer-foot">
        {onCancel && <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>}
        <button className="btn primary small" disabled={!ready || busy || uploading}>{busy ? (editing ? 'Saving…' : 'Creating…') : editing ? 'Save changes' : 'Create event'}</button>
      </div>
    </form>
  )
}
