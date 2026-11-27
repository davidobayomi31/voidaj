// ── Jobs & Services: from hiring to reviews ──────────────────────────
// Nuel's Jobs & Services note (Nov 12), PLAN-NOTES-AND-GLOBAL.md §4.
// A job moves Open → Worker selected → In progress → Completed (or
// Cancelled / Disputed). The poster shortlists and hires; hiring writes an
// agreement (who, the price, any terms) that the worker accepts; when it's
// done both sides review each other. A service can be paused. Paid jobs in
// a currency Paystack takes are paid through VOIDAJ (server/payments.js);
// the rules that keep both sides honest are in server/job-safety.js.
import crypto from 'crypto'
import q, { publicUser, getUserById, serializeJob, timeAgo } from './db.js'
import { requireAuth } from './auth.js'
import * as guard from './guard.js'
import { readImage } from './storage.js'
import { noticeEmail } from './email-templates.js'
import * as payments from './payments.js'
import {
  hireCheck, raiseFlag, logEvent, recordFor, savePhotos, photosFor, revealed, reportBanUntil, cancelFeeFor, jobSafetyRoutes,
  CANCEL_GRACE_MS, REPORT_WINDOW_MS, RESPOND_MS, MAX_CHANGE_ROUNDS, MAX_PHOTOS,
} from './job-safety.js'

