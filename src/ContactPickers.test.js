import { describe, expect, it } from 'vitest'
import { hoursText, parseHours, splitPhone } from './components/ContactPickers.jsx'

describe('opening hours picker', () => {
  it('writes days as ranges and reads them back', () => {
    const h = { days: ['Mon', 'Tue', 'Wed', 'Fri'], open: '9:00 AM', close: '6:30 PM', allDay: false }
    expect(hoursText(h)).toBe('Mon–Wed, Fri, 9:00 AM – 6:30 PM')
    expect(parseHours(hoursText(h))).toEqual(h)
    expect(hoursText({ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], allDay: true })).toBe('Every day, open 24 hours')
    expect(parseHours('Every day, open 24 hours').days).toHaveLength(7)
  })
  it('leaves hand-typed hours alone', () => {
    expect(parseHours('every day')).toBeNull()
  })
})

describe('phone splitting', () => {
  it('finds the country from the dial code', () => {
    expect(splitPhone('+2348016549872')).toEqual({ country: 'NG', number: '8016549872' })
    expect(splitPhone('08016549872', 'NG')).toEqual({ country: 'NG', number: '08016549872' })
  })
})
