// ── Events: organisers' side ─────────────────────────────────────────
// From Nuel's Events note (Nov 9), PLAN-NOTES-AND-GLOBAL.md §3: a Manage
// page for the people running an event, co-hosts and moderators,
// invite-only events, announcements, editing, and the Event Circle chat.
//
// Roles on an event: the creator ('creator'), co-hosts ('cohost': can do
// everything the creator can except remove the creator) and moderators
// ('moderator': can post announcements, approve requests and remove people).
import crypto from 'crypto'
import q, { publicUser, getUserById, serializeEvent } from './db.js'
import { geocodeEvent } from './geocode.js'
import { requireAuth } from './auth.js'
import { cleanCategory } from './categories.js'
import { cleanCover } from './storage.js'
import { isTimeZone } from './countries.js'
import { writeGuard } from './guard.js'

const uid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`
const now = () => Date.now()
const err = (res, code, msg) => res.status(code).json({ error: msg })

export const HOST_ROLES = ['cohost', 'moderator']
const MANAGERS = ['creator', 'cohost']
const STAFF = ['creator', 'cohost', 'moderator']

export async function eventRole(event, userId) {
  if (!event || !userId) return null
  if (event.creator_id === userId) return 'creator'
  const row = await q.get('SELECT role FROM event_hosts WHERE event_id = ? AND user_id = ?', event.id, userId)
  return row?.role || null
}

// The Event Circle chat for an event (made with the event; older events get
// one the first time someone needs it).
async function circleFor(eventId) {
  const chat = await q.get('SELECT id FROM chats WHERE event_id = ? ORDER BY created_at LIMIT 1', eventId)
  if (chat) return chat.id
  const event = await q.get('SELECT id, title, creator_id FROM events WHERE id = ?', eventId)
  if (!event) return null
  const id = uid('gc')
  await q.run('INSERT INTO chats (id, name, description, community_id, creator_id, created_at, event_id) VALUES (?, ?, ?, NULL, ?, ?, ?)',
    id, `${String(event.title).slice(0, 60)} · Event Circle`, 'For everyone going to this event.', event.creator_id, now(), event.id)
  await q.run('INSERT INTO chat_members (chat_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', id, event.creator_id, now())
  return id
}
export async function joinEventCircle(eventId, userId) {
  const event = await q.get('SELECT id FROM events WHERE id = ?', eventId)
  if (!event) return null // demo events from the app's catalogue have no circle
  const chatId = await circleFor(eventId)
  if (chatId) await q.run('INSERT INTO chat_members (chat_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', chatId, userId, now())
  return chatId
}

async function loadEvent(req, res, roles) {
  const event = await q.get('SELECT * FROM events WHERE id = ?', String(req.params.id).slice(0, 80))
  if (!event) { err(res, 404, 'Event not found.'); return null }
  const role = await eventRole(event, req.userId)
  if (roles && !roles.includes(role)) { err(res, 403, 'Only the event’s hosts can do that.'); return null }
  return { event, role }
}

async function findByHandle(handle) {
  const h = String(handle || '').trim().replace(/^@/, '').toLowerCase()
  if (!h) return null
  return q.get('SELECT * FROM users WHERE LOWER(handle) = ? AND deleted_at IS NULL', '@' + h)
}

const announcementOut = async (a) => ({ id: a.id, body: a.body, createdAt: a.created_at, author: publicUser(await getUserById(a.author_id)) })

export function eventRoutes(app) {
  // Everything the hosts need on one page.
  app.get('/api/events/:id/manage', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, STAFF)
    if (!found) return
    const { event, role } = found
    const [rsvps, hosts, announcements, creator] = await Promise.all([
      q.all(`SELECT r.status, r.visible, r.created_at AS at, u.* FROM event_rsvps r JOIN users u ON u.id = r.user_id
        WHERE r.event_id = ? AND u.deleted_at IS NULL ORDER BY r.created_at`, event.id),
      q.all('SELECT h.role, h.added_at, u.* FROM event_hosts h JOIN users u ON u.id = h.user_id WHERE h.event_id = ? ORDER BY h.added_at', event.id),
      q.all('SELECT * FROM event_announcements WHERE event_id = ? ORDER BY created_at DESC', event.id),
      getUserById(event.creator_id),
    ])
    const group = (st) => rsvps.filter((r) => (r.status || 'going') === st).map((r) => ({ user: publicUser(r), visible: !!r.visible, at: r.at }))
    const going = group('going')
    res.json({
      event: serializeEvent(event), role,
      hosts: [{ user: publicUser(creator), role: 'creator' }, ...hosts.map((h) => ({ user: publicUser(h), role: h.role }))],
      going, waitlist: group('waitlist'), interested: group('interested'), requested: group('requested'), invited: group('invited'),
      stats: {
        going: going.length, interested: group('interested').length, waitlist: group('waitlist').length,
        requested: group('requested').length, hidden: going.filter((g) => !g.visible).length,
        capacity: event.capacity ?? null, placesLeft: event.capacity ? Math.max(0, event.capacity - going.length) : null,
      },
      announcements: await Promise.all(announcements.map(announcementOut)),
      circleId: await circleFor(event.id),
    })
  })

  // Edit the event (creator and co-hosts).
  app.patch('/api/events/:id', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, MANAGERS)
    if (!found) return
    const { event } = found
    const b = req.body || {}
    const next = { ...event }
    if (b.title != null) {
      next.title = String(b.title).trim().slice(0, 100)
      if (next.title.length < 3) return err(res, 400, 'Give the event a title.')
    }
    if (b.date != null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) || Number.isNaN(Date.parse(b.date))) return err(res, 400, 'Pick a date for the event.')
      next.date = String(b.date)
    }
    if (b.time != null) next.time = String(b.time).trim().slice(0, 20)
    if (b.venue != null) next.venue = String(b.venue).trim().slice(0, 100)
    if (b.description != null) next.description = String(b.description).trim().slice(0, 600)
    if (b.category != null) next.category = cleanCategory(b.category)
    if (b.format != null) next.format = ['in-person', 'online', 'hybrid'].includes(b.format) ? b.format : event.format
    if (b.capacity !== undefined) next.capacity = Number.isInteger(Number(b.capacity)) && Number(b.capacity) > 0 ? Math.min(Number(b.capacity), 100000) : null
    if (b.inviteOnly != null) next.invite_only = b.inviteOnly ? 1 : 0
    if (b.timezone != null && isTimeZone(b.timezone)) next.timezone = b.timezone
    if (b.cover != null) {
      try { next.cover = cleanCover(b.cover) } catch (e) { return err(res, 400, e.message) }
      if (next.cover === null) return err(res, 400, 'That cover photo can’t be used. Upload it again.')
    }
    await q.run(`UPDATE events SET title = ?, date = ?, time = ?, venue = ?, description = ?, category = ?, format = ?, capacity = ?,
      invite_only = ?, timezone = ?, cover = ?, updated_at = ? WHERE id = ?`,
      next.title, next.date, next.time, next.venue, next.description, next.category, next.format, next.capacity,
      next.invite_only || 0, next.timezone, next.cover || '', now(), event.id)
    await geocodeEvent(event.id)
    // More places: people waiting move up.
    if (next.capacity == null || next.capacity > (event.capacity || 0)) {
      const { n } = await q.get("SELECT COUNT(*)::int AS n FROM event_rsvps WHERE event_id = ? AND status = 'going'", event.id)
      const room = next.capacity == null ? 100000 : next.capacity - n
      if (room > 0) {
        const moving = await q.all("SELECT user_id FROM event_rsvps WHERE event_id = ? AND status = 'waitlist' ORDER BY created_at LIMIT ?", event.id, room)
        for (const m of moving) {
          await q.run("UPDATE event_rsvps SET status = 'going' WHERE event_id = ? AND user_id = ?", event.id, m.user_id)
          await joinEventCircle(event.id, m.user_id)
        }
      }
    }
    res.json({ event: serializeEvent(await q.get('SELECT * FROM events WHERE id = ?', event.id)) })
  })

  // Co-hosts and moderators, added by username.
  app.post('/api/events/:id/hosts', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, MANAGERS)
    if (!found) return
    const role = HOST_ROLES.includes(req.body?.role) ? req.body.role : 'cohost'
    const person = await findByHandle(req.body?.handle)
    if (!person) return err(res, 404, 'No one has that username.')
    if (person.id === found.event.creator_id) return err(res, 400, 'They already run this event.')
    await q.run(`INSERT INTO event_hosts (event_id, user_id, role, added_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role`, found.event.id, person.id, role, now())
    await joinEventCircle(found.event.id, person.id)
    res.json({ ok: true, host: { user: publicUser(person), role } })
  })
  app.delete('/api/events/:id/hosts/:userId', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, STAFF)
    if (!found) return
    // Hosts can step down themselves; only managers remove others.
    if (req.params.userId !== req.userId && !MANAGERS.includes(found.role)) return err(res, 403, 'Only the event’s hosts can do that.')
    await q.run('DELETE FROM event_hosts WHERE event_id = ? AND user_id = ?', found.event.id, req.params.userId)
    res.json({ ok: true })
  })

  // Announcements: hosts post, and everyone going (or waiting, or invited)
  // sees them on the event page.
  app.post('/api/events/:id/announcements', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, STAFF)
    if (!found) return
    const body = String(req.body?.body || '').trim().slice(0, 600)
    if (!body) return err(res, 400, 'Write the announcement first.')
    if (!(await writeGuard(req, res))) return
    const id = uid('ea')
    await q.run('INSERT INTO event_announcements (id, event_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', id, found.event.id, req.userId, body, now())
    res.json({ announcement: await announcementOut(await q.get('SELECT * FROM event_announcements WHERE id = ?', id)) })
  })
  app.get('/api/events/:id/announcements', async (req, res) => {
    const event = await q.get('SELECT * FROM events WHERE id = ?', String(req.params.id).slice(0, 80))
    if (!event) return res.json({ announcements: [], canSee: false })
    const role = await eventRole(event, req.userId)
    const rsvp = req.userId ? await q.get('SELECT status FROM event_rsvps WHERE event_id = ? AND user_id = ?', event.id, req.userId) : null
    const canSee = !!role || ['going', 'waitlist', 'invited'].includes(rsvp?.status)
    const total = (await q.get('SELECT COUNT(*)::int AS n FROM event_announcements WHERE event_id = ?', event.id)).n
    if (!canSee) return res.json({ announcements: [], canSee: false, total })
    const rows = await q.all('SELECT * FROM event_announcements WHERE event_id = ? ORDER BY created_at DESC LIMIT 20', event.id)
    res.json({ announcements: await Promise.all(rows.map(announcementOut)), canSee: true, total, role })
  })
  app.delete('/api/events/:id/announcements/:aid', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, STAFF)
    if (!found) return
    await q.run('DELETE FROM event_announcements WHERE id = ? AND event_id = ?', req.params.aid, found.event.id)
    res.json({ ok: true })
  })

  // Invite-only events: approve or turn down someone who asked to come.
  app.post('/api/events/:id/requests/:userId', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, STAFF)
    if (!found) return
    const { event } = found
    const row = await q.get("SELECT 1 FROM event_rsvps WHERE event_id = ? AND user_id = ? AND status = 'requested'", event.id, req.params.userId)
    if (!row) return err(res, 404, 'That request isn’t waiting any more.')
    if (req.body?.decision === 'decline') {
      await q.run('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?', event.id, req.params.userId)
      return res.json({ status: null })
    }
    let status = 'going'
    if (event.capacity) {
      const { n } = await q.get("SELECT COUNT(*)::int AS n FROM event_rsvps WHERE event_id = ? AND status = 'going'", event.id)
      if (n >= event.capacity) status = 'waitlist'
    }
    await q.run('UPDATE event_rsvps SET status = ? WHERE event_id = ? AND user_id = ?', status, event.id, req.params.userId)
    if (status === 'going') await joinEventCircle(event.id, req.params.userId)
    res.json({ status })
  })

  // Invite someone by username. They see "You're invited" and choose.
  app.post('/api/events/:id/invite', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, STAFF)
    if (!found) return
    const person = await findByHandle(req.body?.handle)
    if (!person) return err(res, 404, 'No one has that username.')
    const cur = await q.get('SELECT status FROM event_rsvps WHERE event_id = ? AND user_id = ?', found.event.id, person.id)
    if (cur && ['going', 'waitlist'].includes(cur.status)) return err(res, 400, `${person.name} is already going.`)
    if (cur) await q.run("UPDATE event_rsvps SET status = 'invited' WHERE event_id = ? AND user_id = ?", found.event.id, person.id)
    else await q.run("INSERT INTO event_rsvps (event_id, user_id, created_at, status, visible) VALUES (?, ?, ?, 'invited', 0)", found.event.id, person.id, now())
    res.json({ ok: true, user: publicUser(person) })
  })

  // Take someone off the event (moderators and up).
  app.delete('/api/events/:id/attendees/:userId', requireAuth, async (req, res) => {
    const found = await loadEvent(req, res, STAFF)
    if (!found) return
    const { event } = found
    const cur = await q.get('SELECT status FROM event_rsvps WHERE event_id = ? AND user_id = ?', event.id, req.params.userId)
    await q.run('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?', event.id, req.params.userId)
    const chat = await q.get('SELECT id FROM chats WHERE event_id = ?', event.id)
    if (chat && req.params.userId !== event.creator_id) await q.run('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?', chat.id, req.params.userId)
    if (cur?.status === 'going' && event.capacity) {
      const next = await q.get("SELECT user_id FROM event_rsvps WHERE event_id = ? AND status = 'waitlist' ORDER BY created_at LIMIT 1", event.id)
      if (next) {
        await q.run("UPDATE event_rsvps SET status = 'going' WHERE event_id = ? AND user_id = ?", event.id, next.user_id)
        await joinEventCircle(event.id, next.user_id)
      }
    }
    res.json({ ok: true })
  })

  // The Event Circle: open to hosts and people going.
  app.get('/api/events/:id/circle', requireAuth, async (req, res) => {
    const event = await q.get('SELECT * FROM events WHERE id = ?', String(req.params.id).slice(0, 80))
    if (!event) return err(res, 404, 'This event has no Event Circle.')
    const role = await eventRole(event, req.userId)
    const rsvp = await q.get('SELECT status FROM event_rsvps WHERE event_id = ? AND user_id = ?', event.id, req.userId)
    if (!role && rsvp?.status !== 'going') return err(res, 403, 'The Event Circle is for people going.')
    res.json({ chatId: await joinEventCircle(event.id, req.userId) })
  })

  // Events you host (as creator, co-host or moderator), for My Space.
  app.get('/api/me/hosting', requireAuth, async (req, res) => {
    const rows = await q.all(`SELECT e.*, COALESCE(h.role, 'creator') AS my_role FROM events e
      LEFT JOIN event_hosts h ON h.event_id = e.id AND h.user_id = ?
      WHERE e.creator_id = ? OR h.user_id = ? ORDER BY e.date`, req.userId, req.userId, req.userId)
    res.json({ events: rows.map((r) => ({ ...serializeEvent(r), myRole: r.my_role })) })
  })
}
