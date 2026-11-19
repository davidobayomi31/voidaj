import { describe, expect, it } from 'vitest'
import { findCity, cities, countryView, placeLabel, KNOWN_CITIES } from './places.js'

describe('places beyond Nigeria', () => {
  it('finds a city in any capitals, with a country to narrow it down', () => {
    expect(findCity('toronto')).toMatchObject({ name: 'Toronto', country: 'CA' })
    expect(findCity('  SUDBURY ', 'CA')).toMatchObject({ country: 'CA' })
    expect(findCity('Lagos')).toMatchObject({ country: 'NG' })
    expect(findCity('Nowhereville')).toBeNull()
    expect(findCity('')).toBeNull()
  })

  it('lists a country’s cities, and has a view for every country on the sign-up list', () => {
    expect(cities('CA').map((c) => c.name)).toContain('Vancouver')
    expect(cities('NG').length).toBeGreaterThanOrEqual(8)
    for (const c of KNOWN_CITIES) {
      expect(Number.isFinite(c.lon) && Number.isFinite(c.lat)).toBe(true)
      expect(c.lon).toBeGreaterThanOrEqual(-180); expect(c.lon).toBeLessThanOrEqual(180)
      expect(c.lat).toBeGreaterThanOrEqual(-90); expect(c.lat).toBeLessThanOrEqual(90)
    }
    expect(countryView('CA').zoom).toBeLessThan(countryView('SG').zoom)
  })

  it('names the country without assuming Nigeria', () => {
    expect(placeLabel('Toronto', 'CA')).toBe('Toronto, Canada')
    expect(placeLabel('Lagos', 'CA')).toBe('Lagos, Nigeria') // a known city keeps its own country
    expect(placeLabel('Thunder Bay', 'CA')).toBe('Thunder Bay, Canada')
    expect(placeLabel('', 'GH')).toBe('Ghana')
  })
})
