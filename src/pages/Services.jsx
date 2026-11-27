// Services — what people on VOIDAJ can do for you, with proof of past work
// and when they're available (Nuel, Nov 18). Browse everyone's, or manage
// your own under "My services". Each service is a Quick Jobs listing of
// kind "service" (server/services.js), so hiring and reviews work the same.
import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ShareLinkButton } from '../components/ShareLinkButton.jsx'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { JOB_CATEGORIES } from '../data/seed.js'
import { Icon, IconTile } from '../components/Icons.jsx'
import { Avatar } from '../components/bits.jsx'
import { compressPhoto } from '../components/Media.jsx'
import { HoursPicker } from '../components/ContactPickers.jsx'
import { withCurrency, currencyOf } from '../countries.js'

const catInfo = (id) => JOB_CATEGORIES.find((c) => c.id === id) || { id, label: id, icon: 'briefcase' }
const WHERE = { local: 'In person', remote: 'Online', hybrid: 'In person or online' }

function priceText(s) {
  if (s.pricing === 'free') return 'Free'
  if (s.pricing === 'exchange') return `Skill swap · ${s.exchange}`
  return s.price ? `From ${withCurrency(s.price, s.currency)}` : 'Ask for a quote'
}

function Stars({ record }) {
  if (!record?.reviews) return <span className="svc-new">New on VOIDAJ</span>
  return <span className="svc-stars"><Icon name="star" size={13} /> {record.rating} <em>({record.reviews})</em></span>
}

export function ServiceCard({ service: s, onOpen, actions }) {
  const cover = s.photos[0]?.url
  return (
    <article className={`svc-card${s.paused ? ' paused' : ''}`}>
      <button type="button" className="svc-cover" onClick={onOpen} style={cover ? { '--img': `url(${cover})` } : undefined}>
        {!cover && <IconTile name={catInfo(s.category).icon} tone="grad" size={46} />}
        <span className="svc-cat"><Icon name={catInfo(s.category).icon} size={12} /> {catInfo(s.category).label}</span>
        {s.photos.length > 1 && <span className="svc-count"><Icon name="image" size={12} /> {s.photos.length}</span>}
        {s.paused && <span className="svc-paused">Paused</span>}
      </button>
      <div className="svc-body">
        <button type="button" className="svc-title" onClick={onOpen}>{s.title}</button>
        <Link to={`/profile/${s.provider.id}`} className="svc-who">
          <Avatar user={s.provider} size={22} /> <span>{s.provider.name}</span> <Stars record={s.record} />
        </Link>
        {s.availability && <span className="svc-line"><Icon name="clock" size={13} /> {s.availability}</span>}
        <span className="svc-line"><Icon name={s.arrangement === 'remote' ? 'globe' : 'map-pin'} size={13} /> {WHERE[s.arrangement]}{s.arrangement !== 'remote' && (s.area || s.city) ? ` · ${[s.area, s.city].filter(Boolean).join(', ')}` : ''}</span>
        <div className="svc-foot">
          <b>{priceText(s)}</b>
          {actions}
        </div>
      </div>
    </article>
  )
}

