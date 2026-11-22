// Quick Jobs — local trade & gig work. Posters describe what they need;
// workers set the categories they do and get notified when a match posts.
// Laid out like Nuel's mockup: a job search bar, All · Remote · Near You ·
// Saved, category tiles with photos, and jobs as rows with a picture, the
// price and when it's needed. Anyone can name their own price with Make
// an offer (Nuel, Oct 27).
// ID verification is a simulated demo badge (no real KYC provider wired up).
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../state.jsx'
import { JOB_CATEGORIES } from '../data/seed.js'
import * as api from '../api.js'
import { Icon, IconTile } from '../components/Icons.jsx'
import { Avatar, SectionHead, FavoriteButton } from '../components/bits.jsx'
import { JobPeople } from '../components/JobPeople.jsx'
import { useFavorites } from '../favorites.js'
import { JobFlow } from '../components/JobFlow.jsx'
import { ReachChips, useReach } from '../components/Reach.jsx'
import { CURRENCIES, currencyOf, currencySymbol, withCurrency, inReach } from '../countries.js'
import { VERIFICATION_IS_REAL, verifiedLabel, showVerifiedTick } from '../verification.js'
import { IdVerify } from '../components/IdVerify.jsx'
import { JobHistory } from '../components/JobHistory.jsx'

const catInfo = (id) => JOB_CATEGORIES.find((c) => c.id === id) || { label: id, icon: 'briefcase' }

// A picture for each kind of work (public/images, free Unsplash photos).
// A category without one gets a coloured tile with its icon.
const CAT_PHOTO = {
  plumbing: '/images/jobs/plumbing.jpg',
  cleaning: '/images/jobs/cleaning.jpg',
  carpentry: '/images/jobs/carpentry.jpg',
  'appliance-repair': '/images/jobs/appliance-repair.jpg',
  'auto-repair': '/images/jobs/auto-repair.jpg',
  'photography-gig': '/images/communities/lagos-lens-collective.jpg',
  'event-help': '/images/events/ev-pitch-night.jpg',
  'tech-support': '/images/events/ev-js-study.jpg',
  gardening: '/images/events/ev-balcony-farm.jpg',
  electrical: '/images/events/ev-solar-workshop.jpg',
  'catering-gig': '/images/events/ev-market-popup.jpg',
  tutoring: '/images/communities/naija-devs.jpg',
  delivery: '/images/communities/balogun-market-hub.jpg',
  painting: '/images/communities/lagos-entrepreneurs.jpg',
  moving: '/images/events/ev-farm-tour.jpg',
}
const CAT_TONE = { plumbing: 'blue', electrical: 'yellow', cleaning: 'teal', moving: 'orange', painting: 'pink', carpentry: 'orange', 'appliance-repair': 'indigo', gardening: 'green', delivery: 'violet', tutoring: 'blue', 'photography-gig': 'violet', 'event-help': 'pink', 'tech-support': 'indigo', 'catering-gig': 'red', 'auto-repair': 'navy' }
const TIMINGS = ['Today', 'This week', 'This weekend', 'Flexible']

// Jobs & Services (Nuel's notes, Nov 9 and 12). A listing is a Job ("I need
// someone to do something") or a Service ("I can do something for you"),
// and every listing says clearly what kind of opportunity it is.
export const OPPORTUNITIES = [
  { id: 'paid', label: 'Paid work', short: 'Paid', icon: 'wallet' },
  { id: 'volunteer', label: 'Volunteering', short: 'Volunteer', icon: 'heart' },
  { id: 'free', label: 'Free help', short: 'Free help', icon: 'smile' },
  { id: 'exchange', label: 'Skill exchange', short: 'Skill exchange', icon: 'shuffle' },
]
export const ARRANGEMENTS = [
  { id: 'local', label: 'Local', icon: 'map-pin' },
  { id: 'remote', label: 'Remote', icon: 'monitor' },
  { id: 'hybrid', label: 'Hybrid', icon: 'globe' },
]
const oppInfo = (id) => OPPORTUNITIES.find((o) => o.id === id) || OPPORTUNITIES[0]
// What a listing costs, or what it is when there's no price.
export function priceLabel(job) {
  if (job.opportunity === 'volunteer') return 'Volunteer'
  if (job.opportunity === 'free') return 'Free help'
  if (job.opportunity === 'exchange') return 'Skill exchange'
  return withCurrency(job.budget, job.currency) || (job.kind === 'service' ? 'Ask for a price' : 'Make an offer')
}
const whereLabel = (job) => {
  const place = [job.area, job.city].filter(Boolean).join(', ')
  if (job.arrangement === 'remote' || (!job.arrangement && job.remote)) return 'Remote'
  if (job.arrangement === 'hybrid') return `Hybrid${place ? ` · ${place}` : ''}`
  return place
}
// Payments stay between the two people at launch, and VOIDAJ says so.
export const PAYMENT_NOTE = 'Payments are arranged directly between you. VOIDAJ doesn’t collect, hold, verify or guarantee payment. Never pay in advance to someone you haven’t met, and report anything suspicious.'
// Once Paystack is switched on (server/payments.js), paid jobs in a currency
// it takes are paid through VOIDAJ instead.
export const PAYSTACK_NOTE = 'Paid through VOIDAJ with Paystack. The poster’s card is charged when the job is done, and the worker gets the full agreed price. VOIDAJ takes no cut and never holds the money.'
let paymentsCfg = null
function usePaymentsConfig() {
  const [cfg, setCfg] = useState(paymentsCfg)
  useEffect(() => {
    if (paymentsCfg) return
    api.paymentsConfig().then((c) => { paymentsCfg = c; setCfg(c) }).catch(() => {})
  }, [])
  return cfg
}
const payNote = (cfg, currency) => (cfg?.enabled && cfg.currencies.includes(String(currency || 'NGN').toUpperCase()) ? PAYSTACK_NOTE : PAYMENT_NOTE)

