// ── Usernames (@handles) ────────────────────────────────────────────
// A username is how people find, mention and link to someone
// (voidaj.com/u/<name>, and the QR on their VOIDAJ ID points at it), so two
// people must never share one. It used to be made from the first name alone,
// so every "Grace" became @grace. Now the automatic one is made unique:
//   @grace  →  @grace_ojion  →  @grace_ojion2  →  @grace_ojion3 …
// and the database refuses a second one regardless of capitals
// (server/db.js: users_handle_unique).
import crypto from 'crypto'
import q from './db.js'

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

// Letters and digits only, accents removed ("Zoë" → "zoe").
const clean = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const fit = (s) => (s.length < 3 ? (s + '000').slice(0, 3) : s.slice(0, 20))

export async function usernameTaken(h, exceptId = null) {
  const handle = `@${String(h).toLowerCase()}`
  const row = exceptId
    ? await q.get('SELECT 1 FROM users WHERE LOWER(handle) = ? AND id <> ? LIMIT 1', handle, exceptId)
    : await q.get('SELECT 1 FROM users WHERE LOWER(handle) = ? LIMIT 1', handle)
  return !!row
}

// The first free username for this name, with the "@".
export async function uniqueHandle(name) {
  const parts = String(name || '').trim().split(/\s+/).map(clean).filter(Boolean)
  const first = parts[0] || 'member'
  const last = parts.length > 1 ? parts[parts.length - 1] : ''
  const bases = [fit(first)]
  if (last) bases.push(fit(`${first}_${last}`))
  for (const b of bases) if (!(await usernameTaken(b))) return `@${b}`
  const root = bases[bases.length - 1].slice(0, 17)
  for (let n = 2; n < 1000; n++) {
    const h = `${root}${n}`
    if (!(await usernameTaken(h))) return `@${h}`
  }
  return `@member${crypto.randomInt(100000, 999999)}`
}

// Same name, different people, and two sign-ups at the same instant can
// still pick the same free username. The database refuses the second, and
// this tries again with the next one.
export const isHandleClash = (e) => e?.code === '23505' && String(e.constraint || '').includes('handle')

// "toronto" and "TORONTO" become "Toronto"; anything already mixed
// ("McLean", "São Paulo") is left as typed.
export function tidyCity(v) {
  const t = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 60)
  if (!t || (t !== t.toLowerCase() && t !== t.toUpperCase())) return t
  return t.toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
}
