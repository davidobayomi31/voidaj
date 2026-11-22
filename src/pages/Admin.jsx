// Admin — the CEO's view of everyone on VOIDAJ: sign-up numbers at a
// glance, then every account in a sortable, searchable table that
// downloads as a spreadsheet. Only accounts marked admin can open it (the
// server checks; this page just explains if you aren't one).
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon } from '../components/Icons.jsx'
import { AdminAccounts } from '../components/AdminAccounts.jsx'
import { AdminAnalytics } from '../components/AdminAnalytics.jsx'
import { AdMark, coverOf } from '../components/AdsRail.jsx'

const DAY = 24 * 3600 * 1000
const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const ago = (ts) => {
  if (!ts) return 'Never'
  const d = Math.floor((Date.now() - ts) / DAY)
  return d < 1 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? `${d} days ago` : fmt(ts)
}

const COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'city', label: 'Location' },
  { id: 'joinedAt', label: 'Joined' },
  { id: 'lastActiveAt', label: 'Last active' },
  { id: 'idVerified', label: 'Verified' },
  { id: 'communities', label: 'Communities' },
  { id: 'posts', label: 'Posts' },
  { id: 'jobsPosted', label: 'Jobs' },
]

export default function Admin() {
  const { user, loading } = useApp()
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [samples, setSamples] = useState(false)
  const [sort, setSort] = useState({ by: 'joinedAt', desc: true })
  const [params, setParams] = useSearchParams()
  const tab = ['analytics', 'accounts', 'disputes', 'ids', 'ads'].includes(params.get('tab')) ? params.get('tab') : 'members'
  const setTab = (t) => setParams((p) => { t !== 'members' ? p.set('tab', t) : p.delete('tab'); return p }, { replace: true })

  useEffect(() => {
    if (!user?.isAdmin) return
    api.adminUsers().then(setUsers).catch((e) => setError(e.message))
  }, [user?.isAdmin])

  const real = useMemo(() => (users ?? []).filter((u) => !u.sample), [users])
  const stats = useMemo(() => {
    const now = Date.now()
    const since = (days) => real.filter((u) => u.joinedAt && now - u.joinedAt < days * DAY).length
    return [
      { label: 'Members', value: real.length, sub: 'real accounts' },
      { label: 'Joined today', value: since(1) },
      { label: 'This week', value: since(7) },
      { label: 'This month', value: since(30) },
      { label: 'Active this week', value: real.filter((u) => u.lastActiveAt && now - u.lastActiveAt < 7 * DAY).length },
      { label: 'Finished sign-up', value: real.length ? `${Math.round((real.filter((u) => u.onboarded).length / real.length) * 100)}%` : '—' },
      { label: 'ID verified', value: real.filter((u) => u.idVerified).length },
    ]
  }, [real])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = (samples ? users ?? [] : real).filter((u) =>
      !term || [u.name, u.handle, u.email, u.phone, u.city, u.area].join(' ').toLowerCase().includes(term))
    const text = ['name', 'email', 'phone', 'city'].includes(sort.by)
    return [...list].sort((a, b) => {
      const c = text
        ? String(a[sort.by] || '').localeCompare(String(b[sort.by] || ''))
        : Number(a[sort.by] || 0) - Number(b[sort.by] || 0)
      return sort.desc ? -c : c
    })
  }, [users, real, samples, q, sort])

  if (loading) return <div className="page"><p className="meta-dim" style={{ marginTop: 40 }}>Loading…</p></div>
  if (!user) return <Navigate to="/auth?mode=login" replace />
  if (!user.isAdmin) {
    return (
      <div className="page admin-page">
        <div className="card ghost-card left" style={{ marginTop: 40 }}>
          <Icon name="lock" size={22} />
          <p><strong>Admins only.</strong><br />This page lists every account on VOIDAJ. Ask the VOIDAJ team if you need access.</p>
        </div>
      </div>
    )
  }

  const toggleSort = (by) => setSort((s) => (s.by === by ? { by, desc: !s.desc } : { by, desc: true }))

  return (
    <div className="page admin-page">
      <section className="page-head">
        <div>
          <h1><Icon name="shield" size={22} /> Admin</h1>
          <p className="meta-dim">Only admins can see this page.</p>
        </div>
        {tab === 'members' && <a href={api.adminUsersCsvUrl} className="btn primary small" download><Icon name="arrow-down" size={14} /> Download CSV</a>}
      </section>

      <div className="view-switch" role="tablist" aria-label="Admin">
        <button role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'on' : ''} onClick={() => setTab('members')}>
          <Icon name="users" size={15} /> Members
        </button>
        <button role="tab" aria-selected={tab === 'analytics'} className={tab === 'analytics' ? 'on' : ''} onClick={() => setTab('analytics')}>
          <Icon name="trending-up" size={15} /> Analytics
        </button>
        <button role="tab" aria-selected={tab === 'accounts'} className={tab === 'accounts' ? 'on' : ''} onClick={() => setTab('accounts')}>
          <Icon name="lock" size={15} /> Company accounts
        </button>
        <button role="tab" aria-selected={tab === 'ids'} className={tab === 'ids' ? 'on' : ''} onClick={() => setTab('ids')}>
          <Icon name="badge-check" size={15} /> ID checks
        </button>
        <button role="tab" aria-selected={tab === 'ads'} className={tab === 'ads' ? 'on' : ''} onClick={() => setTab('ads')}>
          <Icon name="tag" size={15} /> Ads
        </button>
        <button role="tab" aria-selected={tab === 'disputes'} className={tab === 'disputes' ? 'on' : ''} onClick={() => setTab('disputes')}>
          <Icon name="flag" size={15} /> Job disputes
        </button>
      </div>

      {tab === 'analytics' ? <AdminAnalytics /> : tab === 'ads' ? <AdminAds /> : tab === 'ids' ? <AdminIdChecks /> : tab === 'disputes' ? <AdminDisputes /> : tab === 'accounts' ? <AdminAccounts /> : <>

      <div className="admin-stats">
        {stats.map((s) => (
          <div key={s.label} className="admin-stat">
            <b>{users ? s.value : '…'}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="admin-tools">
        <form className="search-pill" role="search" onSubmit={(e) => e.preventDefault()}>
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, area…" aria-label="Search accounts" />
        </form>
        <label className="admin-check">
          <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} /> Show sample accounts
        </label>
        <span className="meta-dim">{shown.length} {shown.length === 1 ? 'account' : 'accounts'}</span>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {users === null && !error ? <p className="meta-dim">Loading accounts…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.id} aria-sort={sort.by === c.id ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" onClick={() => toggleSort(c.id)}>
                      {c.label} {sort.by === c.id && <Icon name={sort.desc ? 'arrow-down' : 'arrow-up'} size={12} />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/profile/${u.id}`} className="admin-name">{u.name}</Link>
                    <span className="meta-dim">{u.handle}{u.sample && ' · sample'}{u.admin && ' · admin'}{!u.onboarded && ' · didn’t finish sign-up'}</span>
                  </td>
                  <td>{u.email ? <a href={`mailto:${u.email}`}>{u.email}</a> : '—'}</td>
                  <td>{u.phone || '—'}</td>
                  <td>{[u.area, u.city].filter(Boolean).join(', ') || '—'}</td>
                  <td>{fmt(u.joinedAt)}</td>
                  <td>{ago(u.lastActiveAt)}</td>
                  <td>{u.idVerified ? <span className="verified-tag"><Icon name="badge-check" size={12} /> Yes</span> : 'No'}</td>
                  <td className="num">{u.communities}</td>
                  <td className="num">{u.posts}</td>
                  <td className="num">{u.jobsPosted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </div>
  )
}

// Problems reported on Quick Jobs (server/jobs-flow.js), and the payment
// checks that need a look (server/job-safety.js). Opening a dispute shows
// both accounts, the photos and the job's record; deciding it pays the
// worker in full or in part, or cancels with nothing owed.
const KIND = { not_done: 'Work not done', poor_quality: 'Poor quality', no_show: 'No-show', not_paid: 'Not paid', damage: 'Damage or theft', off_platform: 'Asked to pay outside VOIDAJ', other: 'Other' }
const FLAG = { same_person: 'Same person on both sides', shared_connection: 'Same internet connection', shared_bank: 'Bank account on two accounts', shared_card: 'Card on two accounts', name_mismatch: 'Bank name doesn’t match', chargeback: 'Chargeback' }
const day = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function DisputeDetail({ id, onDone }) {
  const [d, setD] = useState(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [unfounded, setUnfounded] = useState(false)
  const [noShow, setNoShow] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { api.adminDispute(id).then(setD).catch((e) => setMsg(e.message)) }, [id])
  if (!d) return <p className="meta-dim">{msg || 'Loading…'}</p>
  const decide = async (outcome) => {
    setMsg('')
    try {
      const r = await api.resolveDispute(id, { outcome, amount, note, unfounded, noShow })
      if (r.warning) window.alert(r.warning)
      onDone()
    } catch (e) { setMsg(e.message) }
  }
  const open = d.disputeStatus === 'open'
  return (
    <div className="admin-dispute-detail">
      <p><b>{d.byRole === 'poster' ? d.poster?.name : d.worker?.name}</b> ({d.byRole}) · {KIND[d.category] || d.category}: “{d.reason}”</p>
      <p>{d.response ? <><b>Answer:</b> “{d.response}”</> : <span className="meta-dim">No answer yet (due {day(d.respondBy)})</span>}</p>
      {d.agreement && <p className="meta-dim">Agreed: {d.agreement.price}{d.agreement.terms ? ` · ${d.agreement.terms}` : ''} · sent back {d.agreement.changeRounds}×</p>}
      {d.payments.map((p) => <p key={p.id} className="meta-dim">{p.kind}: {p.label} · {p.status}{p.chargeback ? ` · chargeback ${p.chargeback}` : ''}</p>)}
      {d.photos.length > 0 && <div className="job-photos"><div>{d.photos.map((p) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.purpose}><img src={p.url} alt={p.purpose} /></a>)}</div></div>}
      <details><summary>Job record ({d.events.length})</summary>
        <ul className="admin-events">{d.events.map((e, i) => <li key={i}>{day(e.at)} · <b>{e.by}</b> · {e.action}{e.detail ? ` (${e.detail})` : ''}{e.ip ? ` · ${e.ip}` : ''}</li>)}</ul>
      </details>
      {open && (
        <div className="admin-decide">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to both (optional)" maxLength={600} />
          <label className="check-row"><input type="checkbox" checked={unfounded} onChange={(e) => setUnfounded(e.target.checked)} /> The report was made up</label>
          <label className="check-row"><input type="checkbox" checked={noShow} onChange={(e) => setNoShow(e.target.checked)} /> Count a no-show against the worker</label>
          <span className="composer-foot">
            <button className="btn ghost small" onClick={() => decide('cancel')}>Cancel, nothing owed</button>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Part, e.g. 10,000" maxLength={20} style={{ width: 130 }} />
            <button className="btn ghost small" disabled={!amount} onClick={() => decide('pay_part')}>Pay part</button>
            <button className="btn primary small" onClick={() => decide('pay_full')}>Pay in full</button>
          </span>
        </div>
      )}
      {msg && <p className="auth-error" role="alert">{msg}</p>}
    </div>
  )
}

function AdminDisputes() {
  const [list, setList] = useState(null)
  const [flags, setFlags] = useState([])
  const [openId, setOpenId] = useState('')
  const load = () => {
    api.adminDisputes().then(setList).catch(() => setList([]))
    api.adminFlags().then(setFlags).catch(() => setFlags([]))
  }
  useEffect(() => { load() }, [])
  if (!list) return <p className="meta-dim">Loading…</p>
  return (
    <div className="stack">
      {flags.length > 0 && (
        <div className="card admin-dispute">
          <b><Icon name="shield" size={15} /> Payment checks ({flags.length})</b>
          <ul className="admin-flags">
            {flags.map((f) => (
              <li key={f.id}>
                <span><b>{FLAG[f.kind] || f.kind}</b> · {f.user?.name}{f.other ? ` and ${f.other.name}` : ''}{f.jobId ? <> · <Link to={`/jobs?job=${f.jobId}`}>job</Link></> : ''}<em className="meta-dim"> {f.detail}</em></span>
                <button className="btn ghost small" onClick={async () => { await api.clearFlag(f.id); load() }}>Looked at it</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!list.length && <p className="meta-dim empty-note">No job disputes.</p>}
      {list.map((d) => (
        <div key={d.id} className="card admin-dispute">
          <b><Link to={`/jobs?job=${d.jobId}`}>{d.jobTitle}</Link></b>
          <p>{KIND[d.category] || 'Other'}: “{d.reason}”</p>
          <em className="meta-dim">Raised by {d.by?.name} · {day(d.at)} · {d.status === 'open' ? (d.answered ? 'answered' : `answer due ${day(d.respondBy)}`) : `decided: ${d.outcome || 'closed'}`}</em>
          <span className="composer-foot"><button className="btn ghost small" onClick={() => setOpenId(openId === d.id ? '' : d.id)}>{openId === d.id ? 'Close' : d.status === 'open' ? 'Look at it' : 'Details'}</button></span>
          {openId === d.id && <DisputeDetail id={d.id} onDone={() => { setOpenId(''); load() }} />}
        </div>
      ))}
    </div>
  )
}

// ID checks waiting for a person to look at them (server/id-checks.js).
// Compare the selfie with the ID photo and the name with the account;
// deciding deletes both photos.
const REJECT_REASONS = [
  'The photo is blurry or cut off. Please retake it with all four corners showing.',
  'The face in the selfie doesn’t match the ID.',
  'The name on the ID doesn’t match the name you typed.',
  'This ID has expired.',
]
function AdminIdChecks() {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [reasons, setReasons] = useState({})
  const [busy, setBusy] = useState('')
  const load = () => api.adminVerifications().then(setList).catch((e) => { setError(e.message); setList([]) })
  useEffect(() => { load() }, [])
  if (!list) return <p className="meta-dim">Loading…</p>
  const decide = async (c, decision) => {
    setBusy(c.id); setError('')
    try { await api.decideVerification(c.id, decision, reasons[c.id] || ''); await load() } catch (e) { setError(e.message) }
    setBusy('')
  }
  const pending = list.filter((c) => c.status === 'pending')
  const done = list.filter((c) => c.status !== 'pending')
  return (
    <div className="stack">
      {error && <p className="auth-error">{error}</p>}
      <p className="meta-dim" style={{ marginTop: 12 }}>{pending.length ? `${pending.length} waiting.` : 'Nothing waiting.'} Check that the selfie matches the ID, the ID looks real and in date, and the name matches. Both photos are deleted when you decide.</p>
      {pending.map((c) => (
        <div key={c.id} className="card admin-idcheck">
          <div className="admin-idcheck-head">
            <b>{c.user?.name || 'Unknown'}</b>
            <span className="meta-dim">{c.user?.email} · {c.docLabel} · sent {fmt(c.submittedAt)}{c.user?.birthDate ? ` · born ${c.user.birthDate}` : ''}</span>
            <span>Name on ID (as typed): <b>{c.legalName}</b></span>
          </div>
          <div className="admin-idcheck-photos">
            <a href={c.document} target="_blank" rel="noreferrer"><img src={c.document} alt="ID document" /></a>
            <a href={c.selfie} target="_blank" rel="noreferrer"><img src={c.selfie} alt="Selfie with ID" /></a>
          </div>
          <select className="job-select" value={reasons[c.id] || ''} onChange={(e) => setReasons((r) => ({ ...r, [c.id]: e.target.value }))}>
            <option value="">Reason if rejecting…</option>
            {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="composer-foot">
            <button className="btn ghost small" disabled={busy === c.id || !reasons[c.id]} onClick={() => decide(c, 'reject')}>Reject</button>
            <button className="btn primary small" disabled={busy === c.id} onClick={() => decide(c, 'approve')}><Icon name="check" size={14} /> Approve</button>
          </span>
        </div>
      ))}
      {done.length > 0 && <h3 className="admin-sub">Decided</h3>}
      {done.map((c) => (
        <div key={c.id} className="card admin-dispute">
          <b>{c.user?.name} <span className={c.status === 'approved' ? 'verified-tag' : 'meta-dim'}>{c.status}</span></b>
          <em className="meta-dim">{c.docLabel} · {fmt(c.reviewedAt)}{c.reviewer ? ` by ${c.reviewer.name}` : ''}{c.reason ? ` · “${c.reason}”` : ''}</em>
          {c.status === 'approved' && c.user && (
            <span className="composer-foot"><button className="btn ghost small" onClick={async () => { if (confirm(`Remove ${c.user.name}'s Verified badge?`)) { await api.revokeVerification(c.user.id); load() } }}>Remove badge</button></span>
          )}
        </div>
      ))}
    </div>
  )
}

