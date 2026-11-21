// ── Advert requests: asked for in the app, approved by a person ─────
// "Post advert" used to switch an ad on the moment you pressed a button
// that said Pay. Nothing was paid and nothing was checked, so anyone signed
// in could put anything in front of every visitor. Now:
//
//   1. The advertiser sends a request (needs a confirmed email).
//   2. It is saved as pending and shown to nobody. We email hello@voidaj.com
//      and the advertiser.
//   3. Someone on the VOIDAJ team looks at it exactly as it will appear in
//      Admin → Ads, and approves or rejects it. Either way the advertiser
//      is emailed.
//   4. Payment is agreed by email for now. When Paystack is added, approval
//      will send a payment link and the ad will go live on payment.
//
// Email is only a notification here. The queue in Admin is the record, so
// nothing depends on someone finding the right message in an inbox.
import crypto from 'crypto'
import q, { serializeAd, publicUser, getUserById } from './db.js'
import { requireAuth } from './auth.js'
import { uploadImage, readImage, storageReady } from './storage.js'
import * as guard from './guard.js'
import { adReceivedEmail, adDecisionEmail } from './email-templates.js'

const now = () => Date.now()
const err = (res, code, msg) => res.status(code).json({ error: msg })
const uid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`
const clip = (v, n) => String(v ?? '').trim().slice(0, n)
const MAX_OPEN = 3
const MAX_IMAGE = 3 * 1024 * 1024

export const adsNotifyEmail = () =>
  (process.env.ADS_NOTIFY_EMAIL || '').trim() || 'hello@voidaj.com'

const ACCENT = /^#[0-9a-f]{6}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// A logo or cover arrives as a data URL; keep it in storage when that is
// set up, otherwise in the row (small, and only while it waits for review).
async function keepImage(dataUrl, folder) {
  if (!dataUrl) return ''
  const { bytes } = readImage(dataUrl)
  if (bytes.length > MAX_IMAGE) throw new Error('That picture is too large. Try a smaller one.')
  return storageReady() ? uploadImage(dataUrl, folder) : dataUrl
}

const mine = (row) => ({ ...serializeAd(row), contactEmail: row.contact_email || '', phone: row.phone || '', reviewNote: row.review_note || '', reviewedAt: row.reviewed_at || null })

export function adRoutes(app) {
  // What the advertiser sees about their own requests.
  app.get('/api/ads/mine', requireAuth, async (req, res) => {
    const rows = await q.all('SELECT * FROM ads WHERE owner_id = ? ORDER BY created_at DESC', req.userId)
    res.json({ ads: rows.map(mine) })
  })

  app.post('/api/ads', requireAuth, guard.requireConfirmed, async (req, res) => {
    const b = req.body || {}
    const businessName = clip(b.businessName, 60)
    if (businessName.length < 2) return err(res, 400, 'Enter your business name.')
    const contactEmail = clip(b.contactEmail || req.userRow.email, 120)
    if (!EMAIL.test(contactEmail)) return err(res, 400, 'Enter an email we can reach you on.')
    let link = clip(b.link, 200)
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`
    if (link && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(link)) return err(res, 400, 'That link doesn’t look right.')
    const open = await q.get("SELECT COUNT(*)::int AS n FROM ads WHERE owner_id = ? AND status = 'pending'", req.userId)
    if ((open?.n || 0) >= MAX_OPEN) return err(res, 429, `You already have ${MAX_OPEN} requests waiting. We’ll review them first.`)
    if (!(await guard.writeGuard(req, res))) return
    let logo = ''
    let cover = ''
    try {
      logo = await keepImage(b.logo, 'ads')
      cover = await keepImage(b.cover, 'ads')
    } catch (e) { return err(res, 400, e.message) }
    const id = uid('ad')
    const accent = ACCENT.test(String(b.accent || '')) ? b.accent : '#6B4EFF'
    await q.run(`INSERT INTO ads (id, owner_id, business_name, tagline, cta_label, accent, emoji, reach, active, status,
      contact_email, phone, link, logo, cover, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '✨', 'universal', 0, 'pending', ?, ?, ?, ?, ?, ?)`,
    id, req.userId, businessName, clip(b.tagline, 90), clip(b.ctaLabel, 20) || 'Learn more', accent,
    contactEmail, clip(b.phone, 30), link, logo, cover, now())
    const row = await q.get('SELECT * FROM ads WHERE id = ?', id)

    // Notifications never block the request: it is already saved.
    const who = req.userRow.name || 'A member'
    guard.sendMail(adsNotifyEmail(), `New advert request: ${businessName}`,
      `${who} (${req.userRow.email || 'no email'}) asked to advertise “${businessName}”.\n\n“${row.tagline}”\nContact: ${contactEmail}${row.phone ? ` · ${row.phone}` : ''}${link ? `\nLink: ${link}` : ''}\n\nReview it in Admin → Ads.`).catch(() => {})
    const received = adReceivedEmail({ name: who, business: businessName })
    guard.sendMail(contactEmail, received.subject, received.text, received.html).catch(() => {})
    res.json({ ad: mine(row) })
  })

  // The old "pay and go live" is gone: it activated an ad without a payment
  // or a check. Requests are approved in Admin.
  app.post('/api/ads/:id/pay', requireAuth, (_req, res) =>
    err(res, 410, 'Adverts are approved by the VOIDAJ team. We’ll email you once yours is reviewed.'))

  // ── Admin ──────────────────────────────────────────────────────────
  const adminOnly = (req, res, next) => (req.userRow?.is_admin ? next() : err(res, 403, 'Admins only.'))

  app.get('/api/admin/ads', requireAuth, adminOnly, async (_req, res) => {
    const rows = await q.all(`SELECT * FROM ads ORDER BY (status = 'pending') DESC,
      CASE WHEN status = 'pending' THEN created_at END ASC, created_at DESC LIMIT 100`)
    res.json({
      ads: await Promise.all(rows.map(async (r) => ({
        ...mine(r), owner: publicUser(await getUserById(r.owner_id)),
        ownerEmail: (await getUserById(r.owner_id))?.email || '',
      }))),
    })
  })

  app.post('/api/admin/ads/:id', requireAuth, adminOnly, async (req, res) => {
    const row = await q.get('SELECT * FROM ads WHERE id = ?', String(req.params.id).slice(0, 40))
    if (!row) return err(res, 404, 'Request not found.')
    const decision = req.body?.decision
    if (!['approve', 'reject', 'pause'].includes(decision)) return err(res, 400, 'Choose approve, reject or pause.')
    const note = clip(req.body?.note, 300)
    if (decision === 'reject' && note.length < 3) return err(res, 400, 'Say why, so they know what to change.')
    if (decision === 'approve') await q.run("UPDATE ads SET active = 1, status = 'live', review_note = '', reviewed_at = ? WHERE id = ?", now(), row.id)
    else if (decision === 'pause') await q.run("UPDATE ads SET active = 0, status = 'paused', reviewed_at = ? WHERE id = ?", now(), row.id)
    else await q.run("UPDATE ads SET active = 0, status = 'rejected', review_note = ?, reviewed_at = ? WHERE id = ?", note, now(), row.id)

    if (row.status === 'pending' && row.contact_email) {
      const decided = adDecisionEmail({ name: (await getUserById(row.owner_id))?.name, business: row.business_name, approved: decision === 'approve', note })
      guard.sendMail(row.contact_email, decided.subject, decided.text, decided.html).catch(() => {})
    }
    res.json({ ad: mine(await q.get('SELECT * FROM ads WHERE id = ?', row.id)) })
  })
}
