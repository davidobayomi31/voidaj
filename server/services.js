// ── Services: what people can do, with proof and availability ───────
// Nuel, Nov 18: "it's just a page people say what they can do with proof
// of service done, their availability and stuff like that."
//
// A service is a Quick Jobs listing with kind = 'service' (Nov 12: "Job and
// Service two options within the same Quick Jobs system"), so it keeps
// working everywhere jobs do: offers, hiring, the job flow, reviews. This
// adds what a service page needs on top:
//   - proof: up to 6 photos of past work (service_photos)
//   - availability: days and times (jobs.availability, from the hours picker)
//   - the provider's track record: rating and jobs completed on VOIDAJ
//
// Photos go to Supabase Storage when it's set up, or into Postgres when it
// isn't, and are served from /api/service-photos/:id either way.
import crypto from 'crypto'
import q, { publicUser, getUserById, timeAgo } from './db.js'
import { requireAuth } from './auth.js'
import { storageReady, uploadImage, readImage } from './storage.js'
import { cleanCurrency, currencyOf, DEFAULT_COUNTRY } from './countries.js'
import * as guard from './guard.js'

const now = () => Date.now()
const err = (res, code, msg) => res.status(code).json({ error: msg })
const uid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`
const MAX_PHOTOS = 6
const ARRANGEMENTS = ['local', 'remote', 'hybrid']
const PRICING = ['paid', 'free', 'exchange']
const clip = (v, n) => String(v ?? '').trim().slice(0, n)

const photoUrl = (p) => (p.src.startsWith('data:') ? `/api/service-photos/${p.id}` : p.src)

async function track(userId) {
  const [rating, done] = await Promise.all([
    q.get('SELECT COUNT(*)::int AS n, AVG(rating)::float AS avg FROM job_reviews WHERE to_id = ?', userId),
    q.get("SELECT COUNT(*)::int AS n FROM jobs WHERE worker_id = ? AND status = 'completed'", userId),
  ])
  return { reviews: rating?.n || 0, rating: rating?.n ? Math.round(rating.avg * 10) / 10 : null, completed: done?.n || 0 }
}

export async function serializeService(row, viewerId, { full = false } = {}) {
  const [provider, photos, record] = await Promise.all([
    getUserById(row.poster_id),
    q.all('SELECT id, src FROM service_photos WHERE job_id = ? ORDER BY position, created_at', row.id),
    track(row.poster_id),
  ])
  const out = {
    id: row.id, title: row.title, category: row.category, description: row.description || '',
    price: row.budget || '', currency: row.currency || 'NGN', pricing: row.opportunity === 'exchange' ? 'exchange' : row.opportunity === 'free' || row.opportunity === 'volunteer' ? 'free' : 'paid',
    exchange: row.exchange || '', arrangement: row.arrangement || (row.remote ? 'remote' : 'local'),
    area: row.area || '', city: row.city || '', availability: row.availability || '',
    paused: row.status === 'paused', status: row.status,
    photos: photos.map((p) => ({ id: p.id, url: photoUrl(p) })),
    provider: publicUser(provider) || { id: row.poster_id, name: 'Unknown' },
    record, isMine: !!viewerId && viewerId === row.poster_id,
    createdAt: row.created_at, ago: timeAgo(row.created_at),
  }
  if (full) {
    const reviews = await q.all(`SELECT r.*, j.title AS job_title FROM job_reviews r JOIN jobs j ON j.id = r.job_id
      WHERE r.to_id = ? ORDER BY r.created_at DESC LIMIT 6`, row.poster_id)
    out.reviews = await Promise.all(reviews.map(async (r) => ({
      rating: r.rating, body: r.body || '', jobTitle: r.job_title, ago: timeAgo(r.created_at), from: publicUser(await getUserById(r.from_id)),
    })))
  }
  return out
}

async function savePhotos(jobId, list) {
  // `list` is the photos the owner wants, in order: existing ones by id,
  // new ones as data URLs. Anything not listed is removed.
  const keep = []
  const fresh = []
  for (const item of (Array.isArray(list) ? list : []).slice(0, MAX_PHOTOS)) {
    if (typeof item === 'string' && item.startsWith('data:')) fresh.push(item)
    else if (item && typeof item === 'object' && item.id) keep.push(String(item.id))
    else if (typeof item === 'string') keep.push(item)
  }
  for (const d of fresh) readImage(d) // throws a friendly message if it's not a photo
  const existing = await q.all('SELECT id FROM service_photos WHERE job_id = ?', jobId)
  for (const e of existing) if (!keep.includes(e.id)) await q.run('DELETE FROM service_photos WHERE id = ?', e.id)
  let pos = 0
  for (const id of keep) await q.run('UPDATE service_photos SET position = ? WHERE id = ? AND job_id = ?', pos++, id, jobId)
  for (const d of fresh) {
    const src = storageReady() ? await uploadImage(d, 'services') : d
    await q.run('INSERT INTO service_photos (id, job_id, src, position, created_at) VALUES (?, ?, ?, ?, ?)', uid('sp'), jobId, src, pos++, now())
  }
}

function readFields(b, { partial }) {
  const out = {}
  if (!partial || b.title != null) {
    out.title = clip(b.title, 100)
    if (out.title.length < 3) throw new Error('Say what you do in a few words (at least 3 letters).')
  }
  if (!partial || b.category != null) {
    out.category = clip(b.category, 40)
    if (!out.category) throw new Error('Pick a category.')
  }
  if (b.description != null) out.description = clip(b.description, 1500)
  if (b.availability != null) out.availability = clip(b.availability, 120)
  if (b.area != null) out.area = clip(b.area, 60)
  if (b.arrangement != null) out.arrangement = ARRANGEMENTS.includes(b.arrangement) ? b.arrangement : 'local'
  if (b.pricing != null) {
    const pricing = PRICING.includes(b.pricing) ? b.pricing : 'paid'
    out.opportunity = pricing
    out.budget = pricing === 'paid' ? clip(b.price, 40) : ''
    out.exchange = pricing === 'exchange' ? clip(b.exchange, 200) : ''
    if (pricing === 'exchange' && !out.exchange) throw new Error('Say what you’d like in return.')
  }
  return out
}

export function serviceRoutes(app) {
  app.get('/api/services', async (req, res) => {
    const where = ["kind = 'service'", "status = 'open'"]
    const args = []
    if (req.query.category) { where.push('category = ?'); args.push(String(req.query.category).slice(0, 40)) }
    const term = String(req.query.q || '').trim().toLowerCase().slice(0, 60)
    if (term) { where.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?)'); args.push(`%${term}%`, `%${term}%`, `%${term}%`) }
    const rows = await q.all(`SELECT * FROM jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 60`, ...args)
    res.json({ services: await Promise.all(rows.map((r) => serializeService(r, req.userId))) })
  })

  app.get('/api/services/mine', requireAuth, async (req, res) => {
    const rows = await q.all("SELECT * FROM jobs WHERE kind = 'service' AND poster_id = ? AND status IN ('open', 'paused') ORDER BY created_at DESC", req.userId)
    res.json({ services: await Promise.all(rows.map((r) => serializeService(r, req.userId))) })
  })

  app.get('/api/services/:id', async (req, res) => {
    const row = await q.get("SELECT * FROM jobs WHERE id = ? AND kind = 'service'", String(req.params.id).slice(0, 40))
    if (!row || (!['open', 'paused'].includes(row.status) && row.poster_id !== req.userId)) return err(res, 404, 'Service not found.')
    if (row.status === 'paused' && row.poster_id !== req.userId) return err(res, 404, 'This service is paused.')
    res.json({ service: await serializeService(row, req.userId, { full: true }) })
  })

  app.post('/api/services', requireAuth, guard.requireConfirmed, async (req, res) => {
    let f
    try { f = readFields({ pricing: 'paid', ...req.body }, { partial: false }) } catch (e) { return err(res, 400, e.message) }
    if (!(await guard.writeGuard(req, res))) return
    const country = req.userRow.country || DEFAULT_COUNTRY
    const currency = cleanCurrency(req.body?.currency) || currencyOf(country)
    const id = uid('j')
    await q.run(`INSERT INTO jobs (id, poster_id, title, category, description, area, city, budget, verified_only, timing, remote, open_to_offers, created_at,
      kind, opportunity, arrangement, exchange, country, currency, status_at, availability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'Flexible', ?, ?, ?, 'service', ?, ?, ?, ?, ?, ?, ?)`,
    id, req.userId, f.title, f.category, f.description || '', f.area || '', req.userRow.city || '', f.budget || '',
    f.arrangement && f.arrangement !== 'local' ? 1 : 0, f.opportunity === 'paid' ? 1 : 0, now(),
    f.opportunity, f.arrangement || 'local', f.exchange || '', country, currency, now(), f.availability || '')
    try { await savePhotos(id, req.body?.photos) } catch (e) {
      await q.run('DELETE FROM jobs WHERE id = ?', id)
      return err(res, 400, e.message)
    }
    res.json({ service: await serializeService(await q.get('SELECT * FROM jobs WHERE id = ?', id), req.userId, { full: true }) })
  })

  app.patch('/api/services/:id', requireAuth, async (req, res) => {
    const row = await q.get("SELECT * FROM jobs WHERE id = ? AND kind = 'service'", String(req.params.id).slice(0, 40))
    if (!row || row.poster_id !== req.userId) return err(res, 404, 'Service not found.')
    let f
    try { f = readFields(req.body || {}, { partial: true }) } catch (e) { return err(res, 400, e.message) }
    if (req.body?.paused != null && ['open', 'paused'].includes(row.status)) f.status = req.body.paused ? 'paused' : 'open'
    if (f.arrangement) f.remote = f.arrangement !== 'local' ? 1 : 0
    const cols = Object.keys(f)
    if (cols.length) await q.run(`UPDATE jobs SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => f[c]), row.id)
    if (req.body?.photos) {
      try { await savePhotos(row.id, req.body.photos) } catch (e) { return err(res, 400, e.message) }
    }
    res.json({ service: await serializeService(await q.get('SELECT * FROM jobs WHERE id = ?', row.id), req.userId, { full: true }) })
  })

  app.delete('/api/services/:id', requireAuth, async (req, res) => {
    const row = await q.get("SELECT * FROM jobs WHERE id = ? AND kind = 'service'", String(req.params.id).slice(0, 40))
    if (!row || row.poster_id !== req.userId) return err(res, 404, 'Service not found.')
    await q.run("UPDATE jobs SET status = 'cancelled', status_at = ? WHERE id = ?", now(), row.id)
    await q.run('DELETE FROM service_photos WHERE job_id = ?', row.id)
    res.json({ ok: true })
  })

  // Photos kept in the database, served as images.
  app.get('/api/service-photos/:id', async (req, res) => {
    const p = await q.get('SELECT src FROM service_photos WHERE id = ?', String(req.params.id).slice(0, 40))
    if (!p) return err(res, 404, 'Photo not found.')
    if (!p.src.startsWith('data:')) return res.redirect(p.src)
    const { type, bytes } = readImage(p.src)
    res.set('Content-Type', type).set('Cache-Control', 'public, max-age=86400').send(bytes)
  })
}