export function JobPhoto({ category, size = 64 }) {
  const info = catInfo(category)
  const src = CAT_PHOTO[category]
  return src
    ? <span className="job-photo" style={{ width: size, height: size }}><img src={src} alt="" loading="lazy" /><Icon name={info.icon} size={13} className="job-photo-badge" /></span>
    : <IconTile name={info.icon} tone={CAT_TONE[category] ?? 'blue'} size={size} iconSize={Math.round(size * 0.42)} />
}
const seenKey = (uid) => `is_jobs_seen_${uid}`

// Quick Jobs' "Get verified" window: the same ID check as Settings.
function VerifyModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="side-card-head"><Icon name="badge-check" size={16} /> Get ID Verified</div>
        <p className="meta-dim">Verified pros can take jobs marked “verified only” and get a trust badge on their profile.</p>
        <IdVerify />
        <div className="composer-foot"><button type="button" className="btn ghost small" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}

// What a visitor gets in the column members use for their own tools, so it
// isn't left empty: what signing up unlocks, and how it works.
const HOW_IT_WORKS = [
  ['edit', 'Post or offer', 'Say what you need, or what you can do.'],
  ['message-circle', 'Agree it in chat', 'Settle price and timing with the other person.'],
  ['check', 'Get it done', 'Mark it complete when the work is finished.'],
  ['star', 'Review each other', 'Reviews build a record people can trust.'],
]
function VisitorSide() {
  return (
    <aside className="space-side visitor-side">
      <div className="card side-card visitor-join">
        <div className="side-card-head"><Icon name="sparkle" size={15} /> Join to take part</div>
        <ul className="visitor-perks">
          <li><Icon name="check" size={14} /> Post a job or offer a service</li>
          <li><Icon name="check" size={14} /> Get alerts for work that matches your skills</li>
          <li><Icon name="check" size={14} /> Build a profile and reviews people trust</li>
        </ul>
        <Link to="/auth" className="btn primary small">Create your account <Icon name="arrow" size={14} /></Link>
        <Link to="/auth?mode=login" className="meta-dim visitor-login">Already a member? Log in</Link>
      </div>
      <div className="card side-card">
        <div className="side-card-head"><Icon name="briefcase" size={15} /> How Quick Jobs works</div>
        <ol className="visitor-steps">
          {HOW_IT_WORKS.map(([icon, t, sub], n) => (
            <li key={t}><IconTile name={icon} tone="blue" size={30} iconSize={14} /><span><b>{n + 1}. {t}</b><em>{sub}</em></span></li>
          ))}
        </ol>
      </div>
    </aside>
  )
}

