// A job from hiring to reviews (Nuel's Jobs & Services note,
// PLAN-NOTES-AND-GLOBAL.md §4), shown inside the job sheet. The poster
// sees who applied (with their record) and can shortlist, decline or hire;
// hiring writes down an agreement the worker accepts; the job moves Open →
// Worker selected → In progress → Completed; then both review each other.
// On paid jobs the money side and the rules that keep both sides honest
// (server/payments.js, server/job-safety.js) show up here too: the
// up-front part, price changes, proof photos, "please fix this", no-shows,
// cancellation fees and problem reports with the other side's answer.
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'
import { Avatar } from './bits.jsx'
import { Stars, StarPicker, RecordLine } from './Trust.jsx'
import { compressPhoto } from './Media.jsx'
import { withCurrency } from '../countries.js'
import { nairaInWords } from '../money-words.js'

const STEPS = [
  { id: 'open', label: 'Open' },
  { id: 'selected', label: 'Worker selected' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]
const APP_LABEL = { applied: 'Applied', shortlisted: 'Shortlisted', talking: 'In talks', hired: 'Hired', declined: 'Not selected', withdrawn: 'Withdrew' }
const OFF_TRACK = { cancelled: 'Cancelled', disputed: 'Disputed — with the VOIDAJ team', paused: 'Paused — hidden from the list' }
// What a problem report can be about (server/jobs-flow.js REPORT_KINDS).
const REPORT_KINDS = [
  ['not_done', 'The work wasn’t done'],
  ['poor_quality', 'The work isn’t good enough'],
  ['no_show', 'Someone didn’t show up'],
  ['not_paid', 'I haven’t been paid'],
  ['damage', 'Something was damaged or taken'],
  ['off_platform', 'Asked to pay outside VOIDAJ'],
  ['other', 'Something else'],
]
const KIND_TEXT = Object.fromEntries(REPORT_KINDS)
const OUTCOME_TEXT = { pay_full: 'the worker is paid in full', pay_part: 'the worker is paid part of the price', cancel: 'the job is cancelled with nothing more to pay' }

export function StageBar({ status }) {
  const at = STEPS.findIndex((s) => s.id === status)
  if (at < 0) return <p className={`job-stage-off ${status}`}><Icon name={status === 'paused' ? 'clock' : 'flag'} size={13} /> {OFF_TRACK[status] || status}</p>
  return (
    <ol className="job-stages" aria-label="Job progress">
      {STEPS.map((s, i) => <li key={s.id} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>{s.label}</li>)}
    </ol>
  )
}

// What the poster will be charged for a price: the price itself (all of it
// goes to the worker) plus Paystack's processing fee.
function useQuote(price, currency, on) {
  const [quote, setQuote] = useState(null)
  useEffect(() => {
    if (!on) return
    setQuote(null)
    const t = setTimeout(() => { api.paymentQuote(price, currency).then(setQuote).catch(() => setQuote(null)) }, 300)
    return () => clearTimeout(t)
  }, [price, currency, on])
  return on ? quote : null
}

// Sends the poster to Paystack to save a card (a ₦50 check, returned),
// then back to this job.
async function goSaveCard(jobId, setError) {
  try { window.location.href = await api.startCardSetup(jobId) } catch (e) { setError(e.message) }
}

// Up to four photos, shrunk in the browser before they're sent.
function PhotoPick({ photos, setPhotos, label = 'Add photos' }) {
  const [error, setError] = useState('')
  const add = async (files) => {
    setError('')
    const next = [...photos]
    for (const f of [...files].slice(0, 4 - photos.length)) {
      try { next.push((await compressPhoto(f)).src) } catch (e) { setError(e.message) }
    }
    setPhotos(next)
  }
  return (
    <div className="job-photo-pick">
      {photos.map((src, i) => (
        <span key={i} className="job-photo-thumb">
          <img src={src} alt="" />
          <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
        </span>
      ))}
      {photos.length < 4 && (
        <label className="btn ghost small">
          <Icon name="camera" size={14} /> {label}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </label>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  )
}

function Photos({ list, title }) {
  if (!list.length) return null
  return (
    <div className="job-photos">
      <span className="meta-dim">{title}</span>
      <div>{list.map((p) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" loading="lazy" /></a>)}</div>
    </div>
  )
}

function HireForm({ job, applicant, payable, onHire, onCancel }) {
  const [price, setPrice] = useState(applicant.offer || job.budget || '')
  const [upfront, setUpfront] = useState('')
  const [terms, setTerms] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [confirmLarge, setConfirmLarge] = useState(false)
  const quote = useQuote(price, job.currency, payable)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setCode('')
    try { await onHire({ price, terms, ...(upfront.trim() ? { upfront } : {}), confirmLarge }) } catch (err) { setError(err.message); setCode(err.code || '') }
    setBusy(false)
  }
  const large = quote && quote.amount >= 10_000_000
  return (
    <form className="job-hire-form" onSubmit={submit}>
      <b>Hire {applicant.user.name}</b>
      <p className="meta-dim">This writes down what you agreed. They accept it before the work starts.</p>
      {job.opportunity === 'paid' && <label className="field"><span>Agreed price</span><input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 15,000" maxLength={60} /></label>}
      {payable && (
        <>
          <p className="job-pay-quote">
            {quote
              ? <><span>{applicant.user.name.split(' ')[0]} gets <b>{quote.label.amount}</b></span><span>Card fee <b>{quote.label.fee}</b></span><span>You pay <b>{quote.label.total}</b>, when the job is done</span><span className="job-pay-words">That’s {nairaInWords(quote.amount)}.</span></>
              : <span className="meta-dim">Enter the price as a number, like 15,000, to see the total.</span>}
          </p>
          <label className="field">
            <span>Part paid when they start <em>optional</em></span>
            <input value={upfront} onChange={(e) => setUpfront(e.target.value)} placeholder="e.g. 5,000 for materials" maxLength={60} />
            <small className="meta-dim">Up to half the price, charged when they accept. It’s theirs to keep, even if the job is cancelled. The rest is charged when it’s done.</small>
          </label>
          {(large || code === 'confirm_amount') && (
            <label className="check-row"><input type="checkbox" checked={confirmLarge} onChange={(e) => setConfirmLarge(e.target.checked)} /> Yes, {quote?.label.amount || 'this amount'} is right</label>
          )}
        </>
      )}
      <label className="field"><span>Terms <em>optional</em></span><textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={600} placeholder="e.g. Materials provided. Finish by Saturday." /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {code === 'card_required' && <button type="button" className="btn brand-outline small" onClick={() => goSaveCard(job.id, setError)}><Icon name="wallet" size={14} /> Add a card</button>}
      {code === 'new_account_limit' && <Link to="/settings/verification" className="btn brand-outline small"><Icon name="shield" size={14} /> Get ID verified</Link>}
      <div className="composer-foot">
        <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
        <button className="btn primary small" disabled={busy || (large && !confirmLarge)}>{busy ? 'Hiring…' : 'Hire'}</button>
      </div>
    </form>
  )
}

const fmtDay = (t) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// One charge that didn't go through: the poster can try again or pay
// another way.
function RetryButtons({ job, p, apply, setError, busy, run }) {
  const charge = () => run(() => apply(api.chargeJob(job.id, p.id).then(() => api.jobFlow(job.id))))
  const checkout = () => run(async () => { try { window.location.href = await api.checkoutJob(job.id, p.id) } catch (e) { setError(e.message) } })
  return <><button className="btn ghost small" disabled={busy} onClick={charge}>Try my card again</button><button className="btn primary small" disabled={busy} onClick={checkout}>Pay another way</button></>
}

// Where a paid-through-VOIDAJ job's money stands, for the poster and the
// worker (server/payments.js).
function PaymentPanel({ flow, job, apply, onDispute, onChanges, setError }) {
  const p = flow.payment
  const poster = flow.role === 'poster'
  const [busy, setBusy] = useState(false)
  if (!p) return null
  const name = poster ? flow.worker?.name?.split(' ')[0] : flow.job.poster?.name?.split(' ')[0]
  const run = async (fn) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const charge = () => run(() => apply(api.chargeJob(job.id, p.id).then(() => api.jobFlow(job.id))))
  const retry = p.retryAt ? ` We’ll try the card again on ${fmtDay(p.retryAt)}.` : ''
  let line
  let actions = null
  switch (p.status) {
    case 'not_started':
      line = poster ? <>Paid through VOIDAJ. Your saved card is charged <b>{p.label.total}</b> when the job is done; {name} gets the full <b>{p.label.amount}</b>.</>
        : <>Paid through VOIDAJ. You get the full <b>{p.label.amount}</b> when the job is done, straight to your bank.</>
      break
    case 'awaiting':
      line = poster ? <>{name} marked this job done. Check it, then confirm to pay <b>{p.label.total}</b>, ask for changes, or report a problem. If you do none of those, your card is charged on {fmtDay(p.confirmBy)}.</>
        : <>Waiting for {name} to confirm. If they don’t, their card is charged on {fmtDay(p.confirmBy)}.</>
      if (poster) {
        actions = <>
          <button className="link-btn" onClick={onDispute}><Icon name="flag" size={13} /> Report a problem</button>
          {flow.agreement?.changesLeft > 0 && <button className="btn ghost small" onClick={onChanges}>Ask for changes</button>}
          <button className="btn primary small" disabled={busy} onClick={charge}><Icon name="check" size={14} /> Confirm and pay {p.label.total}</button>
        </>
      }
      break
    case 'pending':
    case 'charging':
      line = <>The payment is going through…</>
      break
    case 'due':
      line = poster ? <>The payment of <b>{p.label.total}</b> didn’t go through{p.failure ? `: ${p.failure}` : ''}.{retry} You can’t hire anyone new until it’s paid.</>
        : <>{name}’s payment didn’t go through yet. They’ve been asked to pay another way, and can’t hire anyone else until you’re paid.{retry}</>
      if (poster) actions = <RetryButtons job={job} p={p} apply={apply} setError={setError} busy={busy} run={run} />
      break
    case 'paid':
      line = poster ? <>Paid <b>{p.label.total}</b>{p.paidAt ? ` on ${fmtDay(p.paidAt)}` : ''}. {name} got the full {p.label.amount}.</>
        : <>You’ve been paid <b>{p.label.amount}</b>. It reaches your bank on Paystack’s next payout, usually the next working day.</>
      break
    case 'cancelled':
      line = <>No payment is due on this job.</>
      break
    default:
      return null
  }
  return (
    <div className={`job-payment ${p.status}`}>
      <div className="side-card-head"><Icon name="wallet" size={15} /> Payment</div>
      <p>{line}</p>
      {actions && <div className="composer-foot job-flow-actions">{actions}</div>}
      {flow.extras.map((x) => <ExtraLine key={x.id} x={x} poster={poster} job={job} apply={apply} setError={setError} busy={busy} run={run} />)}
      <p className="job-pay-safety"><Icon name="shield" size={12} /> Only trust what this page says about payment. A screenshot or text message saying “I’ve paid” isn’t proof, and money paid outside VOIDAJ isn’t protected.</p>
    </div>
  )
}

// The up-front part or a cancellation fee, under the main payment.
function ExtraLine({ x, poster, ...rest }) {
  const what = x.kind === 'upfront' ? 'Up-front part' : 'Cancellation fee'
  const text = {
    paid: poster ? `${what}: ${x.label.total} paid.` : `${what}: you’ve been paid ${x.label.amount}.`,
    due: poster ? `${what} of ${x.label.total} didn’t go through${x.failure ? `: ${x.failure}` : ''}.` : `${what} of ${x.label.amount} hasn’t been paid yet.${x.kind === 'upfront' ? ' Wait for it before buying materials.' : ''}`,
    cancelled: `${what}: not charged.`,
  }[x.status] || `${what}: ${x.label.total}, going through…`
  return (
    <div className={`job-pay-extra ${x.status}`}>
      <p>{text}</p>
      {poster && x.status === 'due' && <div className="composer-foot job-flow-actions"><RetryButtons p={x} {...rest} /></div>}
    </div>
  )
}

// A new price either side proposes; the other accepts or declines.
function PriceChange({ flow, job, apply }) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const pc = flow.priceChange
  const other = flow.role === 'poster' ? flow.worker?.name : flow.job.poster?.name
  if (pc) {
    return (
      <div className="job-price-change">
        {pc.byMe
          ? <><p>You proposed a new price of <b>{pc.label}</b>. Waiting for {other} to accept.</p><button className="link-btn" onClick={() => apply(api.answerPrice(job.id, pc.id, { cancel: true }))}>Withdraw</button></>
          : <><p>{other} proposed a new price of <b>{pc.label}</b>{pc.note ? `: “${pc.note}”` : '.'}</p>
            <div className="composer-foot job-flow-actions">
              <button className="btn ghost small" onClick={() => apply(api.answerPrice(job.id, pc.id, { accept: false }))}>Decline</button>
              <button className="btn primary small" onClick={() => apply(api.answerPrice(job.id, pc.id, { accept: true }))}>Accept {pc.label}</button>
            </div></>}
      </div>
    )
  }
  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}><Icon name="tag" size={13} /> Change the price</button>
  return (
    <form className="job-hire-form" onSubmit={(e) => { e.preventDefault(); apply(api.proposePrice(job.id, price, note)).then(() => setOpen(false)) }}>
      <label className="field"><span>New price</span><input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 18,000" maxLength={60} required /></label>
      <label className="field"><span>Why <em>optional</em></span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Two extra rooms" /></label>
      <p className="meta-dim">{other} has to accept it before it counts.</p>
      <div className="composer-foot"><button type="button" className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary small">Propose</button></div>
    </form>
  )
}

// Report a problem: what kind, what happened, photos.
function ReportForm({ flow, onSubmit, onCancel }) {
  const [category, setCategory] = useState(flow.role === 'worker' && flow.job.status === 'cancelled' ? 'no_show' : 'not_done')
  const [reason, setReason] = useState('')
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  return (
    <form className="job-hire-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSubmit({ category, reason, photos }); setBusy(false) }}>
      <b>Report a problem</b>
      <p className="meta-dim">Nothing is charged while the VOIDAJ team looks at it. The other person gets 48 hours to give their side, and the team decides using both accounts and the job’s record. Reports found to be made up count against you.</p>
      <label className="field"><span>What’s wrong</span>
        <select className="job-select" value={category} onChange={(e) => setCategory(e.target.value)}>{REPORT_KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      </label>
      <label className="field"><span>What happened</span><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="A sentence or two: what was agreed, and what went wrong." required /></label>
      <PhotoPick photos={photos} setPhotos={setPhotos} label="Add photos as evidence" />
      <div className="composer-foot"><button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button><button className="btn primary small" disabled={busy || reason.trim().length < 10}>{busy ? 'Sending…' : 'Send report'}</button></div>
    </form>
  )
}

function DisputeBox({ flow, job, apply }) {
  const d = flow.dispute
  const [response, setResponse] = useState('')
  const [photos, setPhotos] = useState([])
  if (!d) return null
  const evidence = flow.photos.filter((p) => p.purpose === 'evidence')
  return (
    <div className="job-dispute">
      <div className="side-card-head"><Icon name="shield" size={15} /> Problem report{d.status === 'resolved' ? ' — decided' : ''}</div>
      <p><b>{d.byMe ? 'You' : 'The other person'}</b> reported: {KIND_TEXT[d.category] || 'Something else'}. “{d.reason}”</p>
      {d.response && <p><b>{d.byMe ? 'Their' : 'Your'} answer:</b> “{d.response}”</p>}
      <Photos list={evidence} title="Evidence" />
      {d.status === 'resolved'
        ? <p>The VOIDAJ team decided that {OUTCOME_TEXT[d.outcome] || 'the job is closed'}.{d.note ? ` ${d.note}` : ''}</p>
        : d.canRespond
          ? (
            <form className="job-hire-form" onSubmit={(e) => { e.preventDefault(); apply(api.answerDispute(job.id, response, photos)) }}>
              <label className="field"><span>Your side, by {fmtDay(d.respondBy)}</span><textarea rows={3} value={response} onChange={(e) => setResponse(e.target.value)} maxLength={1000} placeholder="What happened from your side?" required /></label>
              <PhotoPick photos={photos} setPhotos={setPhotos} label="Add photos as evidence" />
              <div className="composer-foot"><button className="btn primary small" disabled={response.trim().length < 10}>Send my side</button></div>
            </form>
          )
          : <p className="meta-dim">The VOIDAJ team is looking at it and will email you both.</p>}
    </div>
  )
}

export function JobFlow({ job, onChange }) {
  const [flow, setFlow] = useState(null)
  const [hiring, setHiring] = useState(null)
  const [stars, setStars] = useState(0)
  const [words, setWords] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState('') // 'report' | 'changes' | 'done'
  const [photos, setPhotos] = useState([])
  const [note, setNote] = useState('')

  const [needsPayout, setNeedsPayout] = useState(false)
  const [params, setParams] = useSearchParams()
  useEffect(() => { api.jobFlow(job.id).then(setFlow).catch(() => {}) }, [job.id, job.status])
  // Back from Paystack (saving a card, or Pay another way): check the
  // reference with the server, then tidy the address.
  const back = params.get('paystack')
  const reference = params.get('reference') || params.get('trxref')
  useEffect(() => {
    if (!back || !reference) return
    api.verifyPayment(reference)
      .then((r) => { if (!r.ok) setError(back === 'card' ? 'That card couldn’t be saved. Try another card.' : 'That payment didn’t go through.') })
      .catch((e) => setError(e.message))
      .finally(() => {
        api.jobFlow(job.id).then(setFlow).catch(() => {})
        setParams((p) => { p.delete('paystack'); p.delete('reference'); p.delete('trxref'); return p }, { replace: true })
      })
  }, [back, reference]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!flow) return null
  const { role, agreement } = flow
  const status = flow.job.status
  const apply = async (p) => {
    setError(''); setNeedsPayout(false)
    try { const f = await p; setFlow(f); onChange?.(f.job); setForm(''); setPhotos([]); setNote('') } catch (e) { setError(e.message); setNeedsPayout(e.code === 'payout_required') }
  }
  const cancel = () => {
    const fee = flow.cancelFee
    const ask = fee
      ? `${flow.worker?.name || 'The worker'} accepted this job more than an hour ago, so cancelling now charges your card a cancellation fee of ${fee.label}, paid to them. If they never showed up, use “They didn’t show up” instead. Cancel and pay the fee?`
      : 'Cancel this job?'
    if (window.confirm(ask)) apply(api.jobStage(job.id, 'cancelled', fee ? { acceptFee: true } : {}))
  }
  const noShow = () => {
    if (window.confirm(`Report that ${flow.worker?.name || 'the worker'} didn’t show up? The job is cancelled with nothing to pay, it shows on their record, and they can dispute it.`)) apply(api.reportNoShow(job.id))
  }
  // Someone just browsing an open job sees none of this.
  if (!role && status === 'open') return null

  const other = role === 'poster' ? flow.worker : flow.job.poster
  const proof = flow.photos.filter((p) => p.purpose === 'proof')
  const working = ['selected', 'in_progress'].includes(status)
  return (
    <section className="job-flow">
      <StageBar status={status} />

      {role === 'poster' && (status === 'open' || status === 'paused') && (
        <div className="job-applicants">
          <div className="side-card-head"><Icon name="users" size={15} /> {job.kind === 'service' ? 'Interested' : 'Applicants'} ({flow.applicants.length})</div>
          {flow.applicants.length === 0 && <p className="meta-dim">No one yet. People who apply or make an offer show up here.</p>}
          {flow.applicants.map((a) => (
            <div key={a.user.id} className={`job-offer-item ${a.status}`}>
              <Avatar user={a.user} size={34} />
              <span><b>{a.user.name}</b><em>{a.note || APP_LABEL[a.status] || 'Applied'} · {a.ago} ago</em><RecordLine record={a.record} as="worker" /></span>
              {a.offer && <strong>{withCurrency(a.offer, flow.job.currency)}</strong>}
              <span className="job-applicant-actions">
                <Link to={`/chats?dm=${a.user.id}&job=${job.id}`} className="btn ghost small" aria-label={`Message ${a.user.name}`}><Icon name="message-circle" size={14} /></Link>
                {status === 'open' && a.status !== 'declined' && a.status !== 'withdrawn' && <>
                  <button className="btn ghost small" onClick={() => apply(api.jobApplicant(job.id, a.user.id, a.status === 'shortlisted' ? 'unshortlist' : 'shortlist'))}>{a.status === 'shortlisted' ? 'Shortlisted ✓' : 'Shortlist'}</button>
                  <button className="btn ghost small" onClick={() => apply(api.jobApplicant(job.id, a.user.id, 'decline'))}>Decline</button>
                  <button className="btn primary small" onClick={() => setHiring(a)}>Hire</button>
                </>}
              </span>
              {hiring?.user.id === a.user.id && (
                <HireForm job={flow.job} applicant={a} payable={flow.payable} onCancel={() => setHiring(null)}
                  onHire={async (body) => { const f = await api.jobApplicant(job.id, a.user.id, 'hire', body); setFlow(f); onChange?.(f.job); setHiring(null) }} />
              )}
            </div>
          ))}
        </div>
      )}

      {agreement && (
        <div className="job-agreement">
          <div className="side-card-head"><Icon name="check" size={15} /> Agreement</div>
          <ul className="job-facts">
            <li><Icon name="user" size={14} /> {role === 'poster' ? <>Worker: <Link to={`/profile/${flow.worker?.id}`}>{flow.worker?.name}</Link></> : <>Hired by <Link to={`/profile/${flow.job.poster.id}`}>{flow.job.poster.name}</Link></>}</li>
            {role === 'worker' && flow.posterRecord && <li><Icon name="wallet" size={14} /> <RecordLine record={flow.posterRecord} as="poster" empty="New to paid jobs on VOIDAJ" /></li>}
            {agreement.price && <li><Icon name="tag" size={14} /> {withCurrency(agreement.price, flow.job.currency)}{agreement.upfront ? `, ${agreement.upfront.label} of it when the work starts` : ''}</li>}
            {agreement.terms && <li><Icon name="info" size={14} /> {agreement.terms}</li>}
            <li><Icon name="clock" size={14} /> {agreement.acceptedAt ? `Accepted ${new Date(agreement.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Waiting for the worker to accept'}</li>
          </ul>
          {role && working && <PriceChange flow={flow} job={job} apply={apply} />}
        </div>
      )}

      <PaymentPanel flow={flow} job={job} apply={apply} setError={setError}
        onDispute={() => setForm('report')} onChanges={() => setForm('changes')} />

      <Photos list={proof} title="Photos of the finished work" />

      {form === 'changes' && (
        <form className="job-hire-form" onSubmit={(e) => { e.preventDefault(); apply(api.askForChanges(job.id, note)) }}>
          <b>Ask for changes</b>
          <p className="meta-dim">The job goes back to in progress and nothing is charged until {other?.name} marks it done again. You can do this {flow.agreement?.changesLeft === 1 ? 'once more' : `${flow.agreement?.changesLeft} times`}.</p>
          <label className="field"><span>What still needs doing</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} required /></label>
          <div className="composer-foot"><button type="button" className="btn ghost small" onClick={() => setForm('')}>Cancel</button><button className="btn primary small" disabled={note.trim().length < 10}>Send back</button></div>
        </form>
      )}

      {form === 'report' && <ReportForm flow={flow} onCancel={() => setForm('')} onSubmit={(body) => apply(api.jobDispute(job.id, body.reason, { category: body.category, photos: body.photos }))} />}

      {role === 'worker' && status === 'selected' && (
        <div className="composer-foot job-flow-actions">
          <button className="btn ghost small" onClick={() => apply(api.answerAgreement(job.id, false))}>Turn it down</button>
          <button className="btn primary small" onClick={() => apply(api.answerAgreement(job.id, true))}>Accept and start</button>
        </div>
      )}

      {role === 'worker' && status === 'in_progress' && form === 'done' && (
        <form className="job-hire-form" onSubmit={(e) => { e.preventDefault(); apply(api.jobStage(job.id, 'completed', { photos })) }}>
          <b>Mark the job done</b>
          <p className="meta-dim">Add photos of the finished work if you can. If there’s ever a disagreement, they’re your proof.</p>
          <PhotoPick photos={photos} setPhotos={setPhotos} />
          <div className="composer-foot"><button type="button" className="btn ghost small" onClick={() => setForm('')}>Cancel</button><button className="btn primary small"><Icon name="check" size={14} /> Mark completed</button></div>
        </form>
      )}

      {role && status === 'in_progress' && !form && (
        <div className="composer-foot job-flow-actions">
          <button className="link-btn" onClick={() => setForm('report')}><Icon name="flag" size={13} /> Report a problem</button>
          <button className="btn primary small" onClick={() => (role === 'worker' ? setForm('done') : apply(api.jobStage(job.id, 'completed')))}><Icon name="check" size={14} /> Mark completed</button>
        </div>
      )}

      {role === 'poster' && ['open', 'paused', 'selected', 'in_progress'].includes(status) && (
        <div className="job-flow-minor">
          {status === 'open' && <button className="link-btn" onClick={() => apply(api.jobStage(job.id, 'paused'))}><Icon name="clock" size={13} /> Pause this listing</button>}
          {status === 'paused' && <button className="link-btn" onClick={() => apply(api.jobStage(job.id, 'open'))}><Icon name="play" size={13} /> Turn it back on</button>}
          {status === 'selected' && !form && <button className="link-btn" onClick={() => setForm('report')}><Icon name="flag" size={13} /> Report a problem</button>}
          {status === 'in_progress' && !proof.length && <button className="link-btn" onClick={noShow}><Icon name="user" size={13} /> They didn’t show up</button>}
          <button className="link-btn" onClick={cancel}><Icon name="x" size={13} /> Cancel{flow.cancelFee ? ` (fee ${flow.cancelFee.label})` : ''}</button>
        </div>
      )}

      {flow.noShow && !flow.noShow.overturned && (
        <p className="job-pay-note"><Icon name="user" size={13} /> {role === 'poster' ? 'You reported that the worker didn’t show up.' : 'The poster reported that you didn’t show up. If that’s wrong, report a problem within 7 days.'}</p>
      )}
      {role === 'worker' && status === 'cancelled' && flow.noShow && !flow.noShow.overturned && !flow.dispute && !form && (
        <button className="link-btn" onClick={() => setForm('report')}><Icon name="flag" size={13} /> I did show up</button>
      )}

      <DisputeBox flow={flow} job={job} apply={apply} />

      {role && (flow.canReview || flow.myReview || flow.theirReview) && (
        <div className="job-review">
          <div className="side-card-head"><Icon name="star" size={15} /> Reviews</div>
          {flow.myReview && <p className="meta-dim">You gave {other?.name} <Stars value={flow.myReview.rating} />{flow.myReview.body ? `: “${flow.myReview.body}”` : ''}{!flow.theirReview && flow.canReview ? '. It shows once they leave theirs, or after a week; you can change it until then.' : ''}</p>}
          {flow.canReview && !flow.myReview && (
            <form className="job-review-form" onSubmit={(e) => { e.preventDefault(); if (stars) apply(api.jobReview(job.id, stars, words)) }}>
              <span>{status === 'cancelled' ? `How was ${other?.name} on this job?` : `How was working with ${other?.name}?`}</span>
              <StarPicker value={stars} onChange={setStars} />
              <input value={words} onChange={(e) => setWords(e.target.value)} maxLength={400} placeholder="A few words (optional)" />
              <button className="btn primary small" disabled={!stars}>Post review</button>
            </form>
          )}
          {flow.reviewWaiting && <p className="meta-dim">{other?.name} has reviewed you. You’ll see it once you’ve left yours, or after a week.</p>}
          {flow.theirReview && <p className="meta-dim">{other?.name} gave you <Stars value={flow.theirReview.rating} />{flow.theirReview.body ? `: “${flow.theirReview.body}”` : ''}</p>}
        </div>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {needsPayout && <Link to="/settings/payments" className="btn brand-outline small"><Icon name="wallet" size={14} /> Add your bank account</Link>}
    </section>
  )
}
