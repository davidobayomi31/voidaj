// Ads — local businesses that back the city. The rail is its own bar
// down the right side of the screen, top to bottom, with "Post advert"
// at its foot. The page makes room for it
// rather than sliding under it.
// One ad is enlarged at a time for 5s, then minimizes as the next
// takes its turn, looping continuously. Businesses pay to be listed;
// payment is simulated (no real processor wired up in this prototype).
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'
import { compressPhoto } from './Media.jsx'
import { ADS_CLICKABLE } from '../features.js'

const ACCENTS = ['#C0342A', '#1F5FA8', '#1B7F3B', '#6B3FA0', '#B45309', '#0F6E6E']

// Advertisers pick their own accent, and a light one (a yellow, say) left
// the white monogram unreadable. Pick ink or white from the accent's
// luminance so the initials stay legible whatever colour they choose.
function inkOn(hex) {
  const m = /^#?([a-f\d]{6})$/i.exec(String(hex || '').trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  // Contrast against white vs against near-black; take whichever reads better.
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0931) ? '#ffffff' : '#0A0A0A'
}

// Pictures for the example ads, taken from images already in the project,
// so they look like real businesses until real advertisers sign up. Each
// uses a different picture, and none of them is the Lagos skyline.
const SAMPLE_COVERS = {
  'Kola Foods': '/images/communities/balogun-market-hub.jpg',
  'Adire by Funke': '/images/events/ev-market-popup.jpg',
  'SunHome Solar': '/images/events/ev-solar-workshop.jpg',
  'Folake Bakes': '/images/events/ev-farm-tour.jpg',
  'Naija Devs Bootcamp': '/images/events/ev-js-study.jpg',
  'Green Roots Nursery': '/images/events/ev-balcony-farm.jpg',
  'AfroRoam Travel': '/images/city/abuja.jpg',
  'CodeBridge Africa': '/images/communities/naija-devs.jpg',
  'Pure Water Co.': '/images/jobs/plumbing.jpg',
  'Arewa Threads': '/images/city/kaduna.jpg',
  'Capital Fitness': '/images/events/ev-pitch-night.jpg',
  'Garden City Grills': '/images/city/benin-city.jpg',
  'Kano Spice House': '/images/city/kano.jpg',
  'Ibadan Print Hub': '/images/city/ibadan.jpg',
}
export const coverOf = (ad) => ad.cover || SAMPLE_COVERS[ad.businessName] || ''

// The advertiser's logo if they gave one, otherwise a monogram from the
// name in their own accent colour, inside a ring like a profile picture.
export function AdMark({ ad, size }) {
  const initials = ad.businessName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const dim = size ? { width: size, height: size, fontSize: Math.round(size * 0.36) } : undefined
  if (ad.logo) return <span className="ad-mark has-logo" style={dim} aria-hidden="true"><img src={ad.logo} alt="" /></span>
  return <span className="ad-mark" style={{ background: `linear-gradient(145deg, ${ad.accent}, color-mix(in srgb, ${ad.accent} 62%, #000))`, color: inkOn(ad.accent), ...dim }} aria-hidden="true">{initials}</span>
}

// Shown when the API is unreachable or no ads exist yet, so the panel is
// never empty. These are examples, not paying advertisers.
export const FALLBACK_ADS = [
  { id: 'fallback-1', businessName: 'Kola Foods', tagline: 'Snacks made from grandma’s recipes', ctaLabel: 'Order now', accent: '#B4472A' },
  { id: 'fallback-2', businessName: 'Adire by Funke', tagline: 'Modern cuts, hand-dyed textiles', ctaLabel: 'Shop the drop', accent: '#A8306A' },
  { id: 'fallback-3', businessName: 'SunHome Solar', tagline: 'Off the generator in 3 weeks', ctaLabel: 'Get a quote', accent: '#7A5A0F' },
  { id: 'fallback-4', businessName: 'Folake Bakes', tagline: 'Small-chops for every occasion', ctaLabel: 'See menu', accent: '#8F5513' },
  { id: 'fallback-5', businessName: 'Naija Devs Bootcamp', tagline: 'Learn to code, get mentored, get hired', ctaLabel: 'Enroll now', accent: '#0F6E6E' },
  { id: 'fallback-6', businessName: 'Green Roots Nursery', tagline: 'Seedlings and soil for your balcony farm', ctaLabel: 'Visit us', accent: '#1B7F3B' },
]

// Where an ad goes when it can be opened. Until there are real paying
// advertisers (features.js: ADS_CLICKABLE) ads aren't links at all.
const adTarget = (ad) => (ad.link || (ad.id.startsWith('fallback') ? '/events' : `/business/${ad.id}`))