// Advert requests waiting for a person to look at them (server/ads.js).
// Shown the way they'll appear in the Sponsored panel. Deciding emails the
// advertiser.
const AD_REJECT = [
  'We can’t advertise this kind of business on VOIDAJ.',
  'The picture or text isn’t suitable. Please change it and send it again.',
  'We couldn’t tell what the business offers. Please add a clearer line.',
  'We couldn’t reach you on the contact details given.',
]
function AdminAds() {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState('')
  const load = () => api.adminAds().then(setList).catch((e) => { setError(e.message); setList([]) })
  useEffect(() => { load() }, [])
  if (!list) return <p className="meta-dim">Loading…</p>
  const decide = async (a, decision) => {
    setBusy(a.id); setError('')
    try { await api.decideAd(a.id, decision, notes[a.id] || ''); await load() } catch (e) { setError(e.message) }
    setBusy('')
  }
  const pending = list.filter((a) => a.status === 'pending')
  const rest = list.filter((a) => a.status !== 'pending')
  return (
    <div className="stack">
      {error && <p className="auth-error">{error}</p>}
      <p className="meta-dim" style={{ marginTop: 12 }}>{pending.length ? `${pending.length} waiting.` : 'Nothing waiting.'} Approve to put it in the Sponsored panel and email the advertiser, or reject with a reason.</p>
      {pending.map((a) => (
        <div key={a.id} className="card admin-idcheck">
          <div className="admin-idcheck-head">
            <b>{a.businessName}</b>
            <span className="meta-dim">{a.owner?.name} · {a.contactEmail}{a.phone ? ` · ${a.phone}` : ''} · sent {fmt(a.createdAt)}</span>
            {a.link && <span className="meta-dim">Link: <a href={a.link} target="_blank" rel="noreferrer">{a.link}</a></span>}
          </div>
          <div className="ad2" style={{ '--accent': a.accent, maxWidth: 260 }}>
            <span className="ad2-cover" style={coverOf(a) ? { '--img': `url(${coverOf(a)})` } : undefined}><span className="ad2-tag">Sponsored</span></span>
            <span className="ad2-body"><AdMark ad={a} size={40} /><strong>{a.businessName}</strong><span className="ad2-line">{a.tagline}</span><span className="ad2-cta">{a.ctaLabel}</span></span>
          </div>
          <select className="job-select" value={notes[a.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}>
            <option value="">Reason if rejecting…</option>
            {AD_REJECT.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="composer-foot">
            <button className="btn ghost small" disabled={busy === a.id || !notes[a.id]} onClick={() => decide(a, 'reject')}>Reject</button>
            <button className="btn primary small" disabled={busy === a.id} onClick={() => decide(a, 'approve')}><Icon name="check" size={14} /> Approve</button>
          </span>
        </div>
      ))}
      {rest.length > 0 && <h3 className="admin-sub">Everything else</h3>}
      {rest.map((a) => (
        <div key={a.id} className="card admin-dispute">
          <b>{a.businessName} <span className={a.status === 'live' ? 'verified-tag' : 'meta-dim'}>{a.status}</span></b>
          <em className="meta-dim">{a.owner?.name || 'Example'}{a.reviewNote ? ` · “${a.reviewNote}”` : ''}</em>
          {a.status === 'live' && <span className="composer-foot"><button className="btn ghost small" onClick={() => decide(a, 'pause')}>Take down</button></span>}
          {a.status === 'paused' && <span className="composer-foot"><button className="btn ghost small" onClick={() => decide(a, 'approve')}>Put back</button></span>}
        </div>
      ))}
    </div>
  )
}