function ServiceSheet({ id, onClose, onEdit }) {
  const { user } = useApp()
  const [s, setS] = useState(null)
  const [error, setError] = useState('')
  const [big, setBig] = useState(0)
  useEffect(() => { api.getService(id).then(setS).catch((e) => setError(e.message)) }, [id])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal-card svc-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn subtle svc-close" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        {!s ? <p className="meta-dim">{error || 'Loading…'}</p> : <>
          {s.photos.length > 0 && (
            <div className="svc-gallery">
              <img src={s.photos[big]?.url} alt={`${s.title}, photo ${big + 1}`} />
              {s.photos.length > 1 && (
                <div className="svc-thumbs">
                  {s.photos.map((p, i) => (
                    <button key={p.id} type="button" className={i === big ? 'on' : ''} onClick={() => setBig(i)}><img src={p.url} alt="" /></button>
                  ))}
                </div>
              )}
            </div>
          )}
          <span className="svc-cat inline"><Icon name={catInfo(s.category).icon} size={12} /> {catInfo(s.category).label}</span>
          <h2>{s.title}</h2>
          <Link to={`/profile/${s.provider.id}`} className="svc-who big">
            <Avatar user={s.provider} size={36} />
            <span><b>{s.provider.name}</b><em>{s.record.completed ? `${s.record.completed} ${s.record.completed === 1 ? 'job' : 'jobs'} done on VOIDAJ` : 'New on VOIDAJ'}</em></span>
            <Stars record={s.record} />
          </Link>
          <div className="svc-facts">
            <div><Icon name="wallet" size={15} /><span>Price</span><b>{priceText(s)}</b></div>
            <div><Icon name="clock" size={15} /><span>Available</span><b>{s.availability || 'Ask'}</b></div>
            <div><Icon name={s.arrangement === 'remote' ? 'globe' : 'map-pin'} size={15} /><span>Where</span><b>{WHERE[s.arrangement]}{s.arrangement !== 'remote' && s.city ? ` · ${s.area ? `${s.area}, ` : ''}${s.city}` : ''}</b></div>
          </div>
          {s.description && <p className="svc-about">{s.description}</p>}
          <h3 className="svc-sub">Reviews from jobs on VOIDAJ</h3>
          {!s.reviews?.length && <p className="meta-dim">No reviews yet. Reviews appear here after someone hires {s.isMine ? 'you' : s.provider.name.split(' ')[0]} through Quick Jobs.</p>}
          {s.reviews?.length > 0 && (
            <ul className="svc-reviews">
              {s.reviews.map((r, i) => (
                <li key={i}>
                  <Avatar user={r.from} size={26} />
                  <span><b>{r.from?.name}</b> <span className="svc-stars"><Icon name="star" size={12} /> {r.rating}</span> <em className="meta-dim">· {r.jobTitle} · {r.ago} ago</em>
                    {r.body && <p>“{r.body}”</p>}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="composer-foot">
            <ShareLinkButton path={`/services?s=${s.id}`} title={s.title} text={`${s.title} by ${s.provider.name} on VOIDAJ`} />
            {s.isMine
              ? <button className="btn primary small" onClick={() => onEdit(s)}><Icon name="edit" size={14} /> Edit service</button>
              : user
                ? <Link to={`/chats?dm=${s.provider.id}&job=${s.id}`} className="btn primary small"><Icon name="message-circle" size={14} /> Contact {s.provider.name.split(' ')[0]}</Link>
                : <Link to="/auth" className="btn primary small">Sign in to contact</Link>}
          </div>
          {!s.isMine && s.pricing === 'paid' && (
            <p className="meta-dim svc-note">VOIDAJ doesn’t hold or guarantee payment. Agree the price first, and never pay anyone who asks for money before you’ve met or seen proof.</p>
          )}
        </>}
      </div>
    </div>
  )
}

function ServiceForm({ start, onDone, onClose }) {
  const { profile } = useApp()
  const editing = !!start?.id
  const [f, setF] = useState(() => ({
    title: start?.title || '', category: start?.category || JOB_CATEGORIES[0].id, description: start?.description || '',
    pricing: start?.pricing || 'paid', price: start?.price || '', exchange: start?.exchange || '',
    arrangement: start?.arrangement || 'local', area: start?.area || '', availability: start?.id ? (start.availability || '') : 'Mon–Sat, 9:00 AM – 6:00 PM',
    photos: start?.photos || [],
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const addPhotos = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    setError('')
    for (const file of files.slice(0, 6 - f.photos.length)) {
      try { const p = await compressPhoto(file); setF((x) => ({ ...x, photos: [...x.photos, { url: p.src, data: p.src }].slice(0, 6) })) } catch (err) { setError(err.message) }
    }
  }
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const body = { ...f, currency: currencyOf(profile.country), photos: f.photos.map((p) => (p.data ? p.data : { id: p.id })) }
    try {
      const s = editing ? await api.updateService(start.id, body) : await api.createService(body)
      onDone(s)
    } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal-card svc-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="side-card-head"><Icon name="hand-coins" size={16} /> {editing ? 'Edit your service' : 'Offer a service'}</div>
        <label className="field"><span>What do you do?</span>
          <input value={f.title} onChange={set('title')} placeholder="e.g. Home cleaning, wedding photography, maths tutoring" maxLength={100} required />
        </label>
        <div className="field-row">
          <label className="field"><span>Category</span>
            <select className="job-select" value={f.category} onChange={set('category')}>
              {JOB_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Where</span>
            <select className="job-select" value={f.arrangement} onChange={set('arrangement')}>
              {Object.entries(WHERE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <label className="field"><span>About the service</span>
          <textarea value={f.description} onChange={set('description')} rows={4} maxLength={1500}
            placeholder="What’s included, your experience, tools you bring, how quickly you can start…" />
        </label>
        <div className="field"><span>Price</span>
          <div className="seg svc-pricing" role="radiogroup">
            {[['paid', 'Paid'], ['free', 'Free'], ['exchange', 'Skill swap']].map(([k, v]) => (
              <button key={k} type="button" role="radio" aria-checked={f.pricing === k} className={f.pricing === k ? 'on' : ''} onClick={() => set('pricing')(k)}>{v}</button>
            ))}
          </div>
          {f.pricing === 'paid' && <input value={f.price} onChange={set('price')} placeholder="Starting price, e.g. 15,000 per visit (leave empty for “Ask for a quote”)" maxLength={40} />}
          {f.pricing === 'exchange' && <input value={f.exchange} onChange={set('exchange')} placeholder="What you’d like in return" maxLength={200} required />}
        </div>
        {f.arrangement !== 'remote' && (
          <label className="field"><span>Area (optional)</span><input value={f.area} onChange={set('area')} placeholder="e.g. Yaba, Lekki" maxLength={60} /></label>
        )}
        <div className="field"><span>When you’re available</span><HoursPicker value={f.availability} onChange={set('availability')} /></div>
        <div className="field"><span>Proof of work: photos of jobs you’ve done (up to 6)</span>
          <div className="svc-photo-row">
            {f.photos.map((p, i) => (
              <span key={p.id || i} className="svc-photo">
                <img src={p.url} alt="" />
                <button type="button" aria-label="Remove photo" onClick={() => setF((x) => ({ ...x, photos: x.photos.filter((_, j) => j !== i) }))}><Icon name="x" size={12} /></button>
              </span>
            ))}
            {f.photos.length < 6 && (
              <label className="svc-photo add"><Icon name="camera" size={20} /><span>Add</span>
                <input type="file" accept="image/*" multiple hidden onChange={addPhotos} />
              </label>
            )}
          </div>
        </div>
        {error && <p className="auth-error"><Icon name="x" size={14} /> {error}</p>}
        <div className="composer-foot">
          <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
          <button className="btn primary small" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save' : 'Publish service'}</button>
        </div>
      </form>
    </div>
  )
}

export default function Services() {
  const { user, loading } = useApp()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'mine' ? 'mine' : 'browse'
  const category = params.get('category') || ''
  const query = params.get('q') || ''
  const openId = params.get('s')
  const setP = (k, v) => setParams((p) => { v ? p.set(k, v) : p.delete(k); return p }, { replace: true })
  const [list, setList] = useState(null)
  const [mine, setMine] = useState(null)
  const [form, setForm] = useState(params.get('new') === '1' ? {} : null)

  useEffect(() => {
    if (view !== 'browse') return
    setList(null)
    const t = setTimeout(() => api.listServices({ category, q: query.trim() }).then(setList).catch(() => setList([])), query ? 250 : 0)
    return () => clearTimeout(t)
  }, [view, category, query])
  const loadMine = () => api.myServices().then(setMine).catch(() => setMine([]))
  useEffect(() => { if (user) loadMine() }, [user])

  if (loading) return <div className="page"><p className="meta-dim" style={{ marginTop: 40 }}>Loading…</p></div>
  if (view === 'mine' && !user) return <Navigate to="/auth" replace />

  const pause = async (s) => { await api.updateService(s.id, { paused: !s.paused }); loadMine() }
  const remove = async (s) => { if (confirm(`Delete “${s.title}”? This can’t be undone.`)) { await api.deleteService(s.id); loadMine() } }
  const saved = (s) => {
    setForm(null); setP('new', '')
    loadMine()
    setList((l) => (l ? [s, ...l.filter((x) => x.id !== s.id)] : l))
  }

  return (
    <div className="page svc-page">
      <header className="page-head svc-head">
        <div>
          <h1>Services</h1>
          <p className="meta-dim">Hire people near you, see their past work and when they’re free, or offer what you can do.</p>
        </div>
        {user && <button className="btn primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Offer a service</button>}
      </header>

      <div className="seg float-bar biz-views" role="tablist" aria-label="Services">
        <button role="tab" aria-selected={view === 'browse'} className={view === 'browse' ? 'on' : ''} onClick={() => setP('view', '')}><Icon name="compass" size={15} /> Browse</button>
        {user && <button role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'on' : ''} onClick={() => setP('view', 'mine')}><Icon name="hand-coins" size={15} /> My services{mine?.length ? ` (${mine.length})` : ''}</button>}
        {user && <Link to="/jobs?view=mine" className="seg-link"><Icon name="briefcase" size={15} /> My jobs</Link>}
        {user && <Link to="/businesses?view=mine" className="seg-link"><Icon name="store" size={15} /> My businesses</Link>}
      </div>

      {view === 'browse' ? <>
        <label className="search-pill page-search">
          <Icon name="search" size={17} />
          <input type="search" value={query} onChange={(e) => setP('q', e.target.value)} placeholder="Search services — e.g. cleaning, makeup, tutoring" aria-label="Search services" />
        </label>
        <div className="chip-row svc-cats" role="tablist" aria-label="Categories">
          <button className={!category ? 'on' : ''} onClick={() => setP('category', '')}>All</button>
          {JOB_CATEGORIES.map((c) => (
            <button key={c.id} className={category === c.id ? 'on' : ''} onClick={() => setP('category', c.id)}><Icon name={c.icon} size={13} /> {c.label}</button>
          ))}
        </div>
        {list === null ? <p className="meta-dim">Loading…</p> : list.length === 0 ? (
          <section className="card feed-empty">
            <IconTile name="hand-coins" tone="grad" size={52} />
            <strong>{query || category ? 'No services match that yet' : 'No services yet'}</strong>
            <span className="meta-dim">Be the first: say what you can do, add photos of past work and when you’re free.</span>
            {user ? <button className="btn primary small" onClick={() => setForm({})}>Offer a service</button> : <Link to="/auth" className="btn primary small">Sign in</Link>}
          </section>
        ) : (
          <div className="svc-grid stagger">
            {list.map((s) => <ServiceCard key={s.id} service={s} onOpen={() => setP('s', s.id)} />)}
          </div>
        )}
      </> : (
        mine === null ? <p className="meta-dim">Loading…</p> : mine.length === 0 ? (
          <section className="card feed-empty">
            <IconTile name="hand-coins" tone="grad" size={52} />
            <strong>You’re not offering any services yet</strong>
            <span className="meta-dim">Tell people what you can do, show photos of past work, and say when you’re available.</span>
            <button className="btn primary small" onClick={() => setForm({})}>Offer a service</button>
          </section>
        ) : (
          <div className="svc-grid stagger">
            {mine.map((s) => (
              <ServiceCard key={s.id} service={s} onOpen={() => setP('s', s.id)} actions={(
                <span className="svc-actions">
                  <button className="btn ghost small" onClick={() => setForm(s)} aria-label="Edit"><Icon name="edit" size={13} /></button>
                  <button className="btn ghost small" onClick={() => pause(s)}>{s.paused ? 'Resume' : 'Pause'}</button>
                  <button className="btn ghost small danger" onClick={() => remove(s)} aria-label="Delete"><Icon name="trash" size={13} /></button>
                </span>
              )} />
            ))}
          </div>
        )
      )}

      {openId && <ServiceSheet key={openId} id={openId} onClose={() => setP('s', '')} onEdit={(s) => { setP('s', ''); setForm(s) }} />}
      {form && user && <ServiceForm start={form} onClose={() => { setForm(null); setP('new', '') }} onDone={saved} />}
    </div>
  )
}