// Opened by the "Post a quick job" button beside Find work / Find people.
function PostJobForm({ onCreated, onClose, startCategory, startKind }) {
  const { profile } = useApp()
  const payCfg = usePaymentsConfig()
  // Prices are in the poster's own currency unless they pick another.
  const blank = { kind: 'job', opportunity: 'paid', arrangement: 'local', exchange: '', title: '', category: JOB_CATEGORIES[0].id, area: '', budget: '', currency: currencyOf(profile.country), description: '', verifiedOnly: false, timing: 'Flexible', openToOffers: true }
  const [form, setForm] = useState({ ...blank, kind: startKind === 'service' ? 'service' : 'job', category: JOB_CATEGORIES.some((c) => c.id === startCategory) ? startCategory : JOB_CATEGORIES[0].id })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const pick = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const service = form.kind === 'service'
  const paid = form.opportunity === 'paid'
  const ready = form.title.trim() && (form.opportunity !== 'exchange' || form.exchange.trim())

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    try {
      const job = await api.createJob(form)
      onCreated(job)
      setForm(blank)
      onClose()
    } catch (err) { alert(err.message) }
    setBusy(false)
  }

  return (
    <form className="card composer-full job-form" onSubmit={submit}>
      <div className="fc-audience" role="radiogroup" aria-label="Job or service">
        <button type="button" role="radio" aria-checked={!service} className={!service ? 'on' : ''} onClick={() => pick('kind', 'job')}><Icon name="briefcase" size={14} /> Post a job <em>I need help</em></button>
        <button type="button" role="radio" aria-checked={service} className={service ? 'on' : ''} onClick={() => pick('kind', 'service')}><Icon name="hand-coins" size={14} /> Offer a service <em>I can help</em></button>
      </div>
      <input className="composer-title" value={form.title} onChange={set('title')} placeholder={service ? 'What do you offer? e.g. Home tutoring in maths' : 'What do you need done? e.g. Fix a leaking kitchen pipe'} autoFocus />
      <div className="job-timing" role="radiogroup" aria-label="Kind of opportunity">
        {OPPORTUNITIES.map((o) => <button key={o.id} type="button" role="radio" aria-checked={form.opportunity === o.id} className={form.opportunity === o.id ? 'on' : ''} onClick={() => pick('opportunity', o.id)}><Icon name={o.icon} size={13} /> {o.label}</button>)}
      </div>
      <div className="job-form-row">
        <select className="job-select" value={form.category} onChange={set('category')} aria-label="Category">
          {JOB_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input className="job-input" value={form.area} onChange={set('area')} placeholder={form.arrangement === 'remote' ? 'Area (optional)' : 'Area (e.g. Yaba)'} />
        {paid && (
          <span className="job-money">
            <select value={form.currency} onChange={set('currency')} aria-label="Currency">
              {CURRENCIES.map((c) => <option key={c} value={c}>{currencySymbol(c) === c ? c : `${currencySymbol(c)} ${c}`}</option>)}
            </select>
            <input className="job-input" value={form.budget} onChange={set('budget')} placeholder={service ? 'Price (e.g. from 10,000)' : 'Budget (e.g. 15,000) — or leave blank'} />
          </span>
        )}
      </div>
      {form.opportunity === 'exchange' && (
        <input className="job-input" value={form.exchange} onChange={set('exchange')} maxLength={200} placeholder={service ? 'What would you like in return? e.g. Help with my website' : 'What can you offer in return? e.g. Photography for your event'} aria-label="In return" required />
      )}
      <div className="job-timing" role="radiogroup" aria-label="Where is the work done?">
        {ARRANGEMENTS.map((a) => <button key={a.id} type="button" role="radio" aria-checked={form.arrangement === a.id} className={form.arrangement === a.id ? 'on' : ''} onClick={() => pick('arrangement', a.id)}><Icon name={a.icon} size={13} /> {a.label}</button>)}
      </div>
      {!service && (
        <div className="job-timing" role="radiogroup" aria-label="When do you need it?">
          {TIMINGS.map((t) => <button key={t} type="button" role="radio" aria-checked={form.timing === t} className={form.timing === t ? 'on' : ''} onClick={() => pick('timing', t)}>{t}</button>)}
        </div>
      )}
      <textarea className="composer-body" value={form.description} onChange={set('description')} placeholder={service ? 'Your experience, availability and anything people should know…' : 'Add details…'} rows={3} />
      {paid && (
        <label className="job-checkbox">
          <input type="checkbox" checked={form.openToOffers} onChange={set('openToOffers')} />
          <span><Icon name="hand-coins" size={13} /> Open to offers — people can name their own price</span>
        </label>
      )}
      {/* Hidden until verification is real — the server ignores it anyway,
          so offering it would promise a filter that doesn't filter. */}
      {!service && VERIFICATION_IS_REAL && (
        <label className="job-checkbox">
          <input type="checkbox" checked={form.verifiedOnly} onChange={set('verifiedOnly')} />
          <span><Icon name="badge-check" size={13} /> Only show to ID-verified pros</span>
        </label>
      )}
      {paid && <p className="job-pay-note"><Icon name="shield" size={13} /> {payNote(payCfg, form.currency)}</p>}
      {!paid && <p className="job-pay-note"><Icon name="info" size={13} /> This listing will clearly say it’s {oppInfo(form.opportunity).label.toLowerCase()}{form.opportunity === 'volunteer' || form.opportunity === 'free' ? ' — unpaid' : ''}.</p>}
      <div className="composer-foot">
        <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
        <button className="btn primary small" disabled={!ready || busy}>{busy ? 'Posting…' : service ? 'Post service' : 'Post job'}</button>
      </div>
    </form>
  )
}

