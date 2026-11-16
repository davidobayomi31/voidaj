// Events — screen 8 of Nuel's mockup: Upcoming · Trending · My Events,
// big photo cards with the date, place and a Join button. Join is a real
// RSVP; My Events is everything you've joined.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EVENTS, SHOW_DEMO_EVENTS } from '../data/seed.js'
import { findCommunity } from '../communities.js'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon, IconTile } from '../components/Icons.jsx'
import { categoryOf } from '../categories.js'
import { CategoryChips, CategoryTag } from '../components/Categories.jsx'
import { ReachChips, useReach } from '../components/Reach.jsx'
import { eventTimeLabel, inReach } from '../countries.js'

// Going, Interested, or waiting for a place, as one label for a button.
export const rsvpLabel = (st) => (st === 'waitlist' ? 'Waitlist' : st === 'going' ? 'Going' : st === 'requested' ? 'Requested' : 'Join')

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'trending', label: 'Trending' },
  { id: 'mine', label: 'My Events' },
]
const dayOf = (d) => new Date(d + 'T00:00:00')

function EventBig({ event, status, count, onJoin, onInterested, focused }) {
  const c = findCommunity(event.communityId)
  const d = dayOf(event.date)
  const soon = (d - new Date()) / 86400000
  const cover = event.cover ?? c?.cover
  const going = status === 'going' || status === 'waitlist' || status === 'requested'
  const full = event.capacity && count >= event.capacity
  const when = eventTimeLabel(event)
  return (
    <article id={`event-${event.id}`} className={`ev-card card-link${focused ? ' ev-focused' : ''}`} style={{ '--accent': c?.accent ?? '#3B82F6' }}>
      <Link to={`/event/${event.id}`} className="ev-photo" aria-label={event.title}>
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="ev-photo-fallback"><Icon name="calendar" size={36} /></span>}
        <span className="ev-date"><b>{d.toLocaleDateString('en-GB', { day: 'numeric' })}</b>{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
        {soon >= -0.5 && soon < 1 && <span className="ev-live">TODAY</span>}
      </Link>
      <button className={`ev-interest${status === 'interested' ? ' on' : ''}`} onClick={onInterested} aria-pressed={status === 'interested'} aria-label="Interested" title={status === 'interested' ? 'Interested' : 'Mark as interested'}><Icon name="star" size={16} /></button>
      <div className="ev-body">
        <div className="ev-text">
          <span className="ev-tags"><CategoryTag id={categoryOf(event)} />{event.format && event.format !== 'in-person' && <span className="cat-tag plain">{event.format === 'online' ? 'Online' : 'Hybrid'}</span>}</span>
          <Link to={`/event/${event.id}`} className="ev-title"><b>{event.title}</b></Link>
          <span><Icon name="clock" size={12} /> {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{when.local ? ` · ${when.local}` : ''}{when.yours ? ` (${when.yours})` : ''}</span>
          {event.venue && <span><Icon name={event.format === 'online' ? 'monitor' : 'map-pin'} size={12} /> {event.venue}</span>}
          <em>{count} going{event.capacity ? ` of ${event.capacity}` : ''} · {c ? c.name : event.audience === 'city' ? event.city || 'City' : 'Public'}</em>
        </div>
        {event.host && <Link to={`/chats?dm=${event.host}&event=${event.id}`} className="btn ghost small icon-only" aria-label="Message the host"><Icon name="message-circle" size={15} /></Link>}
        <button className={`btn small ${going ? 'ghost ev-going' : 'primary'}`} onClick={onJoin}>
          {going ? <><Icon name={status === 'going' ? 'check' : 'clock'} size={13} /> {rsvpLabel(status)}</> : status === 'invited' ? 'You’re invited' : event.inviteOnly ? 'Ask to join' : full ? 'Join waitlist' : 'Join'}
        </button>
      </div>
    </article>
  )
}

export default function Events() {
  const { user } = useApp()
  const [reach, setReach] = useReach()
  // Events you host (or co-host) count as yours too.
  const [hosting, setHosting] = useState([])
  useEffect(() => { if (user) api.myHosting().then((es) => setHosting(es.map((e) => e.id))).catch(() => {}) }, [user?.id])
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'upcoming'
  const setTab = (t) => setParams((p) => { t === 'upcoming' ? p.delete('tab') : p.set('tab', t); return p }, { replace: true })
  // ?event=<id> (a new event, or a link from Explore) scrolls to that card.
  const focus = params.get('event')
  const [made, setMade] = useState([])
  const [rsvps, setRsvps] = useState({ counts: {}, mine: [], status: {} })
  const category = params.get('category') || ''
  const setCategory = (v) => setParams((p) => { v ? p.set('category', v) : p.delete('category'); return p }, { replace: true })

  useEffect(() => { api.listEvents().then(setMade).catch(() => {}) }, [])
  useEffect(() => { api.listRsvps().then(setRsvps).catch(() => {}) }, [user?.id])

  const today = new Date().toISOString().slice(0, 10)
  const all = useMemo(() => [...made, ...EVENTS.filter((e) => !made.some((m) => m.id === e.id))], [made])
  const count = (e) => (e.attending ?? 0) + (rsvps.counts[e.id] ?? 0)
  const byDate = (a, b) => a.date.localeCompare(b.date)
  // Real upcoming events first; the demo calendar stays after them, even
  // though its dates have passed, until SHOW_DEMO_EVENTS is switched off.
  const demoIds = new Set(EVENTS.map((e) => e.id))
  const real = all.filter((e) => !demoIds.has(e.id) && e.date >= today).sort(byDate)
  const demo = SHOW_DEMO_EVENTS ? all.filter((e) => demoIds.has(e.id)).sort(byDate) : []
  const upcoming = [...real, ...demo]
  const list = {
    upcoming,
    trending: [...upcoming].sort((a, b) => count(b) - count(a)),
    mine: all.filter((e) => rsvps.mine.includes(e.id) || hosting.includes(e.id)).sort((a, b) => a.date.localeCompare(b.date)),
  }[tab].filter((e) => inReach(e, reach, user))
  const shown = category ? list.filter((e) => categoryOf(e) === category) : list
  const catCounts = list.reduce((m, e) => { const k = categoryOf(e); m[k] = (m[k] || 0) + 1; return m }, {})
  const found = !!focus && shown.some((e) => e.id === focus)
  useEffect(() => {
    if (found) document.getElementById(`event-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [found, focus])

  // Going and Interested are one answer each; the server decides whether
  // Going is a place or the waitlist, so the list is re-read after.
  const answer = async (e, status) => {
    if (!user) return navigate('/auth')
    const was = rsvps.status?.[e.id]
    const same = was === status || (status === 'going' && (was === 'waitlist' || was === 'requested'))
    const goingBefore = was === 'going'
    // Invite-only events: the server turns Going into a request.
    if (e.inviteOnly && status === 'going' && was !== 'invited') {
      try { await api.rsvp(e.id, { status }) } catch { /* re-read below */ }
      return api.listRsvps().then(setRsvps).catch(() => {})
    }
    setRsvps((r) => ({
      ...r,
      counts: { ...r.counts, [e.id]: (r.counts[e.id] ?? 0) + (goingBefore ? -1 : 0) + (!same && status === 'going' ? 1 : 0) },
      mine: !same && status === 'going' ? [...r.mine.filter((x) => x !== e.id), e.id] : r.mine.filter((x) => x !== e.id),
      status: { ...r.status, [e.id]: same ? undefined : status },
    }))
    try { await api.rsvp(e.id, { status }) } catch { /* re-read below */ }
    api.listRsvps().then(setRsvps).catch(() => {})
  }

  return (
    <div className="page ev-page">
      <header className="page-head">
        <h1>Events</h1>
        <p className="meta-dim">Discover, create and manage events.</p>
      </header>
      <div className="seg float-bar" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'mine' && rsvps.mine.length > 0 ? ` (${rsvps.mine.length})` : ''}</button>)}
      </div>
      <ReachChips value={reach} onChange={setReach} me={user} />
      <CategoryChips value={category} onChange={setCategory} counts={catCounts} />

      {shown.length === 0 ? (
        <div className="card feed-empty">
          <IconTile name="calendar" tone="pink" size={52} />
          <strong>{category ? 'No events in this category yet' : 'No events yet'}</strong>
          <span className="meta-dim">{category ? 'Try another category, or create one.' : 'Tap Join on an event and it shows up here.'}</span>
          <button className="btn primary small" onClick={() => (category ? setCategory('') : setTab('upcoming'))}>{category ? 'Show all categories' : 'See upcoming events'}</button>
        </div>
      ) : (
        <div className="ev-list stagger">
          {shown.map((e) => <EventBig key={e.id} event={e} status={rsvps.status?.[e.id]} count={count(e)} onJoin={() => answer(e, 'going')} onInterested={() => answer(e, 'interested')} focused={e.id === focus} />)}
        </div>
      )}

      <Link to={user ? '/add?pick=event' : '/auth'} className="card cm-create card-link">
        <IconTile name="plus" tone="pink" size={44} />
        <span><b>Create an event</b><em>Plan a meetup, class or gathering — for everyone, your city or a community</em></span>
        <Icon name="chevron-right" size={20} />
      </Link>
    </div>
  )
}