// One ad, as a card: cover, logo, name, line, and the button. Wrapped in a
// link only when ads are clickable.
function AdCard({ ad, active }) {
  const cover = coverOf(ad)
  const body = (
    <>
      <span className="ad2-cover" style={cover ? { '--img': `url(${cover})` } : undefined}>
        <span className="ad2-tag">Sponsored</span>
      </span>
      <span className="ad2-body">
        <AdMark ad={ad} size={40} />
        <strong>{ad.businessName}</strong>
        <span className="ad2-line">{ad.tagline}</span>
        <span className="ad2-cta">{ad.ctaLabel || 'Learn more'}</span>
      </span>
    </>
  )
  const cls = `ad2${active ? ' enlarged' : ''}${ADS_CLICKABLE ? ' clickable' : ''}`
  const style = { '--accent': ad.accent }
  if (!ADS_CLICKABLE) return <div className={cls} style={style} aria-label={`Sponsored: ${ad.businessName}`}>{body}</div>
  const to = adTarget(ad)
  return /^https?:/.test(to)
    ? <a className={cls} style={style} href={to} target="_blank" rel="noopener noreferrer sponsored">{body}</a>
    : <Link className={cls} style={style} to={to}>{body}</Link>
}

// A logo or cover picked from the device, kept as a small JPEG data URL.
function ImagePick({ label, hint, value, onChange, round }) {
  const [error, setError] = useState('')
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    try { onChange((await compressPhoto(f)).src) } catch (err) { setError(err.message) }
  }
  return (
    <label className={`adform-pick${round ? ' round' : ''}${value ? ' has' : ''}`}>
      {value ? <img src={value} alt="" /> : <span><Icon name="camera" size={18} /><b>{label}</b><em>{hint}</em></span>}
      <input type="file" accept="image/*" hidden onChange={pick} />
      {error && <em className="auth-error">{error}</em>}
    </label>
  )
}