function SkillsPicker({ profile, onSave }) {
  const [selected, setSelected] = useState(profile.jobSkills || [])
  const [busy, setBusy] = useState(false)
  const changed = JSON.stringify([...selected].sort()) !== JSON.stringify([...(profile.jobSkills || [])].sort())

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const save = async () => {
    setBusy(true)
    try {
      await onSave(selected)
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    } finally { setBusy(false) }
  }

  return (
    <div className="card side-card">
      <div className="side-card-head"><Icon name="bell" size={15} /> Get notified for work</div>
      <p className="meta-dim">Pick what you can do — you’ll be notified when a matching job goes up nearby.</p>
      <div className="chip-grid tight">
        {JOB_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`goal-chip small ${selected.includes(c.id) ? 'selected' : ''}`} onClick={() => toggle(c.id)}>
            <Icon name={c.icon} size={13} /> {c.label} {selected.includes(c.id) && <Icon name="check" size={12} className="chip-check" />}
          </button>
        ))}
      </div>
      {changed && (
        <button className="btn primary small" style={{ marginTop: 10 }} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save & enable alerts'}
        </button>
      )}
    </div>
  )
}

// A job as a row, like the mockup: picture, title, where and when, the
// price on the right. The whole row opens the job.
export function JobCard({ job }) {
  const info = catInfo(job.category)
  return (
    <div className="card job-row card-link">
      <JobPhoto category={job.category} size={64} />
      <div className="job-row-main">
        <Link to={`/jobs?job=${job.id}`} className="job-row-title stretched">{job.title}</Link>
        <span className="job-row-where"><Icon name={job.arrangement === 'remote' ? 'monitor' : job.arrangement === 'hybrid' ? 'globe' : 'map-pin'} size={12} /> {whereLabel(job)}</span>
        <span className="job-row-tags">
          {job.kind === 'service' && <span className="cat-tag">Service</span>}
          {job.kind !== 'service' && <span className={`job-when ${job.timing === 'Today' ? 'today' : ''}`}>{job.timing || 'Flexible'}</span>}
          {job.verified && <span className="verified-tag"><Icon name="badge-check" size={11} /> Verified</span>}
          {job.offerCount > 0 && <span className="job-offers">{job.offerCount} offer{job.offerCount > 1 ? 's' : ''}</span>}
          {job.iInterested && <span className="job-mine"><Icon name="check" size={11} /> {job.myOffer ? `You offered ${withCurrency(job.myOffer, job.currency)}` : 'You offered'}</span>}
          {job.status && job.status !== 'open' && <span className="cat-tag plain">{{ paused: 'Paused', selected: 'Worker selected', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed' }[job.status]}</span>}
        </span>
      </div>
      <div className="job-row-side">
        <b className="job-price">{priceLabel(job)}</b>
        {job.budget && job.openToOffers && <span className="job-neg">or offer</span>}
        <FavoriteButton item={{ kind: 'job', id: job.id, title: job.title, subtitle: [info.label, job.area, priceLabel(job)].filter(Boolean).join(' · '), href: `/jobs?job=${job.id}` }} />
      </div>
    </div>
  )
}

// A job, opened. This is where someone offers to do it.
function JobSheet({ job, onInterest, onOffer, onClose, onChange }) {
  const { user } = useApp()
  const payCfg = usePaymentsConfig()
  const navigate = useNavigate()
  const info = catInfo(job.category)
  const [offering, setOffering] = useState(false)
  const [offer, setOffer] = useState(job.myOffer || '')
  const [note, setNote] = useState(job.myOfferNote || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mine = user && job.poster.id === user.id
  const sendOffer = async (e) => {
    e.preventDefault()
    if (!offer.trim() || busy) return
    setBusy(true); setError('')
    try { await onOffer(job.id, withCurrency(offer, job.currency), note); setOffering(false) }
    catch (err) { setError(err.message) }
    setBusy(false)
  }
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal-card job-sheet" role="dialog" aria-label={job.title} onClick={(e) => e.stopPropagation()}>
        <div className="job-card-head">
          <JobPhoto category={job.category} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="card-title">{job.title}</h2>
            <div className="meta-row">
              {job.kind === 'service' && <span className="cat-tag">Service</span>}
              <span className="cat-tag plain"><Icon name={oppInfo(job.opportunity).icon} size={11} /> {oppInfo(job.opportunity).label}</span>
              <span className="pill">{info.label}</span>
              {job.verified && <span className="verified-tag"><Icon name="badge-check" size={12} /> Verified job</span>}
              {VERIFICATION_IS_REAL && job.verifiedOnly && <span className="scope-badge local"><Icon name="badge-check" size={11} /> Verified pros only</span>}
            </div>
          </div>
          <button className="icon-btn subtle" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <ul className="job-facts">
          {job.area && <li><Icon name="map-pin" size={14} /> {job.area}{job.city ? `, ${job.city}` : ''}</li>}
          {job.arrangement !== 'local' && <li><Icon name={job.arrangement === 'hybrid' ? 'globe' : 'monitor'} size={14} /> {job.arrangement === 'hybrid' ? 'Hybrid — partly in person, partly remote' : 'Can be done remotely'}</li>}
          {job.kind !== 'service' && <li><Icon name="clock" size={14} /> Needed: {job.timing || 'Flexible'}</li>}
          <li><Icon name="tag" size={14} /> {job.opportunity === 'paid' ? `${withCurrency(job.budget, job.currency) || (job.kind === 'service' ? 'Ask for a price' : 'No set price — make an offer')}${job.budget && job.openToOffers ? ' · open to offers' : ''}` : job.opportunity === 'exchange' ? `Skill exchange — in return: ${job.exchange}` : `${oppInfo(job.opportunity).label} — unpaid`}</li>
          <li><Icon name="users" size={14} /> {job.interested} interested</li>
          <li><Icon name="clock" size={14} /> Posted {job.ago} ago</li>
        </ul>
        {job.description && <p className="card-desc">{job.description}</p>}
        {job.opportunity === 'paid' && <p className="job-pay-note"><Icon name="shield" size={13} /> {payNote(payCfg, job.currency)}</p>}
        <div className="post-head">
          <Avatar user={job.poster} size={30} />
          <div className="meta-dim">
            Posted by <Link to={`/profile/${job.poster.id}`} className="post-author">{job.poster.name}</Link>
            {showVerifiedTick() && job.poster.idVerified && <span className="verified-tag"><Icon name="badge-check" size={12} /> {verifiedLabel()}</span>}
          </div>
        </div>
        {/* Hiring, the agreement, progress and reviews (components/JobFlow.jsx). */}
        <JobFlow job={job} onChange={onChange} />

        {offering && (
          <form className="job-offer-form" onSubmit={sendOffer}>
            <label className="field"><span>Your price</span>
              <span className="job-offer-input"><b>{currencySymbol(job.currency)}</b><input value={offer.replace(currencySymbol(job.currency), '')} onChange={(e) => setOffer(e.target.value)} placeholder={job.budget ? job.budget.replace(/^[^0-9]+/, '') : '15,000'} inputMode="numeric" autoFocus /></span>
            </label>
            <label className="field"><span>Note to {job.poster.name.split(' ')[0]} <em>optional</em></span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I can come this evening with my tools" maxLength={300} />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <div className="composer-foot">
              <button type="button" className="btn ghost small" onClick={() => setOffering(false)}>Cancel</button>
              <button className="btn primary small" disabled={!offer.trim() || busy}>{busy ? 'Sending…' : job.myOffer ? 'Update offer' : 'Send offer'}</button>
            </div>
          </form>
        )}

        {!mine && !offering && (job.status || 'open') === 'open' && (
          <div className="composer-foot job-sheet-actions">
            {user ? <Link to={`/chats?dm=${job.poster.id}&job=${job.id}`} className="btn ghost small"><Icon name="message-circle" size={14} /> Message</Link> : <span />}
            <span className="job-sheet-buttons">
              {job.openToOffers && (
                <button className="btn ghost small" onClick={() => (user ? setOffering(true) : navigate('/auth'))}>
                  <Icon name="hand-coins" size={14} /> {job.myOffer ? `Your offer: ${job.myOffer}` : 'Make an offer'}
                </button>
              )}
              {job.iInterested ? (
                <button className="btn ghost small" onClick={() => onInterest(job.id)}><Icon name="x" size={14} /> Withdraw</button>
              ) : job.kind === 'service' ? (
                <Link className="btn primary small" to={user ? `/chats?dm=${job.poster.id}&job=${job.id}` : '/auth'}>{job.opportunity === 'exchange' ? 'Propose an exchange' : job.opportunity === 'paid' ? 'Contact provider' : 'Request help'}</Link>
              ) : job.opportunity !== 'paid' ? (
                <button className="btn primary small" onClick={() => (user ? onInterest(job.id) : navigate('/auth'))}>{job.opportunity === 'volunteer' ? 'Volunteer' : job.opportunity === 'free' ? 'Offer help' : 'Propose an exchange'}</button>
              ) : job.budget && (
                <button className="btn primary small" onClick={() => (user ? onInterest(job.id) : navigate('/auth'))}>Do it for {job.budget}</button>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Categories as photo tiles you swipe through (Nuel: "can those tiles get
// images or pics also"). Tap one to filter; tap again to clear.
function CategoryTiles({ category, onPick }) {
  return (
    <div className="job-cats">
      <div className="row-head"><h2>Browse categories</h2>{category && <button className="link-btn" onClick={() => onPick('')}>Clear <Icon name="x" size={12} /></button>}</div>
      <div className="rail job-cat-rail">
        {JOB_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`job-cat ${category === c.id ? 'on' : ''}`} onClick={() => onPick(category === c.id ? '' : c.id)}
            style={CAT_PHOTO[c.id] ? { '--img': `url(${CAT_PHOTO[c.id]})` } : undefined} aria-pressed={category === c.id}>
            {!CAT_PHOTO[c.id] && <IconTile name={c.icon} tone={CAT_TONE[c.id] ?? 'blue'} size={40} />}
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const KINDS = [
  { id: '', label: 'All' },
  { id: 'job', label: 'Jobs', icon: 'briefcase' },
  { id: 'service', label: 'Services', icon: 'hand-coins' },
]
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'remote', label: 'Remote', icon: 'monitor' },
  { id: 'hybrid', label: 'Hybrid', icon: 'globe' },
  { id: 'volunteer', label: 'Volunteering', icon: 'heart' },
  { id: 'free', label: 'Free help', icon: 'smile' },
  { id: 'exchange', label: 'Skill exchange', icon: 'shuffle' },
  { id: 'near', label: 'Near You', icon: 'map-pin' },
  { id: 'offers', label: 'Open to offers', icon: 'hand-coins' },
  { id: 'verified', label: 'Verified', icon: 'badge-check' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
]
// Ten loose chips in one row read as noise. Grouped under headings and
// folded behind a Filters button, the page leads with the work instead.
const FILTER_GROUPS = [
  { label: 'How you work', ids: ['remote', 'hybrid'] },
  { label: 'Kind of work', ids: ['volunteer', 'free', 'exchange', 'offers'] },
  { label: 'Trust', ids: ['verified', 'saved'] },
]
const filterById = (id) => FILTERS.find((f) => f.id === id)

export default function Jobs() {
  const { user, profile, saveProfile, refreshMe } = useApp()
  const [reach, setReach] = useReach()
  const [jobs, setJobs] = useState([])
  const [matched, setMatched] = useState([])
  const [category, setCategory] = useState('')
  const [filter, setFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [allMatches, setAllMatches] = useState(false)
  const saved = useFavorites()
  const [showVerify, setShowVerify] = useState(false)
  const [toast, setToast] = useState(null)
  const [stray, setStray] = useState(null)
  // Add Hub sends people here with ?post=1 to open the form straight away
  // (with &category= when offering a job from someone's card); ?job=<id>
  // opens that job; ?view=people shows Find people.
  const [params, setParams] = useSearchParams()
  // The search is in the URL (?q=) so the header search box drives it.
  const search = params.get('q') || ''
  const setSearch = (v) => setParams((p) => { v ? p.set('q', v) : p.delete('q'); return p }, { replace: true })
  const view = ['people', 'mine'].includes(params.get('view')) ? params.get('view') : 'work'
  const setView = (v) => setParams((p) => { v !== 'work' ? p.set('view', v) : p.delete('view'); return p }, { replace: true })
  const [posting, setPosting] = useState(params.get('post') === '1')
  const openId = params.get('job')
  const openJob = [...matched, ...jobs].find((j) => j.id === openId) || (stray?.id === openId ? stray : null)
  const closeJob = () => setParams((p) => { p.delete('job'); return p }, { replace: true })
  // A job linked from elsewhere may sit outside the current filter.
  useEffect(() => {
    if (openId && !openJob) api.jobFlow(openId).then((d) => setStray(d.job)).catch(() => {})
  }, [openId]) // eslint-disable-line

  const load = () => {
    api.listJobs(category ? { category } : {}).then(setJobs).catch(() => setJobs([]))
    if (user && profile.jobSkills?.length) api.listJobs({ matchMine: 1 }).then(setMatched).catch(() => setMatched([]))
    else setMatched([])
  }

  useEffect(load, [category, user, profile.jobSkills?.length]) // eslint-disable-line

  // Mark matched jobs as "seen" and surface a one-time toast for anything
  // new since the user's last visit — the notification the CEO asked for.
  useEffect(() => {
    if (!user || !matched.length) return
    const key = seenKey(user.id)
    const lastSeen = Number(localStorage.getItem(key) || 0)
    const fresh = matched.filter((j) => j.createdAt > lastSeen)
    if (fresh.length) {
      setToast(`${fresh.length} new job${fresh.length > 1 ? 's' : ''} match what you do — including “${fresh[0].title}”`)
      const notify = user.settings?.notify ?? {}
      if (notify.push && notify.jobs !== false && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('New quick job near you', { body: fresh[0].title })
      }
    }
    localStorage.setItem(key, String(Date.now()))
  }, [matched, user])

  const replace = (job) => {
    setJobs((js) => js.map((j) => (j.id === job.id ? job : j)))
    setMatched((js) => js.map((j) => (j.id === job.id ? job : j)))
    setStray((st) => (st?.id === job.id ? job : st))
  }
  const onOffer = async (id, offer, note) => replace(await api.makeOffer(id, offer, note))

  const onInterest = async (id) => {
    try {
      const job = await api.toggleJobInterest(id)
      setJobs((js) => js.map((j) => (j.id === id ? job : j)))
      setMatched((js) => js.map((j) => (j.id === id ? job : j)))
      setStray((s) => (s?.id === id ? job : s))
    } catch (err) { alert(err.message) }
  }

  const matchedIds = new Set(matched.map((j) => j.id))
  const city = (profile.city || '').toLowerCase()
  const term = search.trim().toLowerCase()
  const savedIds = new Set(saved.filter((f) => f.kind === 'job').map((f) => f.id))
  const kind = params.get('kind') === 'service' ? 'service' : params.get('kind') === 'job' ? 'job' : ''
  const setKind = (v) => setParams((p) => { v ? p.set('kind', v) : p.delete('kind'); return p }, { replace: true })
  const keep = (j) => inReach(j, reach, user) && (!kind || (j.kind || 'job') === kind) && (!term || `${j.title} ${j.description} ${j.area} ${j.city} ${catInfo(j.category).label}`.toLowerCase().includes(term)) && ({
    all: true,
    remote: j.arrangement === 'remote',
    hybrid: j.arrangement === 'hybrid',
    volunteer: j.opportunity === 'volunteer',
    free: j.opportunity === 'free',
    exchange: j.opportunity === 'exchange',
    near: !!city && (j.city || '').toLowerCase() === city,
    offers: j.openToOffers,
    verified: j.verified,
    saved: savedIds.has(j.id),
  }[filter])
  // Jobs near you come first; verified ones lead within a category.
  const rest = jobs.filter((j) => (filter !== 'all' || term || !matchedIds.has(j.id)) && keep(j))
    .sort((a, b) => (((b.city || '').toLowerCase() === city) - ((a.city || '').toLowerCase() === city)) || (category ? Number(b.verified) - Number(a.verified) : 0))
  const MATCH_PREVIEW = 2
  const matchShown = allMatches ? matched : matched.slice(0, MATCH_PREVIEW)
  const listTitle = term ? `Results for “${search.trim()}”` : `${FILTERS.find((f) => f.id === filter).id === 'all' ? '' : FILTERS.find((f) => f.id === filter).label + ' · '}${category ? catInfo(category).label : kind === 'service' ? 'All services' : kind === 'job' ? 'All open jobs' : 'All jobs & services'}`

  return (
    <div className="page jobs-page">
      <header className="page-head jobs-head">
        <h1>Quick Jobs</h1>
        <p className="meta-dim">Find work, hire help, offer your skills, volunteer or swap skills — locally and online.</p>
      </header>

      <div className="jobs-banner">
        <IconTile name="sparkle" tone="grad" size={40} />
        <span><b>Good work travels by word of mouth.</b> Here, the word of mouth is written down.</span>
      </div>

      <div className="jobs-views-row float-bar">
      <div className="seg jobs-views" role="tablist" aria-label="Quick Jobs">
        <button role="tab" aria-selected={view === 'work'} className={view === 'work' ? 'on' : ''} onClick={() => setView('work')}>
          <Icon name="briefcase" size={15} /> Find work
        </button>
        <button role="tab" aria-selected={view === 'people'} className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>
          <Icon name="users" size={15} /> Find people
        </button>
        {user && (
          <button role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>
            <Icon name="user-check" size={15} /> My jobs
          </button>
        )}
      </div>
      {user && (
        <button className="btn primary jobs-post-btn" onClick={() => { setView('work'); setPosting(true) }} aria-expanded={posting}>
          <Icon name="plus" size={15} /> Post a job or service
        </button>
      )}
      </div>

      {toast && (
        <div className="job-toast">
          <Icon name="bell" size={15} /> {toast}
          <button className="icon-btn subtle" onClick={() => setToast(null)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}

      {!user && (
        <div className="card sign-in-nudge" style={{ marginTop: 20 }}>
          <span className="meta-dim">Sign in to post a job, offer your skills, or get notified about work near you.</span>
          <Link to="/auth" className="btn primary small">Sign in</Link>
        </div>
      )}

      {view === 'mine' && user ? (
        <div className="my-jobs">
          <div className="my-links">
            <span className="meta-dim">Your work on VOIDAJ</span>
            <Link to="/businesses?view=mine" className="chip-link"><Icon name="store" size={14} /> My businesses</Link>
            <Link to="/services?view=mine" className="chip-link"><Icon name="hand-coins" size={14} /> My services</Link>
          </div>
          <JobHistory profile={profile} />
        </div>
      ) : view === 'people' ? <JobPeople /> : (
      <div className="space-grid">
        <div className="space-main jobs-main">
          {user && posting && (
            <PostJobForm startCategory={params.get('category')} startKind={params.get('kind')} onClose={() => setPosting(false)} onCreated={(j) => setJobs((js) => [j, ...js])} />
          )}

          <label className="search-pill jobs-search page-search">
            <Icon name="search" size={17} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jobs — e.g. plumber, Yaba, tutoring" aria-label="Search jobs" />
            {search && <button type="button" className="icon-btn subtle" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="x" size={14} /></button>}
          </label>

          {/* One toolbar: what you're looking at, then everything else
              folded behind Filters with the active one shown beside it. */}
          <div className="jobs-toolbar">
            <div className="chip-row cat-chips" role="tablist" aria-label="Jobs or services">
              {KINDS.map((k) => <button key={k.id || 'all'} type="button" role="tab" aria-selected={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>{k.icon && <Icon name={k.icon} size={13} />} {k.label}</button>)}
            </div>
            <div className="jobs-toolbar-end">
              {filter !== 'all' && (
                <button type="button" className="jobs-active-filter" onClick={() => setFilter('all')}
                  aria-label={`Clear the ${filterById(filter)?.label} filter`}>
                  {filterById(filter)?.icon && <Icon name={filterById(filter).icon} size={12} />}
                  {filterById(filter)?.label}
                  <Icon name="x" size={12} />
                </button>
              )}
              <button type="button" className={`btn ghost small jobs-filter-btn${filtersOpen ? ' on' : ''}`}
                aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
                <Icon name="filter" size={14} /> Filters
                <Icon name="chevron-down" size={13} className="jobs-filter-caret" />
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="card jobs-filter-panel">
              <div className="jfp-group">
                <span className="jfp-label">Where</span>
                <ReachChips value={reach} onChange={setReach} me={user} />
                <div className="chip-row" role="group" aria-label="Near you">
                  <button type="button" aria-pressed={filter === 'near'} className={filter === 'near' ? 'on' : ''}
                    onClick={() => setFilter(filter === 'near' ? 'all' : 'near')}>
                    <Icon name="map-pin" size={13} /> Near You
                  </button>
                </div>
              </div>
              {FILTER_GROUPS.map((g) => (
                <div key={g.label} className="jfp-group">
                  <span className="jfp-label">{g.label}</span>
                  <div className="chip-row" role="group" aria-label={g.label}>
                    {g.ids.map(filterById).filter(Boolean).map((f) => (
                      <button key={f.id} type="button" aria-pressed={filter === f.id} className={filter === f.id ? 'on' : ''}
                        onClick={() => setFilter(filter === f.id ? 'all' : f.id)}>
                        {f.icon && <Icon name={f.icon} size={13} />} {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {filter !== 'all' && (
                <button type="button" className="btn ghost small jfp-clear" onClick={() => setFilter('all')}>
                  <Icon name="x" size={13} /> Clear filter
                </button>
              )}
            </div>
          )}

          {!term && filter === 'all' && <CategoryTiles category={category} onPick={setCategory} />}

          {matched.length > 0 && !term && filter === 'all' && (
            <section className="section">
              <SectionHead icon="bell" title="Matches for you" sub="Jobs in the kinds of work you said you do"
                action={matched.length > MATCH_PREVIEW
                  ? <button className="btn ghost small" onClick={() => setAllMatches((v) => !v)}>{allMatches ? 'Show less' : `See all ${matched.length}`}</button>
                  : null} />
              <div className="stack">
                {matchShown.map((j) => <JobCard key={j.id} job={j} />)}
              </div>
            </section>
          )}

          <section className="section">
            <SectionHead icon="briefcase" title={listTitle} sub={`${rest.length} open`} />
            <div className="stack stagger" key={`${filter}-${category}-${kind}`}>
              {rest.length === 0 && (
                <p className="meta-dim empty-note">
                  {filter === 'saved' ? 'Tap the bookmark on a job to save it here.' : term ? 'Nothing matches that search.' : kind === 'service' ? 'No services here yet — offer yours.' : 'No open jobs here yet — be the first to post one.'}
                </p>
              )}
              {rest.map((j) => <JobCard key={j.id} job={j} />)}
            </div>
          </section>
        </div>

        {user && (
          <aside className="space-side">
            {(profile.features?.idVerification !== false || profile.idVerified) && <div className="card side-card">
              <div className="side-card-head"><Icon name="badge-check" size={15} /> {VERIFICATION_IS_REAL ? 'ID Verification' : 'ID Verification — coming'}</div>
              {profile.idVerified ? (
                VERIFICATION_IS_REAL
                  ? <p className="meta-dim"><span className="verified-tag"><Icon name="badge-check" size={13} /> You’re verified</span> — you can take verified-only jobs.</p>
                  : <p className="meta-dim">The prototype badge is on for your account. It isn’t an identity check and gives you no priority.</p>
              ) : (
                <>
                  <p className="meta-dim">
                    {VERIFICATION_IS_REAL
                      ? 'Verify your ID to unlock verified-only jobs and build trust with posters.'
                      : 'Identity checks aren’t switched on yet, so every job is open to everyone. You can still switch on the prototype badge.'}
                  </p>
                  <button className="btn brand-outline small" onClick={() => setShowVerify(true)}>{VERIFICATION_IS_REAL ? 'Get verified' : 'Try the flow'}</button>
                </>
              )}
            </div>}
            <SkillsPicker profile={profile} onSave={(jobSkills) => saveProfile({ jobSkills })} />
          </aside>
        )}
        {!user && <VisitorSide />}
      </div>
      )}

      {openJob && <JobSheet key={openJob.id} job={openJob} onInterest={onInterest} onOffer={onOffer} onClose={closeJob} onChange={replace} />}

      {showVerify && (
        <VerifyModal onClose={() => setShowVerify(false)} />
      )}
    </div>
  )
}
