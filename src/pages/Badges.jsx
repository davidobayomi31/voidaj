// VOIDAJ Badges — screens 12–14 of Nuel's mockup v2.0 (Nov 2):
// "Recognize, reward and express your journey on VOIDAJ."
//   My Badges — what you've earned and made, plus your citizen level.
//   Discover  — every badge and how to earn it.
//   Create    — make your own (name + style). Earn · Gift · Buy along the
//               top: Gift and Buy wait for payments, so they say so.
// Tapping a badge opens its details, where you can show or hide it.
import { useEffect, useRef, useState } from 'react'
import { compressPhoto } from '../components/Media.jsx'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon } from '../components/Icons.jsx'

export const BADGE_STYLES = ['violet', 'blue', 'teal', 'gold', 'red', 'green', 'orange', 'silver']
const ICON = { origin: 'globe', 'early-explorer': 'compass', verified: 'badge-check', 'first-post': 'edit', 'top-contributor': 'star', thinker: 'chat', supporter: 'heart', connector: 'community', 'community-builder': 'users', 'event-host': 'calendar', weaver: 'shuffle', 'trusted-hand': 'wrench', 'well-known': 'award', recruiter: 'user-plus', ambassador: 'megaphone' }

// The badge itself: a glossy shield in its colour.
export function BadgeArt({ badge, size = 64, locked = false }) {
  return (
    <span className={`bd-art bd-${badge.style || 'violet'} ${locked ? 'locked' : ''} ${badge.image ? 'has-img' : ''}`} style={{ '--s': `${size}px` }} aria-hidden="true">
      {badge.image ? <img src={badge.image} alt="" loading="lazy" /> : <Icon name={badge.custom ? 'star' : ICON[badge.id] || 'award'} size={Math.round(size * 0.42)} />}
    </span>
  )
}

