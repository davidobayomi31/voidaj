// ── Security against fake accounts and spam ──────────────────────────
// PLAN-NOTES-AND-GLOBAL.md §1 (Nuel, Nov 11: "Do we need extra security
// measures to prevent hack"). Attempt limits, email confirmation codes,
// spam limits and blocking.
import crypto from 'crypto'
import q from './db.js'
import { codeEmail } from './email-templates.js'

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

// Resend refuses a send for a reason (bad key, unverified sender domain,
// test-mode recipient). Say so in the log instead of failing silently.
async function resendOk(r, what) {
  if (r?.ok) return true
  const body = r ? await r.text().catch(() => '') : 'no response (network?)'
  console.error(`[email] Resend did not send ${what}: ${r ? r.status : ''} ${body}`.trim())
  return false
}
export const emailReady = () => !!(process.env.RESEND_API_KEY || '').trim()
// Unconfirmed accounts can't post jobs, create events or communities, or
// start conversations, once codes can actually be emailed (or when
// REQUIRE_EMAIL_CONFIRM=1, which the tests use).
// A new account waits for its emailed code before it exists. Needs a real
// email service (or SIGNUP_CODE_FIRST=1, which the tests use).
export const signupCodeFirst = () => emailReady() || process.env.SIGNUP_CODE_FIRST === '1'
export const confirmRequired = () => emailReady() || process.env.REQUIRE_EMAIL_CONFIRM === '1'

// Any plain email, sent with Resend when it's set up. Without a key it is
// printed in the server log (and nothing is held back), like the codes.
export async function sendMail(to, subject, text, html) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!list.length) return { sent: false }
  if (!emailReady()) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email] to ${list.join(', ')}: ${subject}\n${text}`)
    return { sent: false }
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'VOIDAJ <hello@voidaj.com>', to: list, subject, text, ...(html ? { html } : {}) }),
  }).catch(() => null)
  return { sent: await resendOk(r, subject) }
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
      ...codeEmail({ name: user.name, code, minutes: CODE_MS / 60000 }),
    }),
  }).catch(() => null)
  return { sent: await resendOk(r, 'the confirmation code') }
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

// ── Sign-up codes: sent before the account exists ────────────────────
// The sign-up is kept in pending_signups (password already hashed) and the
// account is only made when the right code comes back.
export async function stageSignup({ email, name, passwordHash, birthDate, country, ref }) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  await q.run(`INSERT INTO pending_signups (email, name, password_hash, birth_date, country, ref, code_hash, code_expires, tries, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, birth_date = EXCLUDED.birth_date,
      country = EXCLUDED.country, ref = EXCLUDED.ref, code_hash = EXCLUDED.code_hash, code_expires = EXCLUDED.code_expires, tries = 0`,
  email, name, passwordHash, birthDate, country, ref || null, hashCode(code), now() + CODE_MS, now())
  return sendSignupCode(email, name, code)
}
async function sendSignupCode(email, name, code) {
  if (!emailReady()) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email] sign-up code for ${email}: ${code}`)
    return { sent: false, code }
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'VOIDAJ <hello@voidaj.com>', to: [email], ...codeEmail({ name, code, minutes: CODE_MS / 60000 }) }),
  }).catch(() => null)
  return { sent: await resendOk(r, 'the sign-up code') }
}
export async function resendSignupCode(email) {
  const row = await q.get('SELECT * FROM pending_signups WHERE email = ?', email)
  if (!row) return { error: 'Start again: we have no sign-up waiting for that email.' }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  await q.run('UPDATE pending_signups SET code_hash = ?, code_expires = ?, tries = 0 WHERE email = ?', hashCode(code), now() + CODE_MS, email)
  return sendSignupCode(email, row.name, code)
}
// Returns the waiting sign-up if the code is right; otherwise an error.
export async function checkSignupCode(email, code) {
  const row = await q.get('SELECT * FROM pending_signups WHERE email = ?', email)
  if (!row) return { error: 'Start again: we have no sign-up waiting for that email.' }
  if (!row.code_expires || Number(row.code_expires) < now()) return { error: 'That code has expired. Send a new one.' }
  if ((row.tries || 0) >= MAX_TRIES) return { error: 'Too many wrong codes. Send a new one.' }
  if (hashCode(String(code || '').replace(/\D/g, '')) !== row.code_hash) {
    await q.run('UPDATE pending_signups SET tries = COALESCE(tries, 0) + 1 WHERE email = ?', email)
    return { error: 'That code isn’t right. Check the email and try again.' }
  }
  return { ok: true, pending: row }
}
export const clearSignup = (email) => q.run('DELETE FROM pending_signups WHERE email = ?', email)
