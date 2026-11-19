// A job from hiring to reviews (Nuel's Jobs & Services note,
// PLAN-NOTES-AND-GLOBAL.md §4), shown inside the job sheet. The poster
// sees who applied and can shortlist, decline or hire; hiring writes down
// an agreement the worker accepts; the job moves Open → Worker selected →
// In progress → Completed; then both review each other. Either side can
// report a problem, and the poster can pause a listing.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'
import { Avatar } from './bits.jsx'
import { Stars, StarPicker } from './Trust.jsx'
import { withCurrency } from '../countries.js'

const STEPS = [
  { id: 'open', label: 'Open' },
  { id: 'selected', label: 'Worker selected' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]
const APP_LABEL = { applied: 'Applied', shortlisted: 'Shortlisted', talking: 'In talks', hired: 'Hired', declined: 'Not selected', withdrawn: 'Withdrew' }
const OFF_TRACK = { cancelled: 'Cancelled', disputed: 'Disputed — with the VOIDAJ team', paused: 'Paused — hidden from the list' }

export function StageBar({ status }) {
  const at = STEPS.findIndex((s) => s.id === status)
  if (at < 0) return <p className={`job-stage-off ${status}`}><Icon name={status === 'paused' ? 'clock' : 'flag'} size={13} /> {OFF_TRACK[status] || status}</p>
  return (
    <ol className="job-stages" aria-label="Job progress">
      {STEPS.map((s, i) => <li key={s.id} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>{s.label}</li>)}
    </ol>
  )
}

function HireForm({ job, applicant, onHire, onCancel }) {
  const [price, setPrice] = useState(applicant.offer || job.budget || '')
  const [terms, setTerms] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="job-hire-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onHire(price, terms); setBusy(false) }}>
      <b>Hire {applicant.user.name}</b>
      <p className="meta-dim">This writes down what you agreed. They accept it before the work starts.</p>
      {job.opportunity === 'paid' && <label className="field"><span>Agreed price</span><input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 15,000" maxLength={60} /></label>}
      <label className="field"><span>Terms <em>optional</em></span><textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={600} placeholder="e.g. Materials provided. Finish by Saturday." /></label>
      <div className="composer-foot">
        <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
        <button className="btn primary small" disabled={busy}>{busy ? 'Hiring…' : 'Hire'}</button>
      </div>
    </form>
  )
}

export function JobFlow({ job, onChange }) {
  const [flow, setFlow] = useState(null)
  const [hiring, setHiring] = useState(null)
  const [stars, setStars] = useState(0)
  const [words, setWords] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { api.jobFlow(job.id).then(setFlow).catch(() => {}) }, [job.id, job.status])
  if (!flow) return null
  const { role, agreement } = flow
  const status = flow.job.status
  const apply = async (p) => {
    setError('')
    try { const f = await p; setFlow(f); onChange?.(f.job) } catch (e) { setError(e.message) }
  }
  const dispute = () => {
    const reason = window.prompt('What went wrong? The VOIDAJ team will look at it.')
    if (reason) apply(api.jobDispute(job.id, reason))
  }
  // Someone just browsing an open job sees none of this.
  if (!role && status === 'open') return null

  const other = role === 'poster' ? flow.worker : flow.job.poster
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
              <span><b>{a.user.name}</b><em>{a.note || APP_LABEL[a.status] || 'Applied'} · {a.ago} ago</em></span>
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
                <HireForm job={flow.job} applicant={a} onCancel={() => setHiring(null)}
                  onHire={(price, terms) => apply(api.jobApplicant(job.id, a.user.id, 'hire', { price, terms })).then(() => setHiring(null))} />
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
            {agreement.price && <li><Icon name="tag" size={14} /> {withCurrency(agreement.price, flow.job.currency)}</li>}
            {agreement.terms && <li><Icon name="info" size={14} /> {agreement.terms}</li>}
            <li><Icon name="clock" size={14} /> {agreement.acceptedAt ? `Accepted ${new Date(agreement.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Waiting for the worker to accept'}</li>
          </ul>
        </div>
      )}

      {role === 'worker' && status === 'selected' && (
        <div className="composer-foot job-flow-actions">
          <button className="btn ghost small" onClick={() => apply(api.answerAgreement(job.id, false))}>Turn it down</button>
          <button className="btn primary small" onClick={() => apply(api.answerAgreement(job.id, true))}>Accept and start</button>
        </div>
      )}

      {role && status === 'in_progress' && (
        <div className="composer-foot job-flow-actions">
          <button className="link-btn" onClick={dispute}><Icon name="flag" size={13} /> Report a problem</button>
          <button className="btn primary small" onClick={() => apply(api.jobStage(job.id, 'completed'))}><Icon name="check" size={14} /> Mark completed</button>
        </div>
      )}

      {role === 'poster' && ['open', 'paused', 'selected', 'in_progress'].includes(status) && (
        <div className="job-flow-minor">
          {status === 'open' && <button className="link-btn" onClick={() => apply(api.jobStage(job.id, 'paused'))}><Icon name="clock" size={13} /> Pause this listing</button>}
          {status === 'paused' && <button className="link-btn" onClick={() => apply(api.jobStage(job.id, 'open'))}><Icon name="play" size={13} /> Turn it back on</button>}
          {status === 'selected' && <button className="link-btn" onClick={dispute}><Icon name="flag" size={13} /> Report a problem</button>}
          <button className="link-btn" onClick={() => { if (window.confirm('Cancel this listing?')) apply(api.jobStage(job.id, 'cancelled')) }}><Icon name="x" size={13} /> Cancel</button>
        </div>
      )}

      {flow.dispute && <p className="job-pay-note"><Icon name="shield" size={13} /> {flow.dispute.byMe ? 'You reported' : 'The other person reported'} a problem: “{flow.dispute.reason}”. The VOIDAJ team will be in touch.</p>}

      {role && status === 'completed' && (
        <div className="job-review">
          <div className="side-card-head"><Icon name="star" size={15} /> Reviews</div>
          {flow.myReview ? (
            <p className="meta-dim">You gave {other?.name} <Stars value={flow.myReview.rating} />{flow.myReview.body ? `: “${flow.myReview.body}”` : ''}</p>
          ) : (
            <form className="job-review-form" onSubmit={(e) => { e.preventDefault(); if (stars) apply(api.jobReview(job.id, stars, words)) }}>
              <span>How was working with {other?.name}?</span>
              <StarPicker value={stars} onChange={setStars} />
              <input value={words} onChange={(e) => setWords(e.target.value)} maxLength={400} placeholder="A few words (optional)" />
              <button className="btn primary small" disabled={!stars}>Post review</button>
            </form>
          )}
          {flow.theirReview && <p className="meta-dim">{other?.name} gave you <Stars value={flow.theirReview.rating} />{flow.theirReview.body ? `: “${flow.theirReview.body}”` : ''}</p>}
        </div>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  )
}
