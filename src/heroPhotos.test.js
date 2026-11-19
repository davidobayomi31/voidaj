import { describe, expect, it } from 'vitest'
import { heroPhotos, worldHeroPhotos } from './heroPhotos.js'

describe('hero photos follow where you live', () => {
  it('puts the CN Tower first for Toronto, then places around it', () => {
    const p = heroPhotos('Toronto', 'CA').map((x) => x.src)
    expect(p[0]).toContain('toronto-cn-tower')
    expect(p.some((s) => s.includes('nyc-times-square'))).toBe(true)
    expect(p.some((s) => s.includes('lagos'))).toBe(false)
  })
  it('leads with the member’s own city when it has photos', () => {
    expect(heroPhotos('Vancouver', 'CA')[0].src).toContain('vancouver')
    expect(heroPhotos('new york', 'US')[0].src).toContain('nyc')
    expect(heroPhotos('Nairobi', 'KE')[0].src).toContain('nairobi')
  })
  it('keeps Nigeria’s own photos for Nigerians, and a world mix for everyone else we have no set for', () => {
    expect(heroPhotos('Lagos', 'NG')[0].src).toContain('lagos-bridge')
    expect(heroPhotos('Tokyo', 'JP').map((x) => x.src)).toEqual(worldHeroPhotos().map((x) => x.src))
    expect(heroPhotos('', '').length).toBeGreaterThanOrEqual(2)
  })
  it('only points at photos that exist', async () => {
    const fs = await import('node:fs')
    const all = new Set([...worldHeroPhotos(), ...heroPhotos('Toronto', 'CA'), ...heroPhotos('Lagos', 'NG'), ...heroPhotos('London', 'GB'), ...heroPhotos('Accra', 'GH'),
      ...heroPhotos('Cape Town', 'ZA'), ...heroPhotos('Cairo', 'EG'), ...heroPhotos('Dubai', 'AE'), ...heroPhotos('Paris', 'FR'), ...heroPhotos('Chicago', 'US'), ...heroPhotos('Kampala', 'UG')].map((x) => x.src))
    for (const src of all) expect(fs.existsSync(`public${src}`), src).toBe(true)
  })
})
