// ── Security against fake accounts and spam ──────────────────────────
// PLAN-NOTES-AND-GLOBAL.md §1 (Nuel, Nov 11: "Do we need extra security
// measures to prevent hack"). Attempt limits, email confirmation codes,
// spam limits and blocking.
import crypto from 'crypto'
import q from './db.js'

const now = () => Date.now()
const err = (res, code, msg) => res.status(code).json({ error: msg })

// ── Attempt limits ───────────────────────────────────────────────────
// Kept in Postgres rather than memory: on Vercel each request can land on
// a different copy of the server, so a count in memory would never add up.
// RATE_LIMITS=off switches them off (the test suite does, because it signs
// up hundreds of people from one address; its own test switches them on).
export const limitsOn = () => process.env.RATE_LIMITS !== 'off'

export const LIMITS = {
  login: { max: 10, windowMs: 15 * 60 * 1000 },
  register: { max: 5, windowMs: 60 * 60 * 1000 },
  emailCode: { max: 5, windowMs: 60 * 60 * 1000 },
  write: { max: 20, windowMs: 60 * 1000 },
}

// How many times `key` has happened inside the window.
export async function hits(key, windowMs) {
  const row = await q.get('SELECT COUNT(*)::int AS n FROM rate_hits WHERE key = ? AND at > ?', key, now() - windowMs)
  return row.n
}
export async function record(key) {
  await q.run('INSERT INTO rate_hits (key, at) VALUES (?, ?)', key, now())
  // Old rows are no use to anyone; clear them now and then.
  if (Math.random() < 0.02) await q.run('DELETE FROM rate_hits WHERE at < ?', now() - 24 * 60 * 60 * 1000).catch(() => {})
}
export async function over(key, { max, windowMs }) {
  if (!limitsOn()) return false
  return (await hits(key, windowMs)) >= max
}
export async function clear(key) {
  await q.run('DELETE FROM rate_hits WHERE key = ?', key)
}

export function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64) || 'unknown'
}

const WAIT = 'Too many tries. Please wait a few minutes and try again.'

// Sign-in: failed tries count against both the email and the address they
// come from, so neither guessing one account's password nor trying many
// accounts from one place gets far. A successful sign-in clears its email.
export async function loginBlocked(req, email) {
  const ip = ipOf(req)
  return (await over(`login:ip:${ip}`, LIMITS.login)) || (await over(`login:email:${String(email).toLowerCase()}`, LIMITS.login))
}
export async function loginFailed(req, email) {
  if (!limitsOn()) return
  await record(`login:ip:${ipOf(req)}`)
  await record(`login:email:${String(email).toLowerCase()}`)
}
export const loginSucceeded = (email) => clear(`login:email:${String(email).toLowerCase()}`)

// Sign-up: a few new accounts an hour from one address. The hidden
// "website" field is never shown to people, so only bots fill it in.
export async function registerGuard(req, res) {
  if (String(req.body?.website || '').trim()) { err(res, 400, 'Something went wrong. Please try again.'); return false }
  const key = `register:ip:${ipOf(req)}`
  if (await over(key, LIMITS.register)) { err(res, 429, 'Too many new accounts from here. Please try again later.'); return false }
  if (limitsOn()) await record(key)
  return true
}

// Posting, commenting, messaging, jobs and events: a burst limit per
// person, and the same words can't go up twice in ten minutes.
export async function writeGuard(req, res) {
  const key = `write:${req.userId}`
  if (await over(key, LIMITS.write)) { err(res, 429, 'You’re posting very fast. Take a breather and try again in a minute.'); return false }
  if (limitsOn()) await record(key)
  return true
}
const DUPLICATE_MS = 10 * 60 * 1000
export async function isDuplicate(table, authorCol, userId, body) {
  const text = String(body || '').trim()
  if (!limitsOn() || text.length < 8) return false
  const row = await q.get(`SELECT 1 FROM ${table} WHERE ${authorCol} = ? AND body = ? AND created_at > ? LIMIT 1`, userId, text, now() - DUPLICATE_MS)
  return !!row
}

// ── Email confirmation ───────────────────────────────────────────────
// A 6-digit code, kept hashed, good for 30 minutes and 5 tries. Sent with
// Resend (resend.com) when RESEND_API_KEY is set; otherwise it's printed
// in the server log so it can still be tried locally.
const CODE_MS = 30 * 60 * 1000
const MAX_TRIES = 5
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex')
export const emailReady = () => !!(process.env.RESEND_API_KEY || '').trim()
// Unconfirmed accounts can't post jobs, create events or communities, or
// start conversations, once codes can actually be emailed (or when
// REQUIRE_EMAIL_CONFIRM=1, which the tests use).
export const confirmRequired = () => emailReady() || process.env.REQUIRE_EMAIL_CONFIRM === '1'

// Any plain email, sent with Resend when it's set up. Without a key it is
// printed in the server log (and nothing is held back), like the codes.
export async function sendMail(to, subject, text) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!list.length) return { sent: false }
  if (!emailReady()) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email] to ${list.join(', ')}: ${subject}\n${text}`)
    return { sent: false }
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'VOIDAJ <hello@voidaj.com>', to: list, subject, text }),
  }).catch(() => null)
  return { sent: !!r?.ok }
}

export async function sendEmailCode(user) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  await q.run('UPDATE users SET email_code = ?, email_code_expires = ?, email_code_tries = 0 WHERE id = ?', hashCode(code), now() + CODE_MS, user.id)
  if (!user.email) return { sent: false }
  if (!emailReady()) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email] confirmation code for ${user.email}: ${code}`)
    return { sent: false, code }
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'VOIDAJ <hello@voidaj.com>',
      to: [user.email],
      subject: `${code} is your VOIDAJ code`,
      text: `Hi ${String(user.name || '').split(' ')[0] || 'there'},\n\nYour VOIDAJ confirmation code is ${code}. It works for 30 minutes.\n\nIf you didn’t make a VOIDAJ account, you can ignore this email.`,
    }),
  }).catch(() => null)
  return { sent: !!r?.ok }
}

export async function checkEmailCode(user, code) {
  if (user.email_confirmed_at) return { ok: true }
  if (!user.email_code || !user.email_code_expires || user.email_code_expires < now()) return { error: 'That code has expired. Send a new one.' }
  if ((user.email_code_tries || 0) >= MAX_TRIES) return { error: 'Too many wrong codes. Send a new one.' }
  const good = hashCode(String(code || '').replace(/\D/g, '')) === user.email_code
  if (!good) {
    await q.run('UPDATE users SET email_code_tries = COALESCE(email_code_tries, 0) + 1 WHERE id = ?', user.id)
    return { error: 'That code isn’t right. Check the email and try again.' }
  }
  await q.run('UPDATE users SET email_confirmed_at = ?, email_code = NULL, email_code_expires = NULL, email_code_tries = 0 WHERE id = ?', now(), user.id)
  return { ok: true }
}

// Middleware for the things an unconfirmed account can't do yet.
export function requireConfirmed(req, res, next) {
  if (!confirmRequired() || req.userRow?.email_confirmed_at || req.userRow?.is_seed) return next()
  err(res, 403, 'Confirm your email first. We sent a code to your inbox.')
}

// ── Blocking ─────────────────────────────────────────────────────────
export async function blockedIds(userId) {
  if (!userId) return []
  return (await q.all('SELECT blocked_id FROM user_blocks WHERE blocker_id = ?', userId)).map((r) => r.blocked_id)
}
// Either one has blocked the other.
export async function eitherBlocked(a, b) {
  return !!(await q.get('SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1', a, b, b, a))
}
