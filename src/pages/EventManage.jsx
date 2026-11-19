// Manage an event (Nuel's Events note, PLAN-NOTES-AND-GLOBAL.md §3): for
// the people running it. Numbers at the top, then join requests (invite-
// only events), announcements, everyone registered — including people who
// keep themselves off the public list — invites, co-hosts and moderators,
// editing, and the Event Circle.
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon, IconTile } from '../components/Icons.jsx'
import { Avatar } from '../components/bits.jsx'
import { EventForm } from '../components/EventForm.jsx'
import { eventTimeLabel } from '../countries.js'

const ROLE_LABEL = { creator: 'Creator', cohost: 'Co-host', moderator: 'Moderator' }

function Person({ entry, children }) {
  const u = entry.user
  return (
    <li>
      <Link to={`/profile/${u.id}`} className="evd-person"><Avatar user={u} size={38} />
        <span><b>{u.name}</b><em>{u.handle}{entry.visible === false ? ' · private' : ''}</em></span></Link>
      {children && <span className="evm-actions">{children}</span>}
    </li>
  )
}

function ByHandle({ label, button, onSubmit, roles }) {
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState(roles?.[0]?.id)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!handle.trim() || busy) return
    setBusy(true); setNote('')
    try { await onSubmit(handle.trim(), role); setHandle(''); setNote('Done.') } catch (err) { setNote(err.message) }
    setBusy(false)
  }
  return (
    <form className="evm-handle" onSubmit={submit}>
      <span className="settings-prefixed"><span>@</span><input value={handle} onChange={(e) => setHandle(e.target.value.replace(/^@/, ''))} placeholder="username" aria-label={label} /></span>
      {roles && (
        <select className="job-select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      )}
      <button className="btn primary small" disabled={!handle.trim() || busy}>{button}</button>
      {note && <em className="meta-dim">{note}</em>}
    </form>
  )
}

export default function EventManage() {
  const { id } = useParams()
  const { user, loading } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState('going')

  const load = () => api.manageEvent(id).then(setData).catch((e) => setError(e.message))
  useEffect(() => { if (user) load() }, [id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="page"><p className="meta-dim">Loading…</p></div>
  if (!user) return <Navigate to="/auth" replace />
  if (error) {
    return (
      <div className="page"><div className="card feed-empty">
        <IconTile name="lock" tone="pink" size={52} /><strong>{error}</strong>
        <Link className="btn primary small" to={`/event/${id}`}>Back to the event</Link>
      </div></div>
    )
  }
  if (!data) return <div className="page"><p className="meta-dim">Loading…</p></div>

  const { event, stats, role } = data
  const manager = role === 'creator' || role === 'cohost'
  const run = async (fn) => { try { await fn(); await load() } catch (e) { alert(e.message) } }
  const post = async (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    await run(() => api.announce(id, draft.trim()))
    setDraft('')
  }
  const when = eventTimeLabel(event)
  const lists = [
    { id: 'going', label: 'Going', people: data.going },
    { id: 'waitlist', label: 'Waitlist', people: data.waitlist },
    { id: 'interested', label: 'Interested', people: data.interested },
    { id: 'invited', label: 'Invited', people: data.invited },
  ]
  const shown = lists.find((l) => l.id === tab)

  return (
    <div className="page evm-page">
      <header className="page-head">
        <h1>Manage event</h1>
        <p className="meta-dim"><Link to={`/event/${id}`}>{event.title}</Link> · {new Date(event.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{when.local ? ` · ${when.local}` : ''} · You’re the {ROLE_LABEL[role].toLowerCase()}</p>
      </header>

      <div className="evm-stats">
        <span><b>{stats.going}</b>Going</span>
        <span><b>{stats.interested}</b>Interested</span>
        {stats.capacity != null && <span><b>{stats.placesLeft}</b>Places left</span>}
        <span><b>{stats.waitlist}</b>Waitlist</span>
        {event.inviteOnly && <span><b>{stats.requested}</b>Requests</span>}
        <span><b>{stats.hidden}</b>Private</span>
      </div>

      <div className="evd-actions evm-top">
        {manager && <button className="btn ghost" onClick={() => setEditing((v) => !v)}><Icon name="edit" size={15} /> {editing ? 'Close editing' : 'Edit event'}</button>}
        <button className="btn ghost" onClick={() => navigate(`/chats?tab=groups&chat=${data.circleId}`)}><Icon name="chat" size={15} /> Event Circle</button>
        <Link className="btn ghost" to={`/event/${id}`}><Icon name="eye" size={15} /> See the event page</Link>
      </div>

      {editing && <EventForm editing={event} heading="Edit event" onCancel={() => setEditing(false)} onCreated={() => { setEditing(false); load() }} />}

      {data.requested.length > 0 && (
        <section className="card evd-section">
          <h2>Asking to join <span className="meta-dim">· {data.requested.length}</span></h2>
          <ul className="evd-people">
            {data.requested.map((r) => (
              <Person key={r.user.id} entry={r}>
                <button className="btn primary small" onClick={() => run(() => api.answerRequest(id, r.user.id, 'approve'))}>Approve</button>
                <button className="btn ghost small" onClick={() => run(() => api.answerRequest(id, r.user.id, 'decline'))}>Decline</button>
              </Person>
            ))}
          </ul>
        </section>
      )}

      <section className="card evd-section">
        <h2><Icon name="megaphone" size={17} /> Announcements</h2>
        <p className="meta-dim">Everyone going, waiting or invited sees these on the event page.</p>
        <form className="evm-announce" onSubmit={post}>
          <textarea className="composer-body" rows={2} maxLength={600} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Doors open at 6:30. Bring your ID." />
          <button className="btn primary small" disabled={!draft.trim()}>Post</button>
        </form>
        {data.announcements.length > 0 && (
          <ul className="evd-news-list">
            {data.announcements.map((a) => (
              <li key={a.id}>
                <p>{a.body}</p>
                <em className="meta-dim">{a.author?.name} · {new Date(a.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</em>
                <button className="link-btn" onClick={() => run(() => api.deleteAnnouncement(id, a.id))}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card evd-section">
        <h2>Registered</h2>
        <div className="chip-row" role="tablist" aria-label="Who">
          {lists.map((l) => <button key={l.id} role="tab" aria-selected={tab === l.id} className={tab === l.id ? 'on' : ''} onClick={() => setTab(l.id)}>{l.label} · {l.people.length}</button>)}
        </div>
        {shown.people.length === 0 ? <p className="meta-dim">No one here yet.</p> : (
          <ul className="evd-people">
            {shown.people.map((p) => (
              <Person key={p.user.id} entry={p}>
                {p.user.id !== event.creatorId && tab !== 'interested' && (
                  <button className="btn ghost small" onClick={() => { if (window.confirm(`Take ${p.user.name} off this event?`)) run(() => api.removeAttendee(id, p.user.id)) }}>Remove</button>
                )}
              </Person>
            ))}
          </ul>
        )}
        <h3 className="evm-sub">Invite someone</h3>
        <ByHandle label="Username to invite" button="Invite" onSubmit={(h) => api.inviteToEvent(id, h).then(load)} />
      </section>

      <section className="card evd-section">
        <h2>Hosts</h2>
        <p className="meta-dim">Co-hosts can do everything here. Moderators can post announcements, approve requests and remove people.</p>
        <ul className="evd-people">
          {data.hosts.map((h) => (
            <Person key={h.user.id} entry={{ ...h, visible: true }}>
              <span className="cat-tag plain">{ROLE_LABEL[h.role]}</span>
              {h.role !== 'creator' && (manager || h.user.id === user.id) && (
                <button className="btn ghost small" onClick={() => run(() => api.removeEventHost(id, h.user.id))}>{h.user.id === user.id ? 'Step down' : 'Remove'}</button>
              )}
            </Person>
          ))}
        </ul>
        {manager && (
          <ByHandle label="Username to add as host" button="Add" roles={[{ id: 'cohost', label: 'Co-host' }, { id: 'moderator', label: 'Moderator' }]}
            onSubmit={(h, r) => api.addEventHost(id, h, r).then(load)} />
        )}
      </section>
    </div>
  )
}
