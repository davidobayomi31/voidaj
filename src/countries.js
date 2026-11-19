// ── Countries, currencies and time zones in the app ──────────────────
// The list itself is shared with the server (server/countries.js); this
// adds what the screens need: flags, money, and event times.
export {
  COUNTRIES, DEFAULT_COUNTRY, findCountry, currencyOf, CURRENCIES, featureOn, normalisePhone,
} from '../server/countries.js'
import { COUNTRIES, DEFAULT_COUNTRY, findCountry } from '../server/countries.js'

// 🇳🇬 from "NG".
export const flagOf = (code) => (code && /^[A-Z]{2}$/.test(code)
  ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '')
export const countryName = (code) => findCountry(code)?.name || ''

// A best guess at someone's country from their device, for the sign-up
// form: the time zone first (it's the most reliable), then the language.
export function guessCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const byTz = COUNTRIES.find((c) => c.tz === tz)
    if (byTz) return byTz.code
    const region = (navigator.language || '').split('-')[1]?.toUpperCase()
    if (region && findCountry(region)) return region
  } catch { /* fall through */ }
  return DEFAULT_COUNTRY
}
export const deviceTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos' } catch { return 'Africa/Lagos' }
}

// ── Money ────────────────────────────────────────────────────────────
// The symbol for a currency code: ₦, GH₵, KSh, £, $, €…
export function currencySymbol(currency = 'NGN') {
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')
    return part?.value || currency
  } catch { return currency }
}
// Budgets are typed freely ("15,000", "₦15,000", "from 10k/visit"). A bare
// number gets the listing's currency in front; anything with its own symbol
// or words is shown as typed.
export function withCurrency(text, currency = 'NGN') {
  const t = String(text || '').trim()
  if (!t) return ''
  if (/^[0-9][0-9,. ]*$/.test(t)) return `${currencySymbol(currency)}${t}`
  return t
}

// ── Event times ──────────────────────────────────────────────────────
// Event times are typed freely too ("6:00 PM", "18:00", "6pm"). When one
// can be read, it's turned into a real moment in the event's time zone, so
// it can be shown in the viewer's own time as well.
export function parseClock(time) {
  const m = String(time || '').trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])?\.?\s*m?\.?$/i)
  if (!m) return null
  let h = Number(m[1]); const min = Number(m[2] || 0)
  const ap = m[3]?.toLowerCase()
  if (ap === 'p' && h < 12) h += 12
  if (ap === 'a' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return { h, min }
}

// The offset (in minutes) of a time zone from UTC at a given moment.
function offsetMinutes(timeZone, at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second)
  return Math.round((asUtc - at.getTime()) / 60000)
}

// The moment an event starts, or null if its date or time can't be read.
export function eventStart(event) {
  const clock = parseClock(event?.time)
  if (!clock || !/^\d{4}-\d{2}-\d{2}$/.test(event?.date || '')) return null
  const [y, mo, d] = event.date.split('-').map(Number)
  const tz = event.timezone || 'Africa/Lagos'
  try {
    const guess = new Date(Date.UTC(y, mo - 1, d, clock.h, clock.min))
    const first = new Date(guess.getTime() - offsetMinutes(tz, guess) * 60000)
    // Second pass settles days when the clocks change.
    return new Date(guess.getTime() - offsetMinutes(tz, first) * 60000)
  } catch { return null }
}

// The short name people know a zone by. Browsers give most African zones
// as "GMT+1", so those (none change their clocks) are named here; the rest
// come from the browser in US or UK English (EST, PDT, BST, CET…).
const AFRICAN_ZONES = {
  'Africa/Lagos': 'WAT', 'Africa/Douala': 'WAT', 'Africa/Kinshasa': 'WAT', 'Africa/Luanda': 'WAT',
  'Africa/Accra': 'GMT', 'Africa/Abidjan': 'GMT', 'Africa/Dakar': 'GMT',
  'Africa/Nairobi': 'EAT', 'Africa/Kampala': 'EAT', 'Africa/Dar_es_Salaam': 'EAT', 'Africa/Addis_Ababa': 'EAT',
  'Africa/Johannesburg': 'SAST', 'Africa/Kigali': 'CAT', 'Africa/Harare': 'CAT', 'Africa/Lusaka': 'CAT',
}
const tzShort = (timeZone, at) => {
  if (AFRICAN_ZONES[timeZone]) return AFRICAN_ZONES[timeZone]
  const name = (locale) => {
    try { return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value || '' } catch { return '' }
  }
  const us = name('en-US')
  return /^GMT[+-]/.test(us) ? name('en-GB') : us
}
const clockIn = (timeZone, at) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(at)

// "6:00 PM WAT", and "8:00 PM your time" when the viewer is elsewhere.
export function eventTimeLabel(event, viewerTz = deviceTimeZone()) {
  const start = eventStart(event)
  if (!start) return { local: event?.time || '', yours: '' }
  const tz = event.timezone || 'Africa/Lagos'
  const local = `${clockIn(tz, start)} ${tzShort(tz, start)}`.trim()
  const same = offsetMinutes(tz, start) === offsetMinutes(viewerTz, start)
  if (same) return { local, yours: '' }
  const dayThere = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(start)
  const dayHere = new Intl.DateTimeFormat('en-CA', { timeZone: viewerTz }).format(start)
  const day = dayHere === dayThere ? '' : ` (${new Intl.DateTimeFormat('en-GB', { timeZone: viewerTz, weekday: 'short', day: 'numeric', month: 'short' }).format(start)})`
  return { local, yours: `${clockIn(viewerTz, start)}${day} your time` }
}

// Which places a list shows: your city, your country, or everywhere.
export const REACH = [
  { id: 'city', label: 'My city', icon: 'map-pin' },
  { id: 'country', label: 'My country', icon: 'flag' },
  { id: 'all', label: 'Everywhere', icon: 'globe' },
]
export function inReach(item, reach, me) {
  if (reach === 'all' || !me) return true
  const country = item.country || DEFAULT_COUNTRY
  if (reach === 'country') return country === (me.country || DEFAULT_COUNTRY)
  // A global community belongs to everyone's city.
  if (item.scope === 'global') return true
  // Things with no city on record (the demo calendar) aren't hidden.
  return country === (me.country || DEFAULT_COUNTRY) && (!item.city || String(item.city).toLowerCase() === String(me.city || 'Lagos').toLowerCase())
}
