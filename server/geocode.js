// Where an event is, for the map (David, Nov 28: "u cant see events on maps?").
// Events only have a typed venue ("Workbay, Yaba"), so we look it up once on
// OpenStreetMap's free geocoder (Nominatim: no key, at most one request a
// second, and it asks for an identifying User-Agent) and keep the answer on
// the event. Online events and venues it can't find stay off the map; we
// never guess a spot, so a pin always means "it's here".
import q from './db.js'
import { findCountry } from './countries.js'

const UA = 'VOIDAJ/1.0 (+https://voidaj.com)'
let last = 0
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function lookup(text) {
  const gap = 1100 - (Date.now() - last)
  if (gap > 0) await wait(gap)
  last = Date.now()
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(text)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(4000) })
  if (!res.ok) return null
  const [hit] = await res.json()
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null
}

// What to search for: the venue, then just its last part ("Yaba"), each
// with the city and country so "Freedom Park" lands in the right one.
export function geoQueries(row) {
  if (process.env.VITEST || row.format === 'online') return []
  const venue = String(row.venue || '').replace(/\([^)]*\)/g, '').trim()
  if (!venue || /^online\b/i.test(venue)) return []
  const tail = [row.city, findCountry(row.country || 'NG')?.name].filter(Boolean).join(', ')
  const parts = venue.split(',').map((s) => s.trim()).filter(Boolean)
  const tries = [`${venue}, ${tail}`]
  if (parts.length > 1) tries.push(`${parts.at(-1)}, ${tail}`)
  return tries
}

// Look the event up if its venue changed since last time. Never throws.
export async function geocodeEvent(id) {
  try {
    const row = await q.get('SELECT id, venue, city, country, format, geo_q FROM events WHERE id = ?', id)
    if (!row) return
    const tries = geoQueries(row)
    const key = tries[0] || ''
    if (row.geo_q === key) return
    let spot = null
    for (const t of tries) { spot = await lookup(t).catch(() => null); if (spot) break }
    await q.run('UPDATE events SET lat = ?, lon = ?, geo_q = ? WHERE id = ?', spot?.lat ?? null, spot?.lon ?? null, key, id)
  } catch { /* the map can do without it */ }
}
