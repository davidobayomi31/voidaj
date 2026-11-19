// Phone with a country-code picker, and opening hours picked from days and
// times instead of typed (Nuel, Nov 13: "Area code number, time options").
// Both still save as plain text, so nothing on the server changes:
// phone as "+2348012345678", hours as "Mon–Sat, 9:00 AM – 6:00 PM".
import { useMemo, useState } from 'react'
import { COUNTRIES, flagOf, normalisePhone } from '../countries.js'

// ── Phone ────────────────────────────────────────────────────────────
// Splits a saved "+234…" back into its country and the rest.
export function splitPhone(phone, fallback = 'NG') {
  const digits = String(phone || '').replace(/[^0-9]/g, '')
  if (!String(phone || '').trim().startsWith('+') || !digits) return { country: fallback, number: phone || '' }
  const hit = [...COUNTRIES].sort((a, b) => String(b.dial).length - String(a.dial).length)
    .find((c) => digits.startsWith(String(c.dial)))
  return hit ? { country: hit.code, number: digits.slice(String(hit.dial).length) } : { country: fallback, number: phone }
}

export function PhoneInput({ value, onChange, defaultCountry = 'NG' }) {
  const [parts, setParts] = useState(() => splitPhone(value, defaultCountry))
  const [bad, setBad] = useState(false)
  const update = (next) => {
    const p = { ...parts, ...next }
    setParts(p)
    if (!p.number.trim()) { setBad(false); onChange(''); return }
    const full = normalisePhone(p.number, p.country)
    setBad(full === null)
    onChange(full || p.number)
  }
  return (
    <>
      <div className="phone-field">
        <select value={parts.country} onChange={(e) => update({ country: e.target.value })} aria-label="Country code">
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flagOf(c.code)} +{c.dial}</option>)}
        </select>
        <input type="tel" value={parts.number} onChange={(e) => update({ number: e.target.value })}
          placeholder={parts.country === 'NG' ? '0801 234 5678' : 'Phone number'} inputMode="tel" maxLength={20} />
      </div>
      {bad && <em className="field-hint bad">That number doesn’t look complete yet.</em>}
    </>
  )
}

// ── Opening hours ────────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2); const m = i % 2 ? '30' : '00'
  const h12 = h % 12 || 12
  return `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`
})
const PRESETS = [
  { label: 'Every day', days: DAYS },
  { label: 'Mon–Fri', days: DAYS.slice(0, 5) },
  { label: 'Mon–Sat', days: DAYS.slice(0, 6) },
  { label: 'Weekends', days: DAYS.slice(5) },
]

// "Mon, Tue, Wed, Fri" → "Mon–Wed, Fri"
function dayText(days) {
  const idx = DAYS.map((d, i) => (days.includes(d) ? i : -1)).filter((i) => i >= 0)
  if (idx.length === 7) return 'Every day'
  const runs = []
  for (const i of idx) {
    const last = runs[runs.length - 1]
    if (last && i === last[1] + 1) last[1] = i
    else runs.push([i, i])
  }
  return runs.map(([a, b]) => (a === b ? DAYS[a] : b === a + 1 ? `${DAYS[a]}, ${DAYS[b]}` : `${DAYS[a]}–${DAYS[b]}`)).join(', ')
}

export function hoursText({ days, open, close, allDay }) {
  if (!days.length) return ''
  return `${dayText(days)}, ${allDay ? 'open 24 hours' : `${open} – ${close}`}`
}

// Reads back what this picker wrote. Anything else stays as typed text.
export function parseHours(s) {
  const m = /^(.+?), (open 24 hours|(\d{1,2}:\d{2} [AP]M) – (\d{1,2}:\d{2} [AP]M))$/.exec(String(s || '').trim())
  if (!m) return null
  const days = []
  if (m[1] === 'Every day') days.push(...DAYS)
  else {
    for (const part of m[1].split(', ')) {
      const [a, b] = part.split('–')
      const ia = DAYS.indexOf(a); const ib = b ? DAYS.indexOf(b) : ia
      if (ia < 0 || ib < 0) return null
      for (let i = ia; i <= ib; i++) days.push(DAYS[i])
    }
  }
  return m[2] === 'open 24 hours' ? { days, open: '9:00 AM', close: '6:00 PM', allDay: true } : { days, open: m[3], close: m[4], allDay: false }
}

export function HoursPicker({ value, onChange }) {
  const parsed = useMemo(() => parseHours(value), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [custom, setCustom] = useState(!!value && !parsed)
  const [h, setH] = useState(parsed || { days: [], open: '9:00 AM', close: '6:00 PM', allDay: false })
  const update = (next) => { const v = { ...h, ...next }; setH(v); onChange(hoursText(v)) }
  const toggle = (d) => update({ days: h.days.includes(d) ? h.days.filter((x) => x !== d) : [...h.days, d] })

  if (custom) {
    return (
      <div className="hours-custom">
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={120} placeholder="Mon–Sat, 9am–6pm" />
        <button type="button" className="btn ghost small" onClick={() => { setCustom(false); onChange(hoursText(h)) }}>Pick days and times</button>
      </div>
    )
  }
  return (
    <div className="hours-picker">
      <div className="chip-row hours-presets">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className={dayText(h.days) === dayText(p.days) && h.days.length === p.days.length ? 'on' : ''}
            onClick={() => update({ days: p.days })}>{p.label}</button>
        ))}
      </div>
      <div className="hours-days" role="group" aria-label="Days open">
        {DAYS.map((d) => (
          <button key={d} type="button" aria-pressed={h.days.includes(d)} className={h.days.includes(d) ? 'on' : ''} onClick={() => toggle(d)}>{d}</button>
        ))}
      </div>
      <div className="hours-times">
        <select value={h.open} disabled={h.allDay} onChange={(e) => update({ open: e.target.value })} aria-label="Opens at">
          {TIMES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <span>to</span>
        <select value={h.close} disabled={h.allDay} onChange={(e) => update({ close: e.target.value })} aria-label="Closes at">
          {TIMES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label className="admin-check"><input type="checkbox" checked={h.allDay} onChange={(e) => update({ allDay: e.target.checked })} /> 24 hours</label>
      </div>
      <span className="meta-dim hours-preview">{h.days.length ? hoursText(h) : 'Pick the days you’re open.'}
        {' · '}<button type="button" className="link-btn" onClick={() => setCustom(true)}>Type it instead</button></span>
    </div>
  )
}
