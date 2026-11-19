// ── Jobs & Services: from hiring to reviews ──────────────────────────
// Nuel's Jobs & Services note (Nov 12), PLAN-NOTES-AND-GLOBAL.md §4.
// A job moves Open → Worker selected → In progress → Completed (or
// Cancelled / Disputed). The poster shortlists and hires; hiring writes an
// agreement (who, the price, any terms) that the worker accepts; when it's
// done both sides review each other. A service can be paused. Payment
// stays between the two people (VOIDAJ doesn't hold money at launch).
import crypto from 'crypto'
import q, { publicUser, getUserById, serializeJob, timeAgo } from './db.js'
import { requireAuth } from './auth.js'

const uid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`
const now = () => Date.now()
const err = (res, code, msg) => res.status(code).json({ error: msg })

export const JOB_STAGES = ['open', 'paused', 'selected', 'in_progress', 'completed', 'cancelled', 'disputed']

async function loadJob(req, res) {
  const job = await q.get('SELECT * FROM jobs WHERE id = ?', String(req.params.id).slice(0, 80))
  if (!job) { err(res, 404, 'Job not found.'); return null }
  return job
}
const roleIn = (job, userId) => (job.poster_id === userId ? 'poster' : job.worker_id && job.worker_id === userId ? 'worker' : null)
const setStage = (jobId, status) => q.run('UPDATE jobs SET status = ?, status_at = ? WHERE id = ?', status, now(), jobId)

const reviewOut = async (r) => ({
  rating: r.rating, body: r.body || '', at: r.created_at, ago: timeAgo(r.created_at),
  from: publicUser(await getUserById(r.from_id)), jobId: r.job_id,
})

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
  const worker = job.worker_id ? publicUser(await getUserById(job.worker_id)) : null
  const visibleToMe = role || !agreement
  return {
    job: await serializeJob(job, viewerId),
    role, worker,
    agreement: agreement && visibleToMe ? {
      price: agreement.price, terms: agreement.terms, createdAt: agreement.created_at, acceptedAt: agreement.accepted_at || null,
    } : null,
    applicants: applicants.map((a) => ({
      user: publicUser(a), status: a.app_status || 'applied', offer: a.offer || '', note: a.offer_note || '', ago: timeAgo(a.applied_at),
    })),
    myReview: role ? (reviews.find((r) => r.from_id === viewerId) ? await reviewOut(reviews.find((r) => r.from_id === viewerId)) : null) : null,
    theirReview: role ? (reviews.find((r) => r.to_id === viewerId) ? await reviewOut(reviews.find((r) => r.to_id === viewerId)) : null) : null,
    dispute: dispute && role ? { reason: dispute.reason, status: dispute.status, at: dispute.created_at, byMe: dispute.user_id === viewerId } : null,
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
      return res.json(await flowFor(await q.get('SELECT * FROM jobs WHERE id = ?', job.id), req.userId))
    }
    if (action !== 'hire') return err(res, 400, 'Unknown action.')
    if (job.status !== 'open') return err(res, 400, 'Someone has already been picked for this job.')
    const price = String(req.body?.price ?? (app_.offer || job.budget || '')).trim().slice(0, 60)
    const terms = String(req.body?.terms || '').trim().slice(0, 600)
    await q.run('UPDATE jobs SET worker_id = ?, status = ?, status_at = ? WHERE id = ?', app_.user_id, 'selected', now(), job.id)
    await q.run(`INSERT INTO job_agreements (job_id, poster_id, worker_id, price, terms, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (job_id) DO UPDATE SET worker_id = EXCLUDED.worker_id, price = EXCLUDED.price, terms = EXCLUDED.terms, created_at = EXCLUDED.created_at, accepted_at = NULL`,
      job.id, req.userId, app_.user_id, price, terms, now())
    await q.run("UPDATE job_interests SET status = 'hired', status_at = ? WHERE job_id = ? AND user_id = ?", now(), job.id, app_.user_id)
    // Everyone else still waiting hears it went to someone else.
    await q.run("UPDATE job_interests SET status = 'declined', status_at = ? WHERE job_id = ? AND user_id <> ? AND status IN ('applied', 'shortlisted', 'talking')",
      now(), job.id, app_.user_id)
    res.json(await flowFor(await q.get('SELECT * FROM jobs WHERE id = ?', job.id), req.userId))
  })

  // The worker accepts the agreement (work starts) or turns it down (the
  // job opens again).
  app.post('/api/jobs/:id/agreement', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    if (job.worker_id !== req.userId) return err(res, 403, 'This agreement isn’t yours to answer.')
    if (job.status !== 'selected') return err(res, 400, 'This agreement has already been answered.')
    if (req.body?.accept) {
      await q.run('UPDATE job_agreements SET accepted_at = ? WHERE job_id = ?', now(), job.id)
      await setStage(job.id, 'in_progress')
    } else {
      await q.run('DELETE FROM job_agreements WHERE job_id = ?', job.id)
      await q.run('UPDATE jobs SET worker_id = NULL WHERE id = ?', job.id)
      await setStage(job.id, 'open')
      await q.run("UPDATE job_interests SET status = 'withdrawn', status_at = ? WHERE job_id = ? AND user_id = ?", now(), job.id, req.userId)
    }
    res.json(await flowFor(await q.get('SELECT * FROM jobs WHERE id = ?', job.id), req.userId))
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
    await setStage(job.id, to)
    res.json(await flowFor(await q.get('SELECT * FROM jobs WHERE id = ?', job.id), req.userId))
  })

  // Something went wrong: either side can raise it with the VOIDAJ team.
  app.post('/api/jobs/:id/dispute', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    if (!roleIn(job, req.userId)) return err(res, 403, 'Only the two people on this job can report a problem with it.')
    if (!['selected', 'in_progress', 'completed'].includes(job.status)) return err(res, 400, 'There’s nothing to dispute yet.')
    const reason = String(req.body?.reason || '').trim().slice(0, 600)
    if (reason.length < 5) return err(res, 400, 'Say what went wrong.')
    await q.run('INSERT INTO job_disputes (id, job_id, user_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', uid('jd'), job.id, req.userId, reason, 'open', now())
    await setStage(job.id, 'disputed')
    res.json(await flowFor(await q.get('SELECT * FROM jobs WHERE id = ?', job.id), req.userId))
  })

  // Two-way reviews once the job is done: 1–5 stars and a few words.
  app.post('/api/jobs/:id/review', requireAuth, async (req, res) => {
    const job = await loadJob(req, res)
    if (!job) return
    const role = roleIn(job, req.userId)
    if (!role) return err(res, 403, 'Only the two people on this job can review it.')
    if (job.status !== 'completed') return err(res, 400, 'You can review once the job is completed.')
    const rating = Number(req.body?.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return err(res, 400, 'Pick 1 to 5 stars.')
    const to = role === 'poster' ? job.worker_id : job.poster_id
    await q.run(`INSERT INTO job_reviews (job_id, from_id, to_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (job_id, from_id) DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body`,
      job.id, req.userId, to, rating, String(req.body?.body || '').trim().slice(0, 400), now())
    res.json(await flowFor(job, req.userId))
  })

  // Someone's reviews, for their profile.
  app.get('/api/users/:id/reviews', async (req, res) => {
    const rows = await q.all(`SELECT r.*, j.title, j.poster_id FROM job_reviews r JOIN jobs j ON j.id = r.job_id
      WHERE r.to_id = ? ORDER BY r.created_at DESC LIMIT 30`, req.params.id)
    const count = rows.length
    const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null
    res.json({
      count, average,
      reviews: await Promise.all(rows.map(async (r) => ({ ...(await reviewOut(r)), jobTitle: r.title, as: r.poster_id === r.to_id ? 'poster' : 'worker' }))),
    })
  })

  // The VOIDAJ team's list of disputes (Admin page).
  app.get('/api/admin/disputes', requireAuth, async (req, res) => {
    if (!req.userRow?.is_admin) return err(res, 403, 'Admins only.')
    const rows = await q.all('SELECT d.*, j.title FROM job_disputes d JOIN jobs j ON j.id = d.job_id ORDER BY (d.status = \'open\') DESC, d.created_at DESC LIMIT 100')
    res.json({ disputes: await Promise.all(rows.map(async (d) => ({ id: d.id, jobId: d.job_id, jobTitle: d.title, reason: d.reason, status: d.status, at: d.created_at, by: publicUser(await getUserById(d.user_id)) }))) })
  })
  app.post('/api/admin/disputes/:id/resolve', requireAuth, async (req, res) => {
    if (!req.userRow?.is_admin) return err(res, 403, 'Admins only.')
    const d = await q.get('SELECT * FROM job_disputes WHERE id = ?', req.params.id)
    if (!d) return err(res, 404, 'Dispute not found.')
    const outcome = ['completed', 'cancelled'].includes(req.body?.outcome) ? req.body.outcome : 'completed'
    await q.run("UPDATE job_disputes SET status = 'resolved' WHERE id = ?", d.id)
    await setStage(d.job_id, outcome)
    res.json({ ok: true })
  })
}
