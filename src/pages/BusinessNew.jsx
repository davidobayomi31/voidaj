// Create Business — "Set up your business identity on VOIDAJ" (screen 3
// of Nuel's Business mockup): logo, name, category, description and
// location, then Create Business. The same form edits a business
// (/business/:id/edit), with a cover photo, contact details and hours.
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon } from '../components/Icons.jsx'
import { CoverPicker } from '../components/CoverPicker.jsx'
import { compressPhoto } from '../components/Media.jsx'
import { cities as citiesIn } from '../places.js'
import { useBusinessMeta } from '../components/BusinessBits.jsx'
import { PhoneInput, HoursPicker } from '../components/ContactPickers.jsx'

function LogoPicker({ value, name, onChange, onBusy }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); onBusy?.(true); setError('')
    try {
      const photo = await compressPhoto(file)
      onChange(await api.uploadImage(photo.src, 'business-logo'))
    } catch (err) { setError(err.message) }
    setBusy(false); onBusy?.(false)
  }
  const initials = (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <div className="biz-logo-pick">
      <button type="button" className="biz-logo-img large" onClick={() => input.current?.click()} aria-label={value ? 'Change logo' : 'Add a logo'} disabled={busy}>
        {value ? <img src={value} alt="" /> : initials || <Icon name="store" size={30} />}
        <span className="biz-logo-cam"><Icon name={busy ? 'clock' : 'camera'} size={15} /></span>
      </button>
      <span className="meta-dim">{error || (value ? 'Tap to change your logo' : 'Add your logo')}</span>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" hidden onChange={pick} />
    </div>
  )
}

const blank = { name: '', category: '', description: '', city: '', area: '', logo: '', cover: '', phone: '', website: '', hours: '' }

export default function BusinessNew() {
  const { id } = useParams()
  const editing = !!id
  const { user, loading } = useApp()
  const meta = useBusinessMeta()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [isBusiness, setIsBusiness] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    if (!editing) { setForm({ ...blank, city: user.city || '' }); return }
    api.getBusiness(id).then((b) => {
      if (!b.isOwner) { setError('Only the owner can edit this business.'); return }
      setForm(Object.fromEntries(Object.keys(blank).map((k) => [k, b[k] ?? ''])))
    }).catch((e) => setError(e.message))
  }, [user, id, editing])

  if (loading) return <div className="page"><p className="meta-dim" style={{ marginTop: 40 }}>Loading…</p></div>
  if (!user) return <Navigate to="/auth" replace />
  if (error && !form) return <div className="page"><div className="card feed-empty"><strong>{error}</strong><Link to="/businesses">Explore businesses</Link></div></div>
  if (!form) return <div className="page"><p className="meta-dim" style={{ marginTop: 40 }}>Loading…</p></div>

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const b = editing ? await api.updateBusiness(id, form) : await api.createBusiness(form)
      navigate(`/business/${b.id}`, { replace: true })
    } catch (err) { setError(err.message); setBusy(false) }
  }
  const remove = async () => {
    if (!window.confirm(`Delete ${form.name}? Its listings, followers and reviews go with it. This can’t be undone.`)) return
    await api.deleteBusiness(id)
    navigate('/businesses', { replace: true })
  }

  return (
    <div className="page biz-new">
      <header className="page-head">
        <h1>{editing ? 'Edit business' : 'Create Business'}</h1>
        <p className="meta-dim">Set up your business identity on VOIDAJ.</p>
      </header>

      {/* Sections instead of one long column, and a preview of how the
          page will look at the top (Nuel, Nov 13 + 18: "give this a new
          design look"). */}
      <form className="biz-form2" onSubmit={submit}>
        <div className="biz-preview" style={form.cover ? { '--img': `url(${form.cover})` } : undefined}>
          <span className="biz-preview-name">
            <b>{form.name || 'Your business name'}</b>
            <em>{meta?.categories.find((c) => c.id === form.category)?.label || 'Category'}{form.city ? ` · ${form.area ? `${form.area}, ` : ''}${form.city}` : ''}</em>
          </span>
        </div>

        <fieldset className="card biz-sec">
          <legend><Icon name="store" size={15} /> About the business</legend>
          <LogoPicker value={form.logo} name={form.name} onChange={(logo) => setForm((f) => ({ ...f, logo }))} onBusy={setUploading} />
          <label className="field"><span>Business name</span>
            <input value={form.name} onChange={set('name')} placeholder="e.g. Akinyede Estates" maxLength={80} required autoFocus={!editing} />
          </label>
          <label className="field"><span>Category</span>
            <select className="job-select" value={form.category} onChange={set('category')} required>
              <option value="" disabled>Pick a category</option>
              {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Description</span>
            <textarea rows={3} value={form.description} onChange={set('description')} maxLength={600} placeholder="What you do, e.g. Real estate · Property management · Sales & rentals" />
          </label>
        </fieldset>

        <fieldset className="card biz-sec">
          <legend><Icon name="map-pin" size={15} /> Where you are</legend>
          <div className="settings-row">
            <label className="field"><span>City or town</span>
              <input value={form.city} onChange={set('city')} placeholder="Your city" maxLength={40} list="biz-cities" autoComplete="address-level2" required />
              <datalist id="biz-cities">{citiesIn(user.country || 'NG').map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </label>
            <label className="field"><span>Area (optional)</span>
              <input value={form.area} onChange={set('area')} placeholder="A neighbourhood or district" maxLength={60} />
            </label>
          </div>
        </fieldset>

        {editing && (
          <>
            <fieldset className="card biz-sec">
              <legend><Icon name="image" size={15} /> Cover photo</legend>
              <CoverPicker kind="business-cover" label="Shown across the top of your business page" value={form.cover} onChange={(cover) => setForm((f) => ({ ...f, cover }))} onBusy={setUploading} />
            </fieldset>
            <fieldset className="card biz-sec">
              <legend><Icon name="phone" size={15} /> Contact</legend>
              <div className="settings-row">
                <div className="field"><span>Phone (optional)</span><PhoneInput value={form.phone} defaultCountry={user.country || 'NG'} onChange={(phone) => setForm((f) => ({ ...f, phone }))} /></div>
                <label className="field"><span>Website (optional)</span><input value={form.website} onChange={set('website')} placeholder="yourbusiness.com" maxLength={200} /></label>
              </div>
            </fieldset>
            <fieldset className="card biz-sec">
              <legend><Icon name="clock" size={15} /> Opening hours</legend>
              <HoursPicker value={form.hours} onChange={(hours) => setForm((f) => ({ ...f, hours }))} />
            </fieldset>
          </>
        )}

        {!editing && (
          <label className="card biz-toggle">
            <input type="checkbox" checked={isBusiness} onChange={(e) => setIsBusiness(e.target.checked)} />
            <span><b>Mark as business account</b><em>Your business gets its own page, separate from your personal profile. You stay the owner.</em></span>
          </label>
        )}

        {error && <div className="auth-error"><Icon name="info" size={14} /> {error}</div>}
        <div className="biz-savebar">
          {editing && <button type="button" className="btn ghost small danger" onClick={remove}><Icon name="trash" size={14} /> Delete business</button>}
          <button className="btn primary" disabled={busy || uploading || !form.name.trim() || !form.category || !form.city.trim() || (!editing && !isBusiness)}>
            {busy ? 'Saving…' : editing ? 'Save changes' : <>Create Business <Icon name="check" size={16} /></>}
          </button>
        </div>
      </form>
    </div>
  )
}