const { isPayable, parseAmount, feeFor, money, cardOf, payoutOf, paymentFor, extrasFor, paymentView, startJobPayment, cancelJobPayment, chargeSavedCard, chargeExtra } = payments
const uid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`
const now = () => Date.now()
const err = (res, code, msg, extra = {}) => res.status(code).json({ error: msg, ...extra })
const teamEmail = () => (process.env.TEAM_NOTIFY_EMAIL || process.env.ADS_NOTIFY_EMAIL || '').trim() || 'hello@voidaj.com'

export const JOB_STAGES = ['open', 'paused', 'selected', 'in_progress', 'completed', 'cancelled', 'disputed']
// What a problem report is about.
export const REPORT_KINDS = ['not_done', 'poor_quality', 'no_show', 'not_paid', 'damage', 'off_platform', 'other']

async function loadJob(req, res) {
  const job = await q.get('SELECT * FROM jobs WHERE id = ?', String(req.params.id).slice(0, 80))
  if (!job) { err(res, 404, 'Job not found.'); return null }
  return job
}
const roleIn = (job, userId) => (job.poster_id === userId ? 'poster' : job.worker_id && job.worker_id === userId ? 'worker' : null)
const setStage = (jobId, status) => q.run('UPDATE jobs SET status = ?, status_at = ? WHERE id = ?', status, now(), jobId)
const reload = (jobId) => q.get('SELECT * FROM jobs WHERE id = ?', jobId)
const notify = async (userId, email) => {
  const u = await getUserById(userId)
  if (u?.email) guard.sendMail(u.email, email.subject, email.text, email.html).catch(() => {})
}

const reviewOut = async (r) => ({
  rating: r.rating, body: r.body || '', at: r.created_at, ago: timeAgo(r.created_at),
  from: publicUser(await getUserById(r.from_id)), jobId: r.job_id,
})

// What the poster would owe the worker for cancelling now: 10% of the
// price once the worker accepted more than an hour ago, less anything
// already paid up front (the worker keeps that).
async function cancelFeeNow(job, agreement) {
  if (!isPayable(job) || job.status !== 'in_progress' || !agreement?.amount || !agreement.accepted_at) return 0
  if (now() - Number(agreement.accepted_at) < CANCEL_GRACE_MS) return 0
  const upfront = (await extrasFor(job.id)).find((x) => x.kind === 'upfront' && x.status === 'paid')
  return Math.max(0, cancelFeeFor(agreement.amount) - (upfront ? Number(upfront.amount) : 0))
}

// Everything one job's page needs, from where the viewer stands.
async function flowFor(job, viewerId) {
  const role = roleIn(job, viewerId)
  const [agreement, reviews, applicants, dispute] = await Promise.all([
    q.get('SELECT * FROM job_agreements WHERE job_id = ?', job.id),
    q.all('SELECT * FROM job_reviews WHERE job_id = ?', job.id),
    role === 'poster'
      ? q.all(`SELECT u.*, ji.status AS app_status, ji.offer, ji.offer_note, ji.created_at AS applied_at FROM job_interests ji
          JOIN users u ON u.id = ji.user_id WHERE ji.job_id = ? AND u.deleted_at IS NULL ORDER BY ji.created_at`, job.id)
      : [],
    q.get("SELECT * FROM job_disputes WHERE job_id = ? ORDER BY created_at DESC LIMIT 1", job.id),
  ])
  const [extras, photos, priceChange, noShow] = role
    ? await Promise.all([
      extrasFor(job.id), photosFor(job.id),
      q.get("SELECT * FROM job_price_changes WHERE job_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1", job.id),
      q.get('SELECT * FROM job_no_shows WHERE job_id = ?', job.id),
    ])
    : [[], [], null, null]
  const worker = job.worker_id ? publicUser(await getUserById(job.worker_id)) : null
  const visibleToMe = role || !agreement
  const mine = role ? reviews.find((r) => r.from_id === viewerId) : null
  const theirs = role ? reviews.find((r) => r.to_id === viewerId) : null
  const show = revealed(reviews, job)
  const currency = agreement?.currency || 'NGN'
  const fee = role === 'poster' ? await cancelFeeNow(job, agreement) : 0
  const canReview = !!role && (job.status === 'completed' || (job.status === 'cancelled' && !!agreement?.accepted_at)) && !(mine && show)
  return {
    job: await serializeJob(job, viewerId),
    role, worker,
    agreement: agreement && visibleToMe ? {
      price: agreement.price, terms: agreement.terms, createdAt: agreement.created_at, acceptedAt: agreement.accepted_at || null,
      upfront: role && agreement.upfront ? { amount: Number(agreement.upfront), label: money(Number(agreement.upfront), currency) } : null,
      changesLeft: Math.max(0, MAX_CHANGE_ROUNDS - (agreement.change_rounds || 0)),
    } : null,
    applicants: await Promise.all(applicants.map(async (a) => ({
      user: publicUser(a), status: a.app_status || 'applied', offer: a.offer || '', note: a.offer_note || '', ago: timeAgo(a.applied_at),
      record: await recordFor(a.id),
    }))),
    // The worker sees how the poster has paid before, before accepting.
    posterRecord: role === 'worker' ? await recordFor(job.poster_id) : null,
    myReview: mine ? await reviewOut(mine) : null,
    theirReview: theirs && show ? await reviewOut(theirs) : null,
    // They've left one, but it shows only once you've left yours (or a week passes).
    reviewWaiting: !!theirs && !show,
    canReview,
    dispute: dispute && role ? {
      id: dispute.id, category: dispute.category || 'other', reason: dispute.reason, status: dispute.status, at: dispute.created_at, byMe: dispute.user_id === viewerId,
      response: dispute.response || '', respondBy: Number(dispute.created_at) + RESPOND_MS,
      canRespond: dispute.status === 'open' && dispute.user_id !== viewerId && !dispute.response,
      outcome: dispute.outcome || '', note: dispute.status === 'resolved' ? dispute.note || '' : '',
    } : null,
    photos,
    priceChange: priceChange ? {
      id: priceChange.id, price: priceChange.price, note: priceChange.note || '', byMe: priceChange.by_id === viewerId,
      label: priceChange.amount ? money(Number(priceChange.amount), currency) : priceChange.price,
    } : null,
    noShow: noShow ? { at: noShow.created_at, overturned: !!noShow.overturned } : null,
    cancelFee: fee ? { amount: fee, label: money(fee, currency) } : null,
    // Paystack payments (server/payments.js): whether this job is paid
    // through VOIDAJ, and where its payment stands, for the two people on it.
    payable: isPayable(job),
    payment: role ? paymentView(await paymentFor(job.id), agreement) : null,
    extras: role ? extras.map((x) => paymentView(x)) : [],
  }
}

export function jobFlowRoutes(app) {
  // One job, whatever its stage (the list only shows open ones).
  app.get('/api/jobs/:id', async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    res.json(await flowFor(job, req.userId))
  })

  // The poster shortlists, declines or hires someone who applied.
  app.post('/api/jobs/:id/applicants/:userId', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    if (job.poster_id !== req.userId) return err(res, 403, 'Only the person who posted this can do that.')
    const app_ = await q.get('SELECT * FROM job_interests WHERE job_id = ? AND user_id = ?', job.id, req.params.userId)
    if (!app_) return err(res, 404, 'They haven’t applied to this job.')
    const action = req.body?.action
    if (action === 'shortlist' || action === 'unshortlist' || action === 'decline') {
      const status = action === 'shortlist' ? 'shortlisted' : action === 'decline' ? 'declined' : 'applied'
      await q.run('UPDATE job_interests SET status = ?, status_at = ? WHERE job_id = ? AND user_id = ?', status, now(), job.id, app_.user_id)
      return res.json(await flowFor(await reload(job.id), req.userId))
    }
    if (action !== 'hire') return err(res, 400, 'Unknown action.')
    if (job.status !== 'open') return err(res, 400, 'Someone has already been picked for this job.')
    const price = String(req.body?.price ?? (app_.offer || job.budget || '')).trim().slice(0, 60)
    const terms = String(req.body?.terms || '').trim().slice(0, 600)
    // Paid through VOIDAJ: the price has to be an exact number, the poster
    // needs a saved card (charged when the job is done), and the hire has
    // to pass the checks in server/job-safety.js.
    let amount = null
    let fee = null
    let upfront = null
    let flags = []
    if (isPayable(job)) {
      amount = parseAmount(price)
      if (amount == null) return err(res, 400, 'Enter the agreed price as a number, like 15,000.')
      if (!(await cardOf(req.userId))) return err(res, 400, 'Add a card before you hire. It’s only charged when the job is done.', { code: 'card_required' })
      if (req.body?.upfront) {
        upfront = parseAmount(req.body.upfront)
        if (upfront == null) return err(res, 400, 'Enter the up-front part as a number, like 5,000.')
      }
      const check = await hireCheck({ job, poster: req.userRow, workerId: app_.user_id, amount, upfront, confirmLarge: !!req.body?.confirmLarge, cardOf, payoutOf })
      if (check.error) return err(res, check.status, check.error, check.code ? { code: check.code } : {})
      flags = check.flags
      fee = feeFor(amount)
    }
    await q.run('UPDATE jobs SET worker_id = ?, status = ?, status_at = ? WHERE id = ?', app_.user_id, 'selected', now(), job.id)
    await q.run(`INSERT INTO job_agreements (job_id, poster_id, worker_id, price, terms, created_at, amount, fee, currency, upfront, change_rounds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT (job_id) DO UPDATE SET worker_id = EXCLUDED.worker_id, price = EXCLUDED.price, terms = EXCLUDED.terms, created_at = EXCLUDED.created_at, accepted_at = NULL,
        amount = EXCLUDED.amount, fee = EXCLUDED.fee, currency = EXCLUDED.currency, upfront = EXCLUDED.upfront, change_rounds = 0`,
    job.id, req.userId, app_.user_id, price, terms, now(), amount, fee, amount == null ? null : String(job.currency || 'NGN').toUpperCase(), upfront)
    await q.run("UPDATE job_interests SET status = 'hired', status_at = ? WHERE job_id = ? AND user_id = ?", now(), job.id, app_.user_id)
    // Everyone else still waiting hears it went to someone else.
    await q.run("UPDATE job_interests SET status = 'declined', status_at = ? WHERE job_id = ? AND user_id <> ? AND status IN ('applied', 'shortlisted', 'talking')",
      now(), job.id, app_.user_id)
    for (const f of flags) await raiseFlag(f)
    await logEvent(req, job.id, 'hired', upfront ? `${price}, ${money(upfront)} up front` : price)
    res.json(await flowFor(await reload(job.id), req.userId))
  })

  // The worker accepts the agreement (work starts) or turns it down (the
  // job opens again). Accepting a paid job with an up-front part charges
  // that part straight away.
  app.post('/api/jobs/:id/agreement', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    if (job.worker_id !== req.userId) return err(res, 403, 'This agreement isn’t yours to answer.')
    if (job.status !== 'selected') return err(res, 400, 'This agreement has already been answered.')
    if (req.body?.accept) {
      const agreement = await q.get('SELECT amount, upfront FROM job_agreements WHERE job_id = ?', job.id)
      if (agreement?.amount && !(await payoutOf(req.userId))) {
        return err(res, 400, 'Add the bank account you want paying into before you accept. You get the full agreed price.', { code: 'payout_required' })
      }
      await q.run('UPDATE job_agreements SET accepted_at = ? WHERE job_id = ?', now(), job.id)
      await setStage(job.id, 'in_progress')
      await logEvent(req, job.id, 'accepted')
      if (agreement?.amount && agreement.upfront && isPayable(job)) await chargeExtra(job, 'upfront', Number(agreement.upfront))
    } else {
      await q.run('DELETE FROM job_agreements WHERE job_id = ?', job.id)
      await q.run('UPDATE jobs SET worker_id = NULL WHERE id = ?', job.id)
      await setStage(job.id, 'open')
      await q.run("UPDATE job_interests SET status = 'withdrawn', status_at = ? WHERE job_id = ? AND user_id = ?", now(), job.id, req.userId)
      await logEvent(req, job.id, 'turned_down')
    }
    res.json(await flowFor(await reload(job.id), req.userId))
  })

  // Moving the job along: complete (either side, once it's in progress),
  // cancel (the poster, before it's completed), pause / resume (the poster,
  // while it's open — mainly for services).
  app.post('/api/jobs/:id/stage', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    const role = roleIn(job, req.userId)
    const to = req.body?.to
    const allowed = {
      completed: role && job.status === 'in_progress',
      cancelled: role === 'poster' && ['open', 'paused', 'selected', 'in_progress'].includes(job.status),
      paused: role === 'poster' && job.status === 'open',
      open: role === 'poster' && job.status === 'paused',
    }
    if (!allowed[to]) return err(res, 400, 'That can’t be done at this stage.')
    const agreement = await q.get('SELECT * FROM job_agreements WHERE job_id = ?', job.id)
    // Cancelling once the worker has started costs a fee, agreed to here.
    const fee = to === 'cancelled' ? await cancelFeeNow(job, agreement) : 0
    if (fee && !req.body?.acceptFee) {
      return err(res, 400, `Cancelling now means paying ${job.worker_id ? 'the worker' : 'them'} a cancellation fee of ${money(fee, agreement.currency || 'NGN')}, because they accepted more than an hour ago. If they never showed up, report a no-show instead.`, { code: 'cancel_fee', fee })
    }
    // Proof of the finished work: up to four photos from the worker.
    if (to === 'completed' && role === 'worker') {
      try {
        for (const d of (Array.isArray(req.body?.photos) ? req.body.photos : []).slice(0, MAX_PHOTOS)) readImage(d)
      } catch (e) { return err(res, 400, e.message) }
    }
    await setStage(job.id, to)
    await logEvent(req, job.id, to === 'completed' ? 'marked_done' : to)
    if (to === 'completed') {
      if (role === 'worker') await savePhotos({ jobId: job.id, userId: req.userId, purpose: 'proof', list: req.body?.photos })
      // Done: the poster's saved card is charged (or waits for the poster to
      // confirm, if the worker marked it done). server/payments.js
      if (agreement?.amount) await startJobPayment(job, agreement, role)
    }
    if (to === 'cancelled') {
      await cancelJobPayment(job.id)
      if (fee) await chargeExtra(job, 'cancel_fee', fee)
    }
    res.json(await flowFor(await reload(job.id), req.userId))
  })

  // Something went wrong: either side can raise it with the VOIDAJ team,
  // saying what kind of problem, in a sentence or two, with photos. The
  // other side is asked for their account within 48 hours.
  app.post('/api/jobs/:id/dispute', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    const role = roleIn(job, req.userId)
    if (!role) return err(res, 403, 'Only the two people on this job can report a problem with it.')
    // A worker can contest a no-show for a week after it was reported.
    const contestingNoShow = job.status === 'cancelled' && role === 'worker'
      && await q.get('SELECT 1 FROM job_no_shows WHERE job_id = ? AND created_at > ?', job.id, now() - REPORT_WINDOW_MS)
    if (!['selected', 'in_progress', 'completed'].includes(job.status) && !contestingNoShow) return err(res, 400, 'There’s nothing to report on this job now.')
    if (job.status === 'completed' && job.status_at && now() - Number(job.status_at) > REPORT_WINDOW_MS) return err(res, 400, 'Problems can be reported up to 7 days after a job is completed. Write to us if it’s more serious.')
    const reason = String(req.body?.reason || '').trim().slice(0, 1000)
    if (reason.length < 10) return err(res, 400, 'Say what went wrong, in a sentence or two.')
    const category = REPORT_KINDS.includes(req.body?.category) ? req.body.category : (contestingNoShow ? 'no_show' : 'other')
    if (await q.get("SELECT 1 FROM job_disputes WHERE job_id = ? AND status = 'open'", job.id)) return err(res, 400, 'There’s already an open report on this job. The VOIDAJ team is looking at it.')
    const banned = await reportBanUntil(req.userId)
    if (banned) return err(res, 403, `Your last reports turned out to be unfounded, so you can’t file new ones until ${new Date(banned).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Write to us if something serious happened.`, { code: 'reports_paused' })
    try { for (const d of (Array.isArray(req.body?.photos) ? req.body.photos : []).slice(0, MAX_PHOTOS)) readImage(d) } catch (e) { return err(res, 400, e.message) }
    const id = uid('jd')
    await q.run('INSERT INTO job_disputes (id, job_id, user_id, reason, status, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, job.id, req.userId, reason, 'open', category, now())
    await savePhotos({ jobId: job.id, userId: req.userId, purpose: 'evidence', list: req.body?.photos, disputeId: id })
    if (!contestingNoShow) await setStage(job.id, 'disputed')
    await logEvent(req, job.id, 'reported', category)
    const otherId = role === 'poster' ? job.worker_id : job.poster_id
    const other = otherId ? await getUserById(otherId) : null
    if (other) {
      await notify(otherId, noticeEmail({
        subject: `A problem was reported on “${job.title}”`, name: other.name, heading: 'Give your side',
        paragraphs: [
          `${req.userRow.name} reported a problem with “${job.title}” to the VOIDAJ team. Nothing is charged while the team looks at it.`,
          'Open the job on VOIDAJ within 48 hours to give your account, with photos if you have them. The team decides using both accounts and the job’s record.',
        ],
      }))
    }
    guard.sendMail(teamEmail(), `Job problem reported: ${job.title}`, `${req.userRow.name} reported “${category}” on job ${job.id}:\n\n${reason}\n\nOpen Admin → Job disputes.`).catch(() => {})
    res.json(await flowFor(await reload(job.id), req.userId))
  })

  // Two-way reviews once the job is done (or after a cancellation or
  // no-show, once someone had been hired): 1–5 stars and a few words.
  // Double-blind: see revealed() in server/job-safety.js.
  app.post('/api/jobs/:id/review', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    const role = roleIn(job, req.userId)
    if (!role) return err(res, 403, 'Only the two people on this job can review it.')
    const agreement = await q.get('SELECT accepted_at FROM job_agreements WHERE job_id = ?', job.id)
    if (!(job.status === 'completed' || (job.status === 'cancelled' && agreement?.accepted_at))) return err(res, 400, 'You can review once the job is completed.')
    const rating = Number(req.body?.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return err(res, 400, 'Pick 1 to 5 stars.')
    const reviews = await q.all('SELECT * FROM job_reviews WHERE job_id = ?', job.id)
    if (reviews.some((r) => r.from_id === req.userId) && revealed(reviews, job)) return err(res, 400, 'Reviews can’t be changed once they’re showing.')
    const to = role === 'poster' ? job.worker_id : job.poster_id
    await q.run(`INSERT INTO job_reviews (job_id, from_id, to_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (job_id, from_id) DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body`,
    job.id, req.userId, to, rating, String(req.body?.body || '').trim().slice(0, 400), now())
    res.json(await flowFor(job, req.userId))
  })

  // Someone's reviews, for their profile: only the ones that are showing,
  // and their payment and reliability record.
  app.get('/api/users/:id/reviews', async (req, res) => {
    const rows = await q.all(`SELECT r.*, j.title, j.poster_id FROM job_reviews r JOIN jobs j ON j.id = r.job_id
      WHERE r.to_id = ? AND ((SELECT COUNT(*) FROM job_reviews x WHERE x.job_id = r.job_id) >= 2 OR j.status_at < ?)
      ORDER BY r.created_at DESC LIMIT 30`, req.params.id, now() - 7 * 24 * 60 * 60 * 1000)
    const count = rows.length
    const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null
    res.json({
      count, average,
      reviews: await Promise.all(rows.map(async (r) => ({ ...(await reviewOut(r)), jobTitle: r.title, as: r.poster_id === r.to_id ? 'poster' : 'worker' }))),
      record: await recordFor(String(req.params.id).slice(0, 80)),
    })
  })

  // The VOIDAJ team's list of disputes (Admin page).
  app.get('/api/admin/disputes', requireAuth, async (req, res) => {
    if (!req.userRow?.is_admin) return err(res, 403, 'Admins only.')
    const rows = await q.all('SELECT d.*, j.title FROM job_disputes d JOIN jobs j ON j.id = d.job_id ORDER BY (d.status = \'open\') DESC, d.created_at ASC LIMIT 100')
    res.json({
      disputes: await Promise.all(rows.map(async (d) => ({
        id: d.id, jobId: d.job_id, jobTitle: d.title, reason: d.reason, category: d.category || 'other', status: d.status, at: d.created_at,
        answered: !!d.responded_at, respondBy: Number(d.created_at) + RESPOND_MS, outcome: d.outcome || '',
        by: publicUser(await getUserById(d.user_id)),
      }))),
    })
  })

  // Deciding a dispute: pay the worker in full, pay part (an amount the
  // team sets), or cancel with nothing owed. The team can also mark the
  // report unfounded (two of those and the person can't report for a
  // while) and record a no-show.
  app.post('/api/admin/disputes/:id/resolve', requireAuth, async (req, res) => {
    if (!req.userRow?.is_admin) return err(res, 403, 'Admins only.')
    const d = await q.get('SELECT * FROM job_disputes WHERE id = ?', req.params.id)
    if (!d) return err(res, 404, 'Dispute not found.')
    if (d.status !== 'open') return err(res, 400, 'This dispute has already been decided.')
    const legacy = { completed: 'pay_full', cancelled: 'cancel' }
    const outcome = ['pay_full', 'pay_part', 'cancel'].includes(req.body?.outcome) ? req.body.outcome : legacy[req.body?.outcome] || 'pay_full'
    const job = await reload(d.job_id)
    const agreement = await q.get('SELECT * FROM job_agreements WHERE job_id = ?', d.job_id)
    let part = null
    if (outcome === 'pay_part') {
      part = parseAmount(req.body?.amount)
      if (part == null || !agreement?.amount || part >= Number(agreement.amount)) return err(res, 400, 'Enter the part to pay as a number, less than the agreed price.')
    }
    const note = String(req.body?.note || '').trim().slice(0, 600)
    await q.run("UPDATE job_disputes SET status = 'resolved', outcome = ?, paid_amount = ?, unfounded = ?, note = ?, resolved_at = ?, resolver_id = ? WHERE id = ?",
      outcome, part, req.body?.unfounded ? 1 : 0, note, now(), req.userId, d.id)
    let warning = ''
    if (outcome === 'cancel') {
      await setStage(d.job_id, 'cancelled')
      await cancelJobPayment(d.job_id)
      if ((await paymentFor(d.job_id))?.status === 'paid') warning = 'This job was already paid. A refund has to be made in the Paystack dashboard; it comes out of VOIDAJ’s balance.'
    } else {
      await setStage(d.job_id, 'completed')
      await q.run('UPDATE job_no_shows SET overturned = 1 WHERE job_id = ?', d.job_id)
      if (agreement?.amount && isPayable(job)) {
        const upfrontPaid = (await extrasFor(d.job_id)).filter((x) => x.kind === 'upfront' && x.status === 'paid').reduce((s, x) => s + Number(x.amount), 0)
        const owed = (part ?? Number(agreement.amount)) - upfrontPaid
        const p = await paymentFor(d.job_id)
        if (owed <= 0) await cancelJobPayment(d.job_id)
        else if (p && ['awaiting', 'due'].includes(p.status)) {
          if (part != null) await q.run('UPDATE job_payments SET amount = ?, fee = ? WHERE id = ?', owed, feeFor(owed), p.id)
          await chargeSavedCard(p.id, 'team')
        } else if (!p) await startJobPayment(job, agreement, 'team', { amount: owed })
        else if (p.status === 'paid' && part != null) warning = 'This job was already paid in full. A partial refund has to be made in the Paystack dashboard; it comes out of VOIDAJ’s balance.'
      }
    }
    if (req.body?.noShow && job.worker_id) {
      await q.run('INSERT INTO job_no_shows (job_id, user_id, reported_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (job_id) DO UPDATE SET overturned = 0', d.job_id, job.worker_id, req.userId, now())
    }
    await logEvent(req, d.job_id, 'dispute_decided', outcome)
    const said = { pay_full: 'the worker is paid the full agreed price', pay_part: `the worker is paid ${part ? money(part, agreement?.currency || 'NGN') : 'part of the price'}`, cancel: 'the job is cancelled with nothing more to pay' }[outcome]
    for (const id of [job.poster_id, job.worker_id].filter(Boolean)) {
      const u = await getUserById(id)
      await notify(id, noticeEmail({
        subject: `The VOIDAJ team decided the problem on “${job.title}”`, name: u?.name, heading: 'The problem report is decided',
        paragraphs: [`After looking at both accounts and the job’s record, the VOIDAJ team decided that ${said}.`, ...(note ? [note] : [])],
      }))
    }
    res.json({ ok: true, warning })
  })

  jobSafetyRoutes(app, { loadJob, roleIn, flowFor, payments })
}