// "Post an advert": a request that the VOIDAJ team reviews before it goes
// live (server/ads.js). Nothing is charged here.
function AdvertiseForm({ onClose }) {
  const { user } = useApp()
  const [form, setForm] = useState({
    businessName: '', tagline: '', ctaLabel: 'Learn more', accent: ACCENTS[1],
    contactEmail: user?.email || '', phone: '', link: '', logo: '', cover: '',
  })
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { await api.createAd(form); setSent(true) } catch (err) { setError(err.message) }
    setBusy(false)
  }
  const preview = { ...form, businessName: form.businessName || 'Your business', tagline: form.tagline || 'One line about what you offer', id: 'preview' }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal-card adform" onClick={(e) => e.stopPropagation()}>
        <div className="side-card-head"><Icon name="tag" size={16} /> Advertise on VOIDAJ</div>
        {sent ? (
          <div className="adform-sent">
            <Icon name="check" size={28} />
            <b>Request sent</b>
            <p className="meta-dim">We’ll look at it and email you at {form.contactEmail}, usually within a day. Nothing is charged until you’ve agreed the details with us.</p>
            <button className="btn primary small" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form className="composer-full" onSubmit={submit}>
            <p className="meta-dim">Tell us about your business. Someone on the VOIDAJ team reviews every advert before it goes live.</p>
            <div className="adform-media">
              <ImagePick round label="Logo" hint="Square works best" value={form.logo} onChange={set('logo')} />
              <ImagePick label="Cover photo" hint="Shows at the top of your ad" value={form.cover} onChange={set('cover')} />
            </div>
            <input className="composer-title" value={form.businessName} onChange={set('businessName')} placeholder="Business name" maxLength={60} required autoFocus />
            <input className="job-input" value={form.tagline} onChange={set('tagline')} placeholder="One-line tagline" maxLength={90} />
            <div className="job-form-row">
              <input className="job-input" value={form.ctaLabel} onChange={set('ctaLabel')} placeholder="Button text (e.g. Order now)" maxLength={20} />
              <span className="adform-swatches" role="radiogroup" aria-label="Brand colour">
                {ACCENTS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={form.accent === c} className={form.accent === c ? 'on' : ''} style={{ background: c }} onClick={() => set('accent')(c)} aria-label={c} />
                ))}
              </span>
            </div>
            <div className="job-form-row">
              <input className="job-input" type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="Email we can reach you on" required />
              <input className="job-input" type="tel" value={form.phone} onChange={set('phone')} placeholder="Phone or WhatsApp (optional)" maxLength={30} />
            </div>
            <input className="job-input" value={form.link} onChange={set('link')} placeholder="Website or page to send people to (optional)" maxLength={200} />
            <div className="adform-preview">
              <span className="meta-dim">How it will look</span>
              <AdCard ad={preview} />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <div className="composer-foot">
              <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
              <button className="btn primary small" disabled={busy || form.businessName.trim().length < 2}>{busy ? 'Sending…' : 'Send request'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// Real ads first; the examples only fill the panel when there are none.
const useRailAds = () => {
  const [ads, setAds] = useState([])
  useEffect(() => {
    api.listAds().then((a) => setAds(a.length ? a : FALLBACK_ADS)).catch(() => setAds(FALLBACK_ADS))
  }, [])
  return ads
}

// The panel shows a few ads at a time and rotates through the rest.
const RAIL_SHOWN = 3
const windowOf = (list, start, n) => (list.length <= n ? list : Array.from({ length: n }, (_, k) => list[(start + k) % list.length]))

export function AdsRail() {
  const { user } = useApp()
  const { pathname } = useLocation()
  const ads = useRailAds()
  const [active, setActive] = useState(0)
  const [showForm, setShowForm] = useState(false)
  // The panel floats beside the page and can be closed (Nuel, Nov 11: "Can
  // this float also I want it to be that it can be removed if we wanted to
  // without causing any difference"). Closing it gives the page its full
  // width; a small Ads button brings it back. Remembered on this device.
  const [closed, setClosed] = useState(() => { try { return localStorage.getItem('voidaj_ads_closed') === '1' } catch { return false } })
  const setAdsClosed = (v) => { setClosed(v); try { localStorage.setItem('voidaj_ads_closed', v ? '1' : '0') } catch { /* private mode */ } }

  useEffect(() => {
    if (ads.length <= RAIL_SHOWN) return
    const t = setInterval(() => setActive((i) => (i + 1) % ads.length), 6000)
    return () => clearInterval(t)
  }, [ads.length])

  const navigate = useNavigate()
  // Not beside chats, admin, or the full-screen sign-in and welcome pages.
  // No adverts beside a legal page.
  const hidden = ['/chats', '/admin', '/auth', '/welcome', '/privacy', '/terms'].some((p) => pathname.startsWith(p))

  // The bar is part of the layout, so the page needs to know to make room.
  useEffect(() => {
    if (hidden || closed) return
    document.body.classList.add('has-ads-rail')
    return () => document.body.classList.remove('has-ads-rail')
  }, [hidden, closed])

  if (hidden) return null
  if (closed) {
    return (
      <button className="ads-reopen" onClick={() => setAdsClosed(false)} aria-label="Show sponsored">
        <Icon name="tag" size={13} /> Sponsored
      </button>
    )
  }

  return (
    <aside className="ads-rail ads-float" aria-label="Sponsored">
      <div className="ads-rail-head">
        <div className="ads-rail-label"><Icon name="tag" size={12} /> Sponsored</div>
        <button className="ads-close" onClick={() => setAdsClosed(true)} aria-label="Close sponsored" title="Close"><Icon name="x" size={16} /></button>
      </div>
      <div className="ads-stack">
        {windowOf(ads, active, RAIL_SHOWN).map((ad, i) => <AdCard key={ad.id} ad={ad} active={i === 0} />)}
      </div>
      <div className="ads-rail-foot">
        <span className="meta-dim">Your business here</span>
        <button className="btn brand-outline small ads-rail-cta" onClick={() => (user ? setShowForm(true) : navigate('/auth'))}>
          <Icon name="plus" size={13} /> Advertise
        </button>
      </div>
      {showForm && <AdvertiseForm onClose={() => setShowForm(false)} />}
    </aside>
  )
}

// Ads inside the page itself, for phones, which have no room for the rail
// (My City). The highlighted one rotates like the rail.
export function HomeAds({ max = 4 }) {
  const { user } = useApp()
  const navigate = useNavigate()
  const all = useRailAds()
  const [i, setI] = useState(0)
  const [showForm, setShowForm] = useState(false)
  useEffect(() => {
    if (all.length <= max) return
    const t = setInterval(() => setI((n) => (n + 1) % all.length), 5000)
    return () => clearInterval(t)
  }, [all.length, max])
  return (
    <div className="partners-panel" aria-label="Sponsored">
      <div className="hx-label"><Icon name="tag" size={12} /> Sponsored</div>
      <div className="partners-list">
        {windowOf(all, i, max).map((ad, n) => <AdCard key={ad.id} ad={ad} active={n === 0} />)}
      </div>
      <button type="button" className="btn brand-outline small" onClick={() => (user ? setShowForm(true) : navigate('/auth'))}>
        <Icon name="plus" size={13} /> Advertise
      </button>
      {showForm && <AdvertiseForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

// Ads in search. When someone searches, one ad sits under the real
// matches: an ad whose name or tagline matches the search if there is
// one, otherwise one of the paying advertisers in turn. It is always
// labelled.
let adsCache = null
export function useAds() {
  const [ads, setAds] = useState(adsCache || FALLBACK_ADS)
  useEffect(() => {
    if (adsCache) return
    api.listAds().then((a) => { adsCache = a.length ? a : FALLBACK_ADS; setAds(adsCache) }).catch(() => {})
  }, [])
  return ads
}

export function pickSearchAd(ads, term) {
  if (!ads.length || term.length < 2) return null
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  const hit = ads.find((a) => words.some((w) => `${a.businessName} ${a.tagline}`.toLowerCase().includes(w)))
  if (hit) return hit
  const n = [...term].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  return ads[n % ads.length]
}

export function SearchAd({ ad }) {
  return (
    <div className="search-ad" style={{ '--accent': ad.accent }}>
      <AdMark ad={ad} />
      <div className="search-ad-text">
        <strong>{ad.businessName}</strong>
        <span>{ad.tagline}</span>
      </div>
      <span className="search-ad-tag">Sponsored</span>
    </div>
  )
}
