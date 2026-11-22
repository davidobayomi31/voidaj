// ── Keeping both sides of a paid job honest ──────────────────────────
// David, Nov 21: "someone can do the work and get ghosted after", and the
// reverse. VOIDAJ doesn't hold money (server/payments.js), so the protection
// comes from rules around the charge rather than from escrow:
//   - Limits for new accounts, so a stolen card can't be cashed out through
//     a fake job for much, and checks for one person on both sides.
//   - A record of everything that happens on a job (who, when, from where),
//     photos of the finished work, and evidence on problem reports: what the
//     team decides disputes with, and what answers a bank chargeback.
//   - A payment record and a reliability record on every profile.
//   - Price changes both sides agree to, a "please fix this" step before a
//     dispute (as on Upwork and Fiverr), no-shows, and cancellation fees.
// The numbers are in one place below so they can be tuned.
import crypto from 'crypto'
import q, { publicUser, getUserById } from './db.js'
import { requireAuth } from './auth.js'
import { ipOf } from './guard.js'
import { readImage } from './storage.js'

const env = (k) => (process.env[k] || '').trim()
const num = (k, d) => { const v = Number(env(k)); return Number.isFinite(v) && v > 0 ? v : d }
const now = () => Date.now()
const uid = (p) => `${p}-${crypto.randomUUID().slice(0, 12)}`
const err = (res, code, msg, extra = {}) => res.status(code).json({ error: msg, ...extra })
const DAY = 24 * 60 * 60 * 1000

// ── The rules ────────────────────────────────────────────────────────
// Someone is "new" to paid jobs until they have this many paid jobs behind
// them on that side (as the poster, or as the worker).
export const TRUSTED_AFTER = 3
// While either side is new (and they aren't both ID verified), one job can
// be at most ₦50,000 and a poster can hire for at most ₦150,000 a week.
export const newJobCap = () => num('PAY_NEW_JOB_CAP', 5_000_000)
export const newWeekCap = () => num('PAY_NEW_WEEK_CAP', 15_000_000)
// A price this big (₦100,000) has to be confirmed a second time.
export const LARGE_AMOUNT = 10_000_000
// Cancelling more than an hour after the worker accepted costs 10% of the
// price (at least ₦500, at most ₦10,000), paid to the worker.
export const CANCEL_GRACE_MS = 60 * 60 * 1000
export const cancelFeeFor = (amount) => Math.min(Number(amount) || 0, Math.max(50_000, Math.min(Math.round(Number(amount) * 0.1), 1_000_000)))
// Reviews stay hidden until both sides have left one, or a week has passed.
export const REVEAL_MS = 7 * DAY
// A paid job can be reported up to a week after it's completed.
export const REPORT_WINDOW_MS = 7 * DAY
// The other side has two days to give their account of a report.
export const RESPOND_MS = 2 * DAY
// The poster can send the work back for fixing twice; after that, it's
// confirm or report.
export const MAX_CHANGE_ROUNDS = 2
// Two reports the team found baseless within 90 days: no new reports for 30 days.
export const UNFOUNDED_LIMIT = 2
const UNFOUNDED_WINDOW = 90 * DAY
const REPORT_BAN_MS = 30 * DAY
export const MAX_PHOTOS = 4
// Up-front part: at most half the price.
export const MAX_UPFRONT_SHARE = 0.5

