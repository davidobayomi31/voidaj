// Time zones, money and the place filter (PLAN-NOTES-AND-GLOBAL.md §2).
import { describe, expect, it } from 'vitest'
import { parseClock, eventStart, eventTimeLabel, withCurrency, currencySymbol, inReach, flagOf } from './countries.js'

describe('event times', () => {
  it('reads the ways people type a time', () => {
    expect(parseClock('6:30 PM')).toEqual({ h: 18, min: 30 })
    expect(parseClock('18:00')).toEqual({ h: 18, min: 0 })
    expect(parseClock('7pm')).toEqual({ h: 19, min: 0 })
    expect(parseClock('12 am')).toEqual({ h: 0, min: 0 })
    expect(parseClock('All day')).toBe(null)
  })

  it('places an event at the right moment in its own time zone', () => {
    expect(eventStart({ date: '2027-01-15', time: '6:30 PM', timezone: 'Africa/Lagos' }).toISOString()).toBe('2027-01-15T17:30:00.000Z')
    // London in summer is UTC+1.
    expect(eventStart({ date: '2027-07-01', time: '9:00', timezone: 'Europe/London' }).toISOString()).toBe('2027-07-01T08:00:00.000Z')
    expect(eventStart({ date: '2027-07-01', time: 'evening' })).toBe(null)
  })

  it('shows the event’s time, and yours when you’re somewhere else', () => {
    const ev = { date: '2027-01-15', time: '6:00 PM', timezone: 'Africa/Lagos' }
    expect(eventTimeLabel(ev, 'Africa/Lagos')).toEqual({ local: '6:00 PM WAT', yours: '' })
    const ny = eventTimeLabel(ev, 'America/New_York')
    expect(ny.local).toBe('6:00 PM WAT')
    expect(ny.yours).toBe('12:00 PM your time')
    // Late in Lagos is the next day in Tokyo.
    expect(eventTimeLabel({ ...ev, time: '11:00 PM' }, 'Asia/Tokyo').yours).toMatch(/^7:00 AM \(Sat 16 Jan\) your time$/)
  })
})

describe('money', () => {
  it('puts the listing’s currency on a bare number', () => {
    expect(withCurrency('15,000', 'NGN')).toBe('₦15,000')
    expect(withCurrency('40', 'GBP')).toBe('£40')
    expect(withCurrency('₦8,000/run', 'NGN')).toBe('₦8,000/run')
    expect(withCurrency('', 'USD')).toBe('')
    expect(currencySymbol('KES')).toBeTruthy()
  })
})

describe('my city, my country, everywhere', () => {
  const me = { city: 'Lagos', country: 'NG' }
  it('filters by place', () => {
    expect(inReach({ city: 'Abuja', country: 'NG' }, 'country', me)).toBe(true)
    expect(inReach({ city: 'Abuja', country: 'NG' }, 'city', me)).toBe(false)
    expect(inReach({ city: 'Accra', country: 'GH' }, 'country', me)).toBe(false)
    expect(inReach({ city: 'Accra', country: 'GH' }, 'all', me)).toBe(true)
    expect(inReach({ scope: 'global', city: 'Global' }, 'city', me)).toBe(true)
    expect(flagOf('NG')).toBe('🇳🇬')
  })
})