export function LevelCard({ j, compact = false }) {
  if (!j) return null
  return (
    <div className={`card lv-card ${compact ? 'compact' : ''}`}>
      <div className="lv-top">
        <span className="lv-rank">{j.level.level + 1}</span>
        <span className="lv-text">
          <b>{j.level.title}</b>
          <em>{j.next ? `${j.toNext} points to ${j.next.name}` : 'Top of the city'} · {j.points} points</em>
        </span>
      </div>
      <div className="lv-bar" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(4, j.progress)}%` }} /></div>
      {!compact && (
        <ol className="lv-steps">
          {j.levels.map((l) => (
            <li key={l.level} className={l.level < j.level.level ? 'done' : l.level === j.level.level ? 'now' : ''}>
              <b>{l.name}</b><em>{l.at} pts · {l.blurb}</em>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// Invite friends (Nuel, Nov 12: "create something whereby people can refer
// other people to join and that increases their status… the more people
// they refer the bar increases to a new status"). Each friend who joins
// from your link is worth points towards your next citizen level.
export const REFERRAL_POINTS = 10
export function InviteCard({ user, count }) {
  const [copied, setCopied] = useState(false)
  const link = `${location.origin}/auth?ref=${encodeURIComponent(user.id)}`
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Join me on VOIDAJ', text: 'Connect. Discover. Participate. Join me on VOIDAJ:', url: link })
      else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    } catch { /* closed */ }
  }
  return (
    <section className="card bd-section bd-invite">
      <div className="row-head"><h2>Invite friends, rise faster</h2><span className="meta-dim">{count} joined</span></div>
      <p className="meta-dim">Every friend who joins from your link adds <b>{REFERRAL_POINTS} points</b> to your bar, moving you from New Citizen to Resident, Neighbour and beyond. Bring one for the Recruiter badge and ten for Ambassador.</p>
      <div className="bd-invite-row">
        <input readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.target.select()} />
        <button className="btn primary small" onClick={share}><Icon name={copied ? 'check' : 'share'} size={14} /> {copied ? 'Copied' : 'Share link'}</button>
      </div>
    </section>
  )
}

function BadgeSheet({ badge, mine, onClose, onChange }) {
  const [busy, setBusy] = useState(false)
  const toggle = async () => { setBusy(true); try { onChange(await api.setBadgeHidden(badge.id, !badge.hidden)) } finally { setBusy(false); onClose() } }
  const remove = async () => { setBusy(true); try { onChange(await api.deleteBadge(badge.id)) } finally { setBusy(false); onClose() } }
  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="sheet bd-detail" role="dialog" aria-label={badge.name} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn subtle bd-close" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <BadgeArt badge={badge} size={112} locked={!badge.earned && !badge.custom} />
        <h2>{badge.name}</h2>
        <span className={`bd-state ${badge.earned || badge.custom ? 'on' : ''}`}>{badge.custom ? 'Made by you' : badge.earned ? 'Earned' : 'Not earned yet'}</span>
        <p className="meta-dim">{badge.custom ? 'A badge you created to show on your profile.' : `Awarded for: ${badge.how.toLowerCase()}.`}</p>
        {mine && (badge.earned || badge.custom) && (
          <div className="bd-detail-actions">
            <button className="btn primary" disabled={busy} onClick={toggle}><Icon name="eye" size={15} /> {badge.hidden ? 'Show on my profile' : 'Hide from my profile'}</button>
            {badge.custom && <button className="btn ghost" disabled={busy} onClick={remove}><Icon name="trash" size={15} /> Delete</button>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Badges() {
  const { user } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = ['mine', 'discover', 'create'].includes(params.get('tab')) ? params.get('tab') : 'mine'
  const setTab = (t) => setParams(t === 'mine' ? {} : { tab: t }, { replace: true })
  const [j, setJ] = useState(null)
  const [open, setOpen] = useState(null)
  const [mode, setMode] = useState('create')
  const [name, setName] = useState('')
  const [style, setStyle] = useState('violet')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [image, setImage] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef(null)
  const pickImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true); setError('')
    try { setImage(await api.uploadImage((await compressPhoto(file)).src, 'badge')) } catch (err) { setError(err.message) }
    setUploading(false)
  }

  useEffect(() => { if (user) api.journey('me').then(setJ).catch(() => {}) }, [user?.id])
  if (!user) {
    return (
      <div className="page"><div className="card feed-empty">
        <BadgeArt badge={{ id: 'early-explorer', style: 'violet' }} size={72} />
        <strong>Badges show your journey on VOIDAJ</strong>
        <button className="btn primary small" onClick={() => navigate('/auth')}>Step in to start earning</button>
      </div></div>
    )
  }
  const mine = j ? [...j.badges, ...j.custom] : []
  const create = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try { setJ(await api.createBadge(name, style, image)); setName(''); setImage(''); setTab('mine') } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <div className="page bd-page">
      <header className="bd-hero">
        <span className="bd-hero-mark"><Icon name="award" size={30} /></span>
        <h1>VOIDAJ Badges</h1>
        <p className="meta-dim">Recognise, reward and express your journey on VOIDAJ.</p>
      </header>

      <div className="seg float-bar" role="tablist">
        {[['mine', 'My Badges'], ['discover', 'Discover'], ['create', 'Create']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {!j && <p className="meta-dim">Loading…</p>}

      {j && tab === 'mine' && (
        <>
          <LevelCard j={j} />
          <InviteCard user={user} count={j.stats?.referrals ?? 0} />
          <section className="card bd-section">
            <div className="row-head"><h2>Your badges ({mine.length})</h2><button className="link-btn" onClick={() => setTab('discover')}>See all</button></div>
            {mine.length === 0 ? <p className="meta-dim">No badges yet. Post, spark, join communities and host events to earn them.</p> : (
              <div className="bd-grid">
                {mine.map((b) => (
                  <button key={b.id} className={`bd-tile ${b.hidden ? 'is-hidden' : ''}`} onClick={() => setOpen(b)}>
                    <BadgeArt badge={b} size={64} />
                    <b>{b.name}</b>
                    {b.hidden && <em><Icon name="eye" size={11} /> Hidden</em>}
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {j && tab === 'discover' && (
        <section className="card bd-section">
          <div className="row-head"><h2>Every badge</h2><span className="meta-dim">{j.catalog.filter((b) => b.earned).length} of {j.catalog.length} earned</span></div>
          <div className="bd-list">
            {j.catalog.map((b) => (
              <button key={b.id} className="bd-row" onClick={() => setOpen({ ...b, hidden: j.badges.find((x) => x.id === b.id)?.hidden })}>
                <BadgeArt badge={b} size={46} locked={!b.earned} />
                <span><b>{b.name}</b><em>{b.how}</em></span>
                {b.earned ? <span className="bd-chip on"><Icon name="check" size={12} /> Earned</span> : <span className="bd-chip"><Icon name="lock" size={12} /> Locked</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {j && tab === 'create' && (
        <section className="card bd-section bd-create">
          <h2>Get or create badges</h2>
          <div className="seg small" role="tablist">
            {[['earn', 'Earn'], ['gift', 'Gift'], ['buy', 'Buy'], ['create', 'Create']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>
          {mode === 'earn' && <p className="meta-dim">Badges are earned by taking part. <button className="link-btn" onClick={() => setTab('discover')}>See how to earn each one</button>.</p>}
          {(mode === 'gift' || mode === 'buy') && (
            <div className="bd-soon"><Icon name="clock" size={18} /><span><b>Coming soon</b><em>{mode === 'gift' ? 'Send a badge to someone (they accept it before it shows).' : 'Exclusive badges you can buy.'} This opens when payments go live.</em></span></div>
          )}
          {mode === 'create' && (
            <form onSubmit={create} className="bd-form">
              <BadgeArt badge={{ custom: true, style, image }} size={110} />
              <div className="bd-field"><span>Picture (optional)</span>
                <div className="bd-img-row">
                  <button type="button" className="btn ghost small" onClick={() => fileInput.current?.click()} disabled={uploading}>
                    <Icon name={uploading ? 'clock' : 'camera'} size={14} /> {uploading ? 'Uploading…' : image ? 'Change picture' : 'Upload your own picture'}
                  </button>
                  {image && <button type="button" className="link-btn" onClick={() => setImage('')}>Remove</button>}
                </div>
                <em className="meta-dim">A square picture works best. It sits inside the badge shield, coloured by the style you pick.</em>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" hidden onChange={pickImage} />
              </div>
              <label className="bd-field"><span>Badge name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Team Lead" maxLength={32} />
              </label>
              <div className="bd-field"><span>Style</span>
                <div className="bd-styles" role="radiogroup" aria-label="Style">
                  {BADGE_STYLES.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={style === s} aria-label={s} className={`bd-swatch bd-${s} ${style === s ? 'on' : ''}`} onClick={() => setStyle(s)}><Icon name="star" size={16} /></button>
                  ))}
                </div>
              </div>
              {error && <p className="auth-error">{error}</p>}
              <button className="btn primary" disabled={busy || uploading || name.trim().length < 2}>{busy ? 'Creating…' : 'Create badge'}</button>
            </form>
          )}
        </section>
      )}

      <Link to="/profile/me" className="btn ghost small bd-back"><Icon name="user" size={14} /> Back to my profile</Link>
      {open && <BadgeSheet badge={open} mine onClose={() => setOpen(null)} onChange={setJ} />}
    </div>
  )
}
