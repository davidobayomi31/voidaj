// Trust pieces used on profiles and jobs (PLAN-NOTES-AND-GLOBAL.md):
// two-way job reviews, and blocking someone.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'
import { Avatar } from './bits.jsx'

export function Stars({ value, size = 13 }) {
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={size} className={n <= Math.round(value) ? 'on' : ''} />)}
    </span>
  )
}

// Pick 1–5 stars.
export function StarPicker({ value, onChange }) {
  return (
    <span className="stars pick" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'on' : ''} onClick={() => onChange(n)}><Icon name="star" size={22} /></button>
      ))}
    </span>
  )
}

// Someone's reviews from Quick Jobs, for the Reviews tab on a profile.
export function ReviewsPanel({ userId }) {
  const [data, setData] = useState(null)
  useEffect(() => { api.userReviews(userId).then(setData).catch(() => setData({ count: 0, reviews: [] })) }, [userId])
  if (!data) return <p className="meta-dim">Loading reviews…</p>
  if (!data.count) return <p className="meta-dim empty-note">No reviews yet. Reviews come from Quick Jobs: after a job is done, both people review each other.</p>
  return (
    <section className="card reviews-card">
      <div className="reviews-summary">
        <b>{data.average}</b><Stars value={data.average} size={16} /><span className="meta-dim">{data.count} review{data.count > 1 ? 's' : ''}</span>
      </div>
      <ul className="reviews-list">
        {data.reviews.map((r) => (
          <li key={`${r.jobId}-${r.from?.id}`}>
            <Avatar user={r.from} size={32} />
            <div>
              <span className="reviews-head"><Link to={`/profile/${r.from?.id}`}>{r.from?.name}</Link> <Stars value={r.rating} /></span>
              {r.body && <p>{r.body}</p>}
              <em className="meta-dim">{r.as === 'worker' ? 'Hired them for' : 'Worked on'} “{r.jobTitle}” · {r.ago} ago</em>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// The ••• button on someone else's profile. Connect is the one action that
// stays out on the surface; Follow, Message and Save live in here (passed as
// `children`), followed by block/unblock.
export function ProfileMore({ user, blocked: startBlocked, onChange, children, canBlock = true }) {
  const [open, setOpen] = useState(false)
  const [blocked, setBlocked] = useState(!!startBlocked)
  const wrap = useRef(null)
  useEffect(() => setBlocked(!!startBlocked), [startBlocked])
  // Click outside or Escape closes it — it now holds the main actions, so
  // leaving it open over the page would be in the way.
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [open])
  const toggle = async () => {
    if (!blocked && !window.confirm(`Block ${user.name}? They won’t be able to message you, and you won’t see their posts. You can unblock them in Settings → Privacy.`)) return
    const r = await api.toggleBlock(user.id)
    setBlocked(r.blocked); setOpen(false); onChange?.(r.blocked)
  }
  return (
    <span className="more-wrap" ref={wrap}>
      <button type="button" className="btn ghost icon-only" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name="more" size={16} /></button>
      {open && (
        <span className="more-menu card" role="menu">
          {children && <span className={`more-actions${canBlock ? '' : ' last'}`} onClick={() => setOpen(false)}>{children}</span>}
          {canBlock && (
            <button role="menuitem" type="button" onClick={toggle} className={blocked ? '' : 'danger'}>
              <Icon name={blocked ? 'check' : 'x'} size={14} /> {blocked ? `Unblock ${user.name.split(' ')[0]}` : `Block ${user.name.split(' ')[0]}`}
            </button>
          )}
        </span>
      )}
    </span>
  )
}
