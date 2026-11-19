// ── ID verification, checked by a person ─────────────────────────────
// A member sends a photo of an official ID and a selfie holding it. Someone
// on the VOIDAJ team looks at both on the Admin page and approves or
// rejects. Approving is the only thing that sets users.id_verified.
//
// The photos are kept only while the check is waiting. The moment it is
// decided, both are wiped from the database and only the outcome stays
// (who, when, which kind of document, approved or not, and why not). We
// don't keep copies of people's IDs.
//
// Photos live in Postgres (not the public covers bucket): they are small
// JPEGs the browser has already shrunk, there is at most one waiting check
// per person, and they are deleted on review.
import crypto from 'crypto'
import q, { publicUser, getUserById, transaction } from './db.js'
import { requireAuth } from './auth.js'
import { readImage } from './storage.js'
import { featureOn } from './countries.js'
import * as guard from './guard.js'

const now = () => Date.now()
const err = (res, code, msg) => res.status(code).json({ error: msg })

export const DOC_TYPES = {
  nin: 'NIN slip or card',
  passport: 'International passport',
  drivers: 'Driver’s licence',
  voters: 'Voter’s card',
}
const MAX_PHOTO = 2 * 1024 * 1024 // per photo, after the browser shrinks it

function photo(dataUrl, what) {
  let img
  try { img = readImage(dataUrl) } catch (e) { throw new Error(`${what}: ${e.message}`) }
  if (img.bytes.length > MAX_PHOTO) throw new Error(`${what} is too large. Try a smaller photo.`)
  if (img.bytes.length < 8 * 1024) throw new Error(`${what} is too small to read. Take a clearer photo.`)
  return dataUrl
}

// What the member sees about their own check.
const mine = (c) => c && ({
  id: c.id, status: c.status, docType: c.doc_type, docLabel: DOC_TYPES[c.doc_type] || c.doc_type,
  reason: c.reason || '', submittedAt: c.created_at, reviewedAt: c.reviewed_at,
})

export const latestCheck = (userId) =>
  q.get('SELECT * FROM id_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', userId)

const requireAdmin = (req, res) => {
  if (req.userRow?.is_admin) return true
  err(res, 403, 'Admins only.')
  return false
}

export function idCheckRoutes(app) {
  app.get('/api/verification', requireAuth, async (req, res) => {
    res.json({ check: mine(await latestCheck(req.userId)), verified: !!req.userRow.id_verified, docTypes: DOC_TYPES })
  })

  app.post('/api/verification', requireAuth, guard.requireConfirmed, async (req, res) => {
    const u = req.userRow
    if (!featureOn('idVerification', u.country)) return err(res, 403, 'ID verification isn’t available in your country yet.')
    if (u.id_verified) return err(res, 400, 'You’re already verified.')
    if (!(await guard.writeGuard(req, res))) return
    const last = await latestCheck(u.id)
    if (last?.status === 'pending') return err(res, 400, 'Your ID is already waiting to be checked.')
    // Three tries a day is plenty for someone retaking a blurry photo.
    const recent = await q.get('SELECT COUNT(*)::int AS n FROM id_checks WHERE user_id = ? AND created_at > ?', u.id, now() - 24 * 3600 * 1000)
    if ((recent?.n || 0) >= 3) return err(res, 429, 'You’ve sent your ID three times today. Try again tomorrow.')

    const b = req.body || {}
    const docType = String(b.docType || '')
    if (!DOC_TYPES[docType]) return err(res, 400, 'Choose which kind of ID this is.')
    const legalName = String(b.legalName || '').trim().replace(/\s+/g, ' ').slice(0, 100)
    if (legalName.length < 3) return err(res, 400, 'Type your full name exactly as it is on the ID.')
    if (!b.consent) return err(res, 400, 'Tick the box to agree to the check.')
    let document, selfie
    try {
      document = photo(b.document, 'The ID photo')
      selfie = photo(b.selfie, 'The selfie')
    } catch (e) { return err(res, 400, e.message) }

    const id = `idc-${crypto.randomUUID().slice(0, 12)}`
    await q.run(`INSERT INTO id_checks (id, user_id, doc_type, legal_name, document, selfie, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`, id, u.id, docType, legalName, document, selfie, now())
    res.json({ check: mine(await latestCheck(u.id)) })
  })

  // Waiting checks first, photos included only for waiting ones.
  app.get('/api/admin/verifications', requireAuth, async (req, res) => {
    if (!requireAdmin(req, res)) return
    const rows = await q.all(`SELECT * FROM id_checks ORDER BY (status = 'pending') DESC,
      CASE WHEN status = 'pending' THEN created_at END ASC, created_at DESC LIMIT 100`)
    res.json({
      checks: await Promise.all(rows.map(async (c) => {
        const who = await getUserById(c.user_id)
        return {
          ...mine(c), legalName: c.status === 'pending' ? c.legal_name : '',
          document: c.status === 'pending' ? c.document : null,
          selfie: c.status === 'pending' ? c.selfie : null,
          user: who ? { ...publicUser(who), email: who.email || '', birthDate: who.birth_date || '' } : null,
          reviewer: c.reviewer_id ? publicUser(await getUserById(c.reviewer_id)) : null,
        }
      })),
    })
  })

  app.post('/api/admin/verifications/:id', requireAuth, async (req, res) => {
    if (!requireAdmin(req, res)) return
    const c = await q.get('SELECT * FROM id_checks WHERE id = ?', String(req.params.id).slice(0, 40))
    if (!c) return err(res, 404, 'Check not found.')
    if (c.status !== 'pending') return err(res, 400, 'This check has already been decided.')
    const approve = req.body?.decision === 'approve'
    const reason = String(req.body?.reason || '').trim().slice(0, 300)
    if (!approve && reason.length < 3) return err(res, 400, 'Say why, so they know what to fix.')
    await transaction(async (t) => {
      // The photos and the typed name go as soon as it's decided.
      await t.run(`UPDATE id_checks SET status = ?, reason = ?, reviewer_id = ?, reviewed_at = ?,
        document = NULL, selfie = NULL, legal_name = NULL WHERE id = ?`,
        approve ? 'approved' : 'rejected', approve ? '' : reason, req.userId, now(), c.id)
      if (approve) await t.run('UPDATE users SET id_verified = 1, verified_at = ? WHERE id = ?', now(), c.user_id)
    })
    const who = await getUserById(c.user_id)
    res.json({ ok: true, user: who ? publicUser(who) : null })
  })

  // Take a badge away (a fake that slipped through, or on request).
  app.post('/api/admin/verifications/revoke/:userId', requireAuth, async (req, res) => {
    if (!requireAdmin(req, res)) return
    await q.run('UPDATE users SET id_verified = 0, verified_at = NULL WHERE id = ?', String(req.params.userId).slice(0, 80))
    res.json({ ok: true })
  })
}

// Used when an account is deleted.
export const deleteChecksFor = (t, userId) => t.run('DELETE FROM id_checks WHERE user_id = ?', userId)

