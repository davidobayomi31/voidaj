import { describe, it, expect } from 'vitest'
import { icsFor } from './ics.js'
import { categoryOf, CATEGORIES } from './categories.js'
import { ageOn, latestBirthDate, MIN_AGE } from './age.js'

describe('Add to calendar', () => {
  it('makes a timed entry when the time can be read', () => {
    const ics = icsFor({ id: 'ev-1', title: 'Pitch, Night', date: '2027-01-15', time: '6:30 PM', venue: 'Yaba' }, 'https://voidaj.com/event/ev-1')
    // 6:30 PM in Lagos (WAT, UTC+1) is 17:30 UTC.
    expect(ics).toContain('DTSTART:20270115T173000Z')
    expect(ics).toContain('DTEND:20270115T193000Z')
    expect(ics).toContain('SUMMARY:Pitch\\, Night')
  })
  it('makes an all-day entry otherwise, ending the next day', () => {
    const ics = icsFor({ id: 'ev-2', title: 'Market', date: '2027-12-31', time: 'All day' }, 'u')
    expect(ics).toContain('DTSTART;VALUE=DATE:20271231')
    expect(ics).toContain('DTEND;VALUE=DATE:20280101')
  })
})

describe('categories', () => {
  it('has Nuel’s sixteen shared categories', () => {
    expect(CATEGORIES).toHaveLength(16)
    expect(CATEGORIES.at(-1).id).toBe('other')
  })
  it('keeps a chosen category and works one out for older items', () => {
    expect(categoryOf({ category: 'faith', tags: ['coding'] })).toBe('faith')
    expect(categoryOf({ tags: ['coding', 'web-development'] })).toBe('tech')
    expect(categoryOf({ tags: ['photography', 'art'] })).toBe('arts')
    expect(categoryOf({ name: 'Something else entirely' })).toBe('other')
  })
})

describe('age', () => {
  it('counts birthdays correctly', () => {
    const today = new Date(2026, 10, 12)
    expect(ageOn('2010-11-12', today)).toBe(16)
    expect(ageOn('2010-11-13', today)).toBe(15)
    expect(ageOn('nope', today)).toBe(null)
    expect(ageOn(latestBirthDate(today), today)).toBe(MIN_AGE)
  })
})
