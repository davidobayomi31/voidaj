// One event, opened from its card (Nuel, Oct 29: "when I tap on this I
// would like it to show details about it and the organizers"). Cover,
// date, time and place, what it's about, who is organising it (with a
// message button), and who's going. Join is the same RSVP as the list.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EVENTS } from '../data/seed.js'
import { useSeo, isSampleId } from '../seo.js'
import { findCommunity } from '../communities.js'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon, IconTile } from '../components/Icons.jsx'
import { EventFunds } from '../components/EventFunds.jsx'
import { Avatar } from '../components/bits.jsx'
import { categoryOf } from '../categories.js'
import { CategoryTag } from '../components/Categories.jsx'
import { icsFor } from '../ics.js'
import { eventTimeLabel, flagOf } from '../countries.js'


const dayOf = (d) => new Date(d + 'T00:00:00')

export default function EventDetail() {
  const { id } = useParams()
  const { user } = useApp()
  const navigate = useNavigate()
  const demo = useMemo(() => EVENTS.find((e) => e.id === id), [id])
  const [made, setMade] = useState(null)
  const [people, setPeople] = useState({ organizers: [], going: [], hiddenGoing: 0, totals: null })
  const [rsvps, setRsvps] = useState({ counts: {}, mine: [], status: {}, visible: {} })
  const [reported, setReported] = useState(false)
  // Announcements from the hosts, and whether you're one of them.
  const [news, setNews] = useState({ announcements: [], canSee: false, total: 0, role: null })
  const [loaded, setLoaded] = useState(false)

  const event = made ?? demo
  useSeo(event ? { title: event.title, description: event.description, noindex: !!demo || isSampleId(event.id) || !!event.sample } : {})
  useEffect(() => { window.scrollTo(0, 0) }, [id])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const qs = new URLSearchParams()
    if (demo?.host) qs.set('host', demo.host)
    if (demo?.communityId) qs.set('community', demo.communityId)
    api.eventPeople(id, Object.fromEntries(qs))
      .then((d) => { if (d.event) setMade(d.event); setPeople({ organizers: d.organizers || [], going: d.going || [], hiddenGoing: d.hiddenGoing || 0, totals: d.totals || null }) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [id, demo, tick])
  useEffect(() => { api.listRsvps().then(setRsvps).catch(() => {}) }, [user?.id])
  useEffect(() => { api.eventAnnouncements(id).then(setNews).catch(() => {}) }, [id, user?.id, tick])

  if (!event) {
    return (
      <div className="page">
        <div className="card feed-empty">
          <IconTile name="calendar" tone="pink" size={52} />
          <strong>{loaded ? 'Event not found' : 'Loading…'}</strong>
          {loaded && <Link className="btn primary small" to="/events">See all events</Link>}
        </div>
      </div>
    )
  }

  const c = findCommunity(event.communityId)
  const d = dayOf(event.date)
  const status = rsvps.status?.[event.id]
  const going = status === 'going' || status === 'waitlist'
  const host = !!news.role
  const when = eventTimeLabel(event)
  const count = (event.attending ?? 0) + (rsvps.counts[event.id] ?? 0)
  const interested = rsvps.interested?.[event.id] ?? 0
  const visible = !!rsvps.visible?.[event.id]
  const cover = event.cover || c?.cover
  const where = c ? c.name : event.audience === 'city' ? event.city || 'Your city' : 'Public'
  const full = event.capacity && count >= event.capacity
  const spots = event.capacity ? Math.max(0, event.capacity - count) : null

  const refresh = () => { api.listRsvps().then(setRsvps).catch(() => {}); setTick((n) => n + 1) }
  const answer = async (want) => {
    if (!user) return navigate('/auth')
    try { await api.rsvp(event.id, { status: want }) } catch { /* re-read below */ }
    refresh()
  }
  const openCircle = async () => {
    try { navigate(`/chats?tab=groups&chat=${await api.eventCircle(event.id)}`) } catch (e) { alert(e.message) }
  }
  const toggleVisible = async () => {
    try { await api.rsvp(event.id, { visible: !visible, visibleOnly: true }) } catch { /* re-read below */ }
    refresh()
  }
  const addToCalendar = () => {
    const blob = new Blob([icsFor(event, `${location.origin}/event/${event.id}`)], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${event.title.replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40) || 'event'}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const report = async () => {
    if (!user) return navigate('/auth')
    const reason = window.prompt('What’s wrong with this event? (optional)')
    if (reason === null) return
    try { await api.reportEvent(event.id, reason); setReported(true) } catch (e) { alert(e.message) }
  }
  const share = async () => {
    const url = `${location.origin}/event/${event.id}`
    try { if (navigator.share) await navigator.share({ title: event.title, url }); else await navigator.clipboard.writeText(url) } catch { /* closed */ }
  }

  return (
    <div className="page evd-page">
      <article className="card evd-hero" style={{ '--accent': c?.accent ?? '#3B82F6' }}>
        <div className="evd-cover">
          {cover ? <img src={cover} alt="" /> : <span className="ev-photo-fallback"><Icon name="calendar" size={48} /></span>}
          <span className="ev-date"><b>{d.toLocaleDateString('en-GB', { day: 'numeric' })}</b>{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
        </div>
        <div className="evd-main">
          <span className="ev-tags"><CategoryTag id={categoryOf(event)} short={false} />{event.format && event.format !== 'in-person' && <span className="cat-tag plain">{event.format === 'online' ? 'Online' : 'Hybrid'}</span>}</span>
          <h1>{event.title}</h1>
          {event.ended && <p className="ended-note"><Icon name="clock" size={13} /> This event has ended. It no longer shows in lists.</p>}
          <ul className="evd-facts">
            <li><Icon name="calendar" size={16} /> {d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{when.local ? ` · ${when.local}` : ''}{when.yours && <em className="evd-yours"> ({when.yours})</em>}</li>
            {event.venue && <li><Icon name={event.format === 'online' ? 'monitor' : 'map-pin'} size={16} /> {event.venue}</li>}
            <li><Icon name={c ? 'community' : event.audience === 'city' ? 'map-pin' : 'globe'} size={16} /> {c ? <Link to={`/community/${c.id}?tab=events`}>{where}</Link> : where}{event.country && event.country !== 'NG' ? ` ${flagOf(event.country)}` : ''}</li>
            {event.inviteOnly && <li><Icon name="lock" size={16} /> Invite only — the hosts approve who comes</li>}
            <li><Icon name="users" size={16} /> {count} going{interested ? ` · ${interested} interested` : ''}{spots !== null ? ` · ${spots ? `${spots} place${spots === 1 ? '' : 's'} left` : 'Full'}` : ''}</li>
          </ul>
          {status === 'invited' && <p className="evd-invited"><Icon name="mail" size={15} /> You’re invited. Tap Going to take your place.</p>}
          <div className="evd-actions">
            <button className={`btn ${going || status === 'requested' ? 'ghost ev-going' : 'primary'}`} onClick={() => answer('going')}>
              {status === 'waitlist' ? <><Icon name="clock" size={15} /> On the waitlist</>
                : going ? <><Icon name="check" size={15} /> Going</>
                : status === 'requested' ? <><Icon name="clock" size={15} /> Request sent</>
                : status === 'invited' ? 'Going'
                : event.inviteOnly && !host ? 'Ask to join'
                : full ? 'Join the waitlist' : 'Join event'}
            </button>
            <button className={`btn ghost${status === 'interested' ? ' ev-going' : ''}`} onClick={() => answer('interested')} aria-pressed={status === 'interested'}><Icon name="star" size={15} /> Interested</button>
            <button className="btn ghost" onClick={share}><Icon name="share" size={15} /> Share</button>
            <button className="btn ghost" onClick={addToCalendar}><Icon name="calendar" size={15} /> Add to calendar</button>
            {made && (status === 'going' || host) && <button className="btn ghost" onClick={openCircle}><Icon name="chat" size={15} /> Event Circle</button>}
            {host && <Link className="btn ghost" to={`/event/${event.id}/manage`}><Icon name="settings" size={15} /> Manage</Link>}
          </div>
          {going && (
            <label className="evd-visible">
              <input type="checkbox" checked={visible} onChange={toggleVisible} />
              <span>Show me on the attendee list <em>Off by default — others only see how many people are going.</em></span>
            </label>
          )}
        </div>
      </article>

      {made && (news.canSee ? news.announcements.length > 0 : news.total > 0) && (
        <section className="card evd-section evd-news">
          <h2><Icon name="megaphone" size={17} /> Announcements</h2>
          {news.canSee ? (
            <ul>
              {news.announcements.map((a) => (
                <li key={a.id}><Avatar user={a.author} size={30} /><div><p>{a.body}</p><em className="meta-dim">{a.author?.name} · {new Date(a.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</em></div></li>
              ))}
            </ul>
          ) : <p className="meta-dim">The hosts have posted {news.total} update{news.total > 1 ? 's' : ''} for people going.</p>}
        </section>
      )}

      <EventFunds event={event} />

      {event.description && (
        <section className="card evd-section">
          <h2>About this event</h2>
          <p>{event.description}</p>
          {event.tags?.length > 0 && <div className="evd-tags">{event.tags.map((t) => <Link key={t} to={`/tag/${t.replace(/[^a-z0-9_]/gi, '').toLowerCase()}`}>#{t}</Link>)}</div>}
        </section>
      )}

      <section className="card evd-section">
        <h2>Organisers</h2>
        {people.organizers.length === 0 && <p className="meta-dim">{loaded ? 'No organiser listed yet.' : 'Loading…'}</p>}
        <ul className="evd-people">
          {people.organizers.map(({ user: u, role }) => (
            <li key={u.id}>
              <Link to={`/profile/${u.id}`} className="evd-person"><Avatar user={u} size={44} /><span><b>{u.name}</b><em>{role}{u.handle ? ` · ${u.handle}` : ''}</em></span></Link>
              {user?.id !== u.id && <Link className="btn ghost small" to={user ? `/chats?dm=${u.id}&event=${event.id}` : '/auth'}><Icon name="message-circle" size={14} /> Message</Link>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card evd-section">
        <h2>Who’s going <span className="meta-dim">· {count}</span></h2>
        {people.going.length === 0
          ? <p className="meta-dim">{people.hiddenGoing ? `${people.hiddenGoing} going, keeping it private.` : 'Tap Join to go. You choose whether you show up here.'}</p>
          : <>
              <div className="evd-faces">{people.going.slice(0, 24).map((u) => <Link key={u.id} to={`/profile/${u.id}`} title={u.name}><Avatar user={u} size={38} /></Link>)}</div>
              {people.hiddenGoing > 0 && <p className="meta-dim">+ {people.hiddenGoing} more keeping it private</p>}
            </>}
      </section>

      <button className="link-btn evd-report" onClick={report} disabled={reported}><Icon name="flag" size={13} /> {reported ? 'Reported — thank you' : 'Report this event'}</button>
    </div>
  )
}