// ── The job's record ─────────────────────────────────────────────────
export async function logEvent(req, jobId, action, detail = '') {
  await q.run('INSERT INTO job_events (id, job_id, user_id, action, detail, ip, user_agent, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    uid('je'), jobId, req?.userId || null, action, String(detail || '').slice(0, 300), req ? ipOf(req) : '', String(req?.headers?.['user-agent'] || '').slice(0, 200), now())
}
export const eventsFor = (jobId) => q.all('SELECT * FROM job_events WHERE job_id = ? ORDER BY at', jobId)

// Something for the team to look at. The same open flag isn't raised twice.
export async function raiseFlag({ userId, otherId = null, jobId = null, kind, detail = '' }) {
  const open = await q.get('SELECT 1 FROM risk_flags WHERE user_id = ? AND kind = ? AND COALESCE(other_id, \'\') = ? AND COALESCE(job_id, \'\') = ? AND cleared_at IS NULL',
    userId, kind, otherId || '', jobId || '')
  if (open) return
  await q.run('INSERT INTO risk_flags (id, user_id, other_id, job_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uid('rf'), userId, otherId, jobId, kind, String(detail).slice(0, 300), now())
}

// A payout account number is never kept, only a keyed hash of it, so the
// same account on two VOIDAJ accounts can still be spotted.
export const accountHash = (bankCode, accountNumber) =>
  crypto.createHmac('sha256', env('PAYOUT_HASH_KEY') || env('JWT_SECRET') || 'voidaj-payout').update(`${bankCode}:${accountNumber}`).digest('hex')

// Two names that share at least two words ("Ada Okafor" and "OKAFOR ADA
// CHIOMA") are treated as the same person. One shared surname isn't enough:
// family members hire each other.
const nameWords = (s) => new Set(String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3))
export function sameName(a, b) {
  const x = nameWords(a)
  let shared = 0
  for (const w of nameWords(b)) if (x.has(w)) shared++
  return shared >= 2
}

// ── Records ──────────────────────────────────────────────────────────
const paidAs = async (userId, col) => (await q.get(`SELECT COUNT(*)::int AS n FROM job_payments WHERE ${col} = ? AND kind = 'job' AND status = 'paid'`, userId)).n

// What a poster owes right now: a payment that didn't go through, or a
// payment they've disputed with their bank.
export async function owing(userId) {
  return q.get(`SELECT id, job_id, status, chargeback_at FROM job_payments WHERE payer_id = ?
    AND (status = 'due' OR (chargeback_at IS NOT NULL AND chargeback_status = 'open')) LIMIT 1`, userId)
}

// The payment and reliability record shown on profiles and next to
// applicants. Only counts; nothing about the jobs themselves.
export async function recordFor(userId) {
  const [poster, worker, noShows, lateCancels] = await Promise.all([
    q.get(`SELECT COUNT(*) FILTER (WHERE status = 'paid')::int AS paid, COUNT(*) FILTER (WHERE status = 'paid' AND COALESCE(was_due, 0) = 0)::int AS on_time,
      COUNT(*) FILTER (WHERE status = 'due')::int AS owed, COUNT(*) FILTER (WHERE chargeback_at IS NOT NULL)::int AS chargebacks
      FROM job_payments WHERE payer_id = ? AND kind = 'job'`, userId),
    q.get(`SELECT COUNT(*) FILTER (WHERE j.status = 'completed')::int AS done FROM jobs j JOIN job_agreements a ON a.job_id = j.id
      WHERE j.worker_id = ? AND a.accepted_at IS NOT NULL`, userId),
    q.get('SELECT COUNT(*)::int AS n FROM job_no_shows WHERE user_id = ? AND COALESCE(overturned, 0) = 0', userId),
    q.get("SELECT COUNT(*)::int AS n FROM job_payments WHERE payer_id = ? AND kind = 'cancel_fee'", userId),
  ])
  return {
    asPoster: { paid: poster.paid, onTime: poster.on_time, owed: poster.owed, chargebacks: poster.chargebacks, lateCancels: lateCancels.n },
    asWorker: { done: worker.done, noShows: noShows.n },
  }
}

// ── Before a paid hire ───────────────────────────────────────────────
// Returns { status, error, code } to refuse the hire, or { flags } to note
// for the team while letting it go ahead.
export async function hireCheck({ job, poster, workerId, amount, upfront, confirmLarge, cardOf, payoutOf }) {
  if (await owing(poster.id)) return { status: 400, code: 'payment_owed', error: 'You have a job payment that hasn’t gone through. Pay it first, then you can hire again.' }
  const [worker, posterCard, workerCard, workerPayout, posterPayout] = await Promise.all([
    getUserById(workerId), cardOf(poster.id), cardOf(workerId), payoutOf(workerId), payoutOf(poster.id),
  ])
  // One person on both sides: the worker's bank account is in the poster's
  // name, it's the poster's own bank account, or it's the same card.
  const samePerson = (workerPayout && sameName(workerPayout.account_name, poster.name))
    || (workerPayout?.account_hash && posterPayout?.account_hash && workerPayout.account_hash === posterPayout.account_hash)
    || (posterCard?.signature && workerCard?.signature && posterCard.signature === workerCard.signature)
  if (samePerson) {
    await raiseFlag({ userId: poster.id, otherId: workerId, jobId: job.id, kind: 'same_person', detail: 'Hire refused: the worker’s bank account or card matches the poster.' })
    return { status: 400, code: 'same_person', error: 'This hire can’t go through: the worker’s payment details match yours. If that’s a mistake, contact us.' }
  }
  if (upfront != null) {
    if (upfront < 10000) return { status: 400, error: 'The up-front part has to be at least ₦100.' }
    if (upfront > Math.floor(amount * MAX_UPFRONT_SHARE)) return { status: 400, error: 'The up-front part can be at most half the price.' }
    if (amount - upfront < 10000) return { status: 400, error: 'Leave at least ₦100 to pay when the job is done.' }
  }
  // Limits while either side is new to paid jobs.
  const bothVerified = !!(poster.id_verified && worker?.id_verified)
  const isNew = (await paidAs(poster.id, 'payer_id')) < TRUSTED_AFTER || (await paidAs(workerId, 'payee_id')) < TRUSTED_AFTER
  if (isNew && !bothVerified) {
    if (amount > newJobCap()) {
      return { status: 400, code: 'new_account_limit', error: `While you’re both new to paid jobs on VOIDAJ, one job can be at most ₦${(newJobCap() / 100).toLocaleString('en-NG')}. The limit lifts after ${TRUSTED_AFTER} paid jobs, or if you’re both ID verified.` }
    }
    const week = await q.get(`SELECT COALESCE(SUM(a.amount), 0)::bigint AS total FROM job_agreements a JOIN jobs j ON j.id = a.job_id
      WHERE a.poster_id = ? AND a.amount IS NOT NULL AND a.created_at > ? AND j.status <> 'cancelled' AND j.id <> ?`, poster.id, now() - 7 * DAY, job.id)
    if (Number(week.total) + amount > newWeekCap()) {
      return { status: 400, code: 'new_account_limit', error: `New accounts can hire for up to ₦${(newWeekCap() / 100).toLocaleString('en-NG')} a week. The limit lifts after ${TRUSTED_AFTER} paid jobs, or if you’re both ID verified.` }
    }
  }
  if (amount >= LARGE_AMOUNT && !confirmLarge) return { status: 400, code: 'confirm_amount', error: 'That’s a large amount. Check it and confirm.' }
  // Worth a look, but not a reason to stop: the two have signed in from the
  // same connection lately (common for family or a shared office), or the
  // worker's bank account is also on another account.
  const flags = []
  const shared = await q.get(`SELECT a.ip FROM login_events a JOIN login_events b ON a.ip = b.ip AND a.ip <> '' AND a.ip <> 'unknown'
    WHERE a.user_id = ? AND b.user_id = ? AND a.at > ? AND b.at > ? LIMIT 1`, poster.id, workerId, now() - 30 * DAY, now() - 30 * DAY)
  if (shared) flags.push({ userId: poster.id, otherId: workerId, jobId: job.id, kind: 'shared_connection', detail: 'Poster and worker signed in from the same internet address in the last 30 days.' })
  if (workerPayout?.account_hash) {
    const other = await q.get('SELECT user_id FROM payout_accounts WHERE account_hash = ? AND user_id <> ? LIMIT 1', workerPayout.account_hash, workerId)
    if (other) flags.push({ userId: workerId, otherId: other.user_id, jobId: job.id, kind: 'shared_bank', detail: 'This bank account is also the payout account of another VOIDAJ account.' })
  }
  return { flags }
}

// ── Reports ──────────────────────────────────────────────────────────
// Someone whose reports keep turning out baseless can't file new ones for
// a while. Returns the date they can again, or null.
export async function reportBanUntil(userId) {
  const rows = await q.all('SELECT resolved_at FROM job_disputes WHERE user_id = ? AND unfounded = 1 AND resolved_at > ? ORDER BY resolved_at DESC', userId, now() - UNFOUNDED_WINDOW)
  if (rows.length < UNFOUNDED_LIMIT) return null
  const until = Number(rows[0].resolved_at) + REPORT_BAN_MS
  return until > now() ? until : null
}

// ── Photos ───────────────────────────────────────────────────────────
// Up to four photos (already shrunk in the browser) for a job: proof of
// finished work, or evidence on a report. Stored in the database rather
// than the public photo bucket, because they can show the inside of
// someone's home.
export async function savePhotos({ jobId, userId, purpose, list, disputeId = null }) {
  const fresh = (Array.isArray(list) ? list : []).filter((d) => typeof d === 'string' && d.startsWith('data:')).slice(0, MAX_PHOTOS)
  for (const d of fresh) readImage(d) // a friendly error if it isn't a photo
  for (const d of fresh) {
    await q.run('INSERT INTO job_photos (id, job_id, user_id, purpose, dispute_id, src, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', uid('jph'), jobId, userId, purpose, disputeId, d, now())
  }
  return fresh.length
}
export async function photosFor(jobId) {
  const rows = await q.all('SELECT id, user_id, purpose, dispute_id, created_at FROM job_photos WHERE job_id = ? ORDER BY created_at', jobId)
  return rows.map((p) => ({ id: p.id, url: `/api/job-photos/${p.id}`, purpose: p.purpose, byId: p.user_id, disputeId: p.dispute_id, at: p.created_at }))
}

// ── Reviews ──────────────────────────────────────────────────────────
// Double-blind, as on Airbnb: neither side sees the other's review (and
// nor does anyone else) until both have left one or a week has passed, so
// nobody can hold a review over the other ("pay extra or I'll give you one
// star").
export function revealed(reviews, job) {
  if (reviews.length >= 2) return true
  return !!job.status_at && now() - Number(job.status_at) > REVEAL_MS
}

// ── Routes ───────────────────────────────────────────────────────────
export function jobSafetyRoutes(app, { loadJob, roleIn, flowFor, payments }) {
  const { paymentFor, parseAmount, feeFor, money, isPayable } = payments
  const respond = async (req, res, jobId) => res.json(await flowFor(await q.get('SELECT * FROM jobs WHERE id = ?', jobId), req.userId))

  // A job photo, for the two people on the job and the team only.
  app.get('/api/job-photos/:id', requireAuth, async (req, res) => {
    const p = await q.get('SELECT p.*, j.poster_id, j.worker_id FROM job_photos p JOIN jobs j ON j.id = p.job_id WHERE p.id = ?', String(req.params.id).slice(0, 80))
    if (!p || ![p.poster_id, p.worker_id].includes(req.userId) && !req.userRow?.is_admin) return err(res, 404, 'Photo not found.')
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(p.src)
    if (!m) return err(res, 404, 'Photo not found.')
    res.set('Content-Type', m[1]).set('Cache-Control', 'private, max-age=3600').send(Buffer.from(m[2], 'base64'))
  })

  // A new price, proposed by either side once someone is hired. Takes
  // effect only when the other accepts.
  app.post('/api/jobs/:id/price', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    if (!roleIn(job, req.userId)) return err(res, 403, 'Only the two people on this job can change its price.')
    if (!['selected', 'in_progress'].includes(job.status)) return err(res, 400, 'The price can only change before the job is done.')
    const agreement = await q.get('SELECT * FROM job_agreements WHERE job_id = ?', job.id)
    if (!agreement) return err(res, 400, 'There’s no agreement yet.')
    const price = String(req.body?.price || '').trim().slice(0, 60)
    const amount = parseAmount(price)
    if (isPayable(job) && amount == null) return err(res, 400, 'Enter the new price as a number, like 15,000.')
    if (isPayable(job) && agreement.upfront && amount - Number(agreement.upfront) < 10000) return err(res, 400, 'The new price has to be more than the part already paid up front.')
    if (isPayable(job) && amount > newJobCap()) {
      const poster = await getUserById(job.poster_id)
      const check = await hireCheck({ job, poster, workerId: job.worker_id, amount, confirmLarge: true, cardOf: payments.cardOf, payoutOf: payments.payoutOf })
      if (check.error) return err(res, check.status, check.error, { code: check.code })
    }
    await q.run("UPDATE job_price_changes SET status = 'replaced', answered_at = ? WHERE job_id = ? AND status = 'pending'", now(), job.id)
    await q.run('INSERT INTO job_price_changes (id, job_id, by_id, price, amount, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      uid('pc'), job.id, req.userId, price, amount ?? 0, String(req.body?.note || '').trim().slice(0, 300), 'pending', now())
    await logEvent(req, job.id, 'price_proposed', price)
    respond(req, res, job.id)
  })
  app.post('/api/jobs/:id/price/:changeId', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    const pc = await q.get("SELECT * FROM job_price_changes WHERE id = ? AND job_id = ? AND status = 'pending'", req.params.changeId, job.id)
    if (!pc) return err(res, 404, 'That price change isn’t waiting for an answer.')
    if (!roleIn(job, req.userId)) return err(res, 403, 'Only the two people on this job can answer.')
    const cancel = req.body?.cancel && pc.by_id === req.userId
    if (pc.by_id === req.userId && !cancel) return err(res, 400, 'The other person has to accept your new price.')
    if (cancel || !req.body?.accept) {
      await q.run('UPDATE job_price_changes SET status = ?, answered_at = ? WHERE id = ?', cancel ? 'withdrawn' : 'declined', now(), pc.id)
      await logEvent(req, job.id, cancel ? 'price_withdrawn' : 'price_declined', pc.price)
      return respond(req, res, job.id)
    }
    if (!['selected', 'in_progress'].includes(job.status)) return err(res, 400, 'The price can only change before the job is done.')
    await q.run("UPDATE job_price_changes SET status = 'accepted', answered_at = ? WHERE id = ?", now(), pc.id)
    const amount = Number(pc.amount) || null
    await q.run('UPDATE job_agreements SET price = ?, amount = ?, fee = ? WHERE job_id = ?', pc.price, amount, amount ? feeFor(amount) : null, job.id)
    await logEvent(req, job.id, 'price_accepted', pc.price)
    respond(req, res, job.id)
  })

  // "Please fix this": the worker marked the job done, the poster isn't
  // happy yet. The job goes back to in progress and the 48-hour clock stops.
  // Twice at most; after that, confirm or report.
  app.post('/api/jobs/:id/changes', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    if (job.poster_id !== req.userId) return err(res, 403, 'Only the person who hired can ask for changes.')
    const p = await paymentFor(job.id)
    if (job.status !== 'completed' || p?.status !== 'awaiting') return err(res, 400, 'You can ask for changes while you’re deciding whether to confirm.')
    const agreement = await q.get('SELECT change_rounds FROM job_agreements WHERE job_id = ?', job.id)
    if ((agreement?.change_rounds || 0) >= MAX_CHANGE_ROUNDS) return err(res, 400, `You’ve asked for changes ${MAX_CHANGE_ROUNDS} times. Confirm the job, or report a problem for the VOIDAJ team to look at.`)
    const note = String(req.body?.note || '').trim().slice(0, 600)
    if (note.length < 10) return err(res, 400, 'Say what still needs doing.')
    const r = await q.run("UPDATE job_payments SET status = 'reopened' WHERE id = ? AND status = 'awaiting'", p.id)
    if (!r.changes) return err(res, 400, 'The payment is already going through.')
    await q.run('UPDATE job_agreements SET change_rounds = COALESCE(change_rounds, 0) + 1 WHERE job_id = ?', job.id)
    await q.run('UPDATE jobs SET status = ?, status_at = ? WHERE id = ?', 'in_progress', now(), job.id)
    await logEvent(req, job.id, 'changes_requested', note)
    respond(req, res, job.id)
  })

  // The worker never came. The job is cancelled with nothing to pay, it
  // counts on the worker's record, and the poster can leave a review. The
  // worker can dispute it.
  app.post('/api/jobs/:id/no-show', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    if (job.poster_id !== req.userId) return err(res, 403, 'Only the person who hired can report a no-show.')
    if (job.status !== 'in_progress') return err(res, 400, 'You can report a no-show once the worker has accepted the job.')
    if (await q.get("SELECT 1 FROM job_photos WHERE job_id = ? AND purpose = 'proof'", job.id)) return err(res, 400, 'The worker has sent photos of the work. Report a problem instead.')
    await q.run('INSERT INTO job_no_shows (job_id, user_id, reported_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (job_id) DO NOTHING', job.id, job.worker_id, req.userId, now())
    await q.run('UPDATE jobs SET status = ?, status_at = ? WHERE id = ?', 'cancelled', now(), job.id)
    await payments.cancelJobPayment(job.id)
    await logEvent(req, job.id, 'no_show')
    respond(req, res, job.id)
  })

  // The other side's account of a report, with photos, within two days.
  app.post('/api/jobs/:id/dispute/respond', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    const d = await q.get("SELECT * FROM job_disputes WHERE job_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1", job.id)
    if (!d) return err(res, 404, 'There’s no open report on this job.')
    if (!roleIn(job, req.userId) || d.user_id === req.userId) return err(res, 403, 'Only the other person on the job can answer this report.')
    if (d.responded_at) return err(res, 400, 'You’ve already answered.')
    const response = String(req.body?.response || '').trim().slice(0, 1000)
    if (response.length < 10) return err(res, 400, 'Say what happened from your side.')
    try { await savePhotos({ jobId: job.id, userId: req.userId, purpose: 'evidence', list: req.body?.photos, disputeId: d.id }) } catch (e) { return err(res, 400, e.message) }
    await q.run('UPDATE job_disputes SET response = ?, responded_at = ? WHERE id = ?', response, now(), d.id)
    await logEvent(req, job.id, 'dispute_answered')
    respond(req, res, job.id)
  })

  // ── The team ───────────────────────────────────────────────────────
  const admin = (req, res, next) => (req.userRow?.is_admin ? next() : err(res, 403, 'Admins only.'))

  app.get('/api/admin/flags', requireAuth, admin, async (_req, res) => {
    const rows = await q.all('SELECT * FROM risk_flags WHERE cleared_at IS NULL ORDER BY created_at DESC LIMIT 100')
    res.json({
      flags: await Promise.all(rows.map(async (f) => ({
        id: f.id, kind: f.kind, detail: f.detail, jobId: f.job_id, at: f.created_at,
        user: publicUser(await getUserById(f.user_id)), other: f.other_id ? publicUser(await getUserById(f.other_id)) : null,
      }))),
    })
  })
  app.post('/api/admin/flags/:id/clear', requireAuth, admin, async (req, res) => {
    await q.run('UPDATE risk_flags SET cleared_at = ?, cleared_by = ? WHERE id = ?', now(), req.userId, req.params.id)
    res.json({ ok: true })
  })

  // Everything about one job, for deciding a dispute or answering a bank
  // chargeback: the agreement, the payments, the photos and the record of
  // who did what, when and from where.
  async function jobRecord(jobId) {
    const job = await q.get('SELECT * FROM jobs WHERE id = ?', jobId)
    if (!job) return null
    const [agreement, pays, events, photos, poster, worker, disputes] = await Promise.all([
      q.get('SELECT * FROM job_agreements WHERE job_id = ?', jobId), q.all('SELECT * FROM job_payments WHERE job_id = ? ORDER BY created_at', jobId),
      eventsFor(jobId), photosFor(jobId), getUserById(job.poster_id), job.worker_id ? getUserById(job.worker_id) : null,
      q.all('SELECT * FROM job_disputes WHERE job_id = ? ORDER BY created_at', jobId),
    ])
    const names = { [job.poster_id]: poster?.name, ...(job.worker_id ? { [job.worker_id]: worker?.name } : {}) }
    return {
      jobId, jobTitle: job.title, status: job.status,
      poster: publicUser(poster), worker: publicUser(worker),
      agreement: agreement ? { price: agreement.price, terms: agreement.terms, amount: agreement.amount, upfront: agreement.upfront, acceptedAt: agreement.accepted_at, changeRounds: agreement.change_rounds || 0 } : null,
      payments: pays.map((p) => ({ id: p.id, kind: p.kind, status: p.status, label: money(Number(p.amount), p.currency), reference: p.reference, how: p.how || '', paidAt: p.paid_at, chargeback: p.chargeback_status || null })),
      photos,
      disputes: disputes.map((d) => ({ id: d.id, by: names[d.user_id] || '', category: d.category, reason: d.reason, response: d.response || '', at: d.created_at, status: d.status, outcome: d.outcome || '' })),
      events: events.map((e) => ({ action: e.action, detail: e.detail, at: e.at, by: names[e.user_id] || (e.user_id ? 'Someone else' : 'VOIDAJ'), ip: e.ip })),
      records: { poster: await recordFor(job.poster_id), worker: job.worker_id ? await recordFor(job.worker_id) : null },
    }
  }
  app.get('/api/admin/jobs/:id/record', requireAuth, admin, async (req, res) => {
    const r = await jobRecord(String(req.params.id).slice(0, 80))
    if (!r) return err(res, 404, 'Job not found.')
    res.json(r)
  })
  app.get('/api/admin/disputes/:id', requireAuth, admin, async (req, res) => {
    const d = await q.get('SELECT * FROM job_disputes WHERE id = ?', req.params.id)
    if (!d) return err(res, 404, 'Dispute not found.')
    const job = await q.get('SELECT poster_id FROM jobs WHERE id = ?', d.job_id)
    res.json({
      ...(await jobRecord(d.job_id)),
      id: d.id, category: d.category, reason: d.reason, response: d.response || '', respondedAt: d.responded_at,
      respondBy: Number(d.created_at) + RESPOND_MS, disputeStatus: d.status, at: d.created_at, byRole: d.user_id === job?.poster_id ? 'poster' : 'worker',
    })
  })
}
