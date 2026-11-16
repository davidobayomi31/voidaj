// "Add to Calendar" (Nuel's Events notes): a standard .ics file that any
// calendar app opens. When the time can be read it's written in UTC from
// the event's own time zone (so it lands at the right moment wherever the
// calendar is); otherwise it's an all-day entry.
import { eventStart } from './countries.js'

const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function icsFor(event, url) {
  const day = event.date.replace(/-/g, '')
  const next = new Date(`${event.date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  let start = `;VALUE=DATE:${day}`
  let end = `;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`
  const at = eventStart(event)
  if (at) {
    start = `:${utc(at)}`
    end = `:${utc(new Date(at.getTime() + 2 * 60 * 60 * 1000))}`
  }
  const esc = (t) => String(t || '').replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VOIDAJ//Events//EN', 'BEGIN:VEVENT',
    `UID:${event.id}@voidaj.com`, `DTSTART${start}`, `DTEND${end}`, `SUMMARY:${esc(event.title)}`,
    `LOCATION:${esc(event.venue)}`, `DESCRIPTION:${esc([event.description, url].filter(Boolean).join('\n\n'))}`, `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
}
