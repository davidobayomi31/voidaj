// ── Which photos the home page hero shows ───────────────────────────
// The hero used to cycle through Nigerian photos for everyone, so someone in
// Toronto saw Lagos rooftops under "Toronto, Canada". Now it follows where
// the member lives (David, Nov 19): the landmark of their own city first
// (the CN Tower for Toronto), then well-known places around them (Times
// Square, Niagara Falls, Vancouver for a Canadian). Visitors who haven't
// signed up get a mix from around the world.
//
// `at` is which part of each photo stays in view, since the hero is a wide
// strip. `tags` are the cities a photo belongs to. Credits:
// public/images/hero/CREDITS.md.
import { findCity } from './places.js'

const P = (file, at = '50% 50%', ...tags) => ({ src: `/images/hero/${file}.jpg`, at, tags })

const PHOTO = {
  lagosBridge: P('lagos-bridge', '50% 45%', 'lagos'),
  civicTowers: P('civic-towers', '50% 40%', 'lagos'),
  lekki: P('lekki-bridge', '50% 55%', 'lagos'),
  sunsetRooftops: P('sunset-rooftops', '50% 62%', 'lagos'),
  enugu: P('enugu-skyline', '50% 50%', 'enugu'),

  cnTower: P('toronto-cn-tower', '50% 30%', 'toronto'),
  niagara: P('niagara-falls', '50% 55%'),
  vancouver: P('vancouver-skyline', '50% 45%', 'vancouver'),
  timesSquare: P('nyc-times-square', '50% 55%', 'new york'),
  manhattanDusk: P('nyc-manhattan-dusk', '50% 50%', 'new york'),
  empireState: P('nyc-empire-state', '50% 25%', 'new york'),
  nycDay: P('nyc-daytime', '50% 60%', 'new york'),

  towerBridgeSunset: P('london-tower-bridge-sunset', '50% 50%', 'london'),
  towerBridge: P('london-tower-bridge', '50% 45%', 'london'),
  londonRainbow: P('london-rainbow', '50% 55%', 'london'),

  tableMountain: P('cape-town-table-mountain', '50% 35%', 'cape town'),
  devilsPeak: P('cape-town-devils-peak', '50% 40%', 'cape town'),

  nairobiGold: P('nairobi-golden', '50% 55%', 'nairobi'),
  nairobi: P('nairobi-skyline', '50% 60%', 'nairobi'),

  accraArch: P('accra-independence-arch', '50% 40%', 'accra'),
  accraSquare: P('accra-independence-square', '50% 60%', 'accra'),

  dubaiNight: P('dubai-night', '50% 35%', 'dubai'),
  burjAlArab: P('dubai-burj-al-arab', '50% 55%', 'dubai'),
  burjKhalifa: P('dubai-burj-khalifa', '50% 35%', 'dubai'),

  eiffel: P('paris-eiffel', '50% 40%', 'paris'),
  pyramids: P('giza-pyramids', '50% 55%', 'cairo'),
  gizaAerial: P('giza-aerial', '50% 50%', 'cairo'),
}

// Visitors: the world, with Lagos among it.
const WORLD = [PHOTO.lagosBridge, PHOTO.timesSquare, PHOTO.towerBridgeSunset, PHOTO.tableMountain, PHOTO.dubaiNight, PHOTO.cnTower]

// By country: its own places first, then ones nearby.
const BY_COUNTRY = {
  NG: [PHOTO.lagosBridge, PHOTO.civicTowers, PHOTO.lekki, PHOTO.sunsetRooftops, PHOTO.enugu],
  GH: [PHOTO.accraArch, PHOTO.accraSquare, PHOTO.lagosBridge, PHOTO.civicTowers],
  CI: [PHOTO.accraArch, PHOTO.lagosBridge, PHOTO.lekki], SN: [PHOTO.accraArch, PHOTO.lagosBridge, PHOTO.lekki], CM: [PHOTO.lagosBridge, PHOTO.civicTowers, PHOTO.accraArch],
  KE: [PHOTO.nairobiGold, PHOTO.nairobi, PHOTO.tableMountain], UG: [PHOTO.nairobiGold, PHOTO.nairobi, PHOTO.tableMountain],
  TZ: [PHOTO.nairobi, PHOTO.nairobiGold, PHOTO.tableMountain], RW: [PHOTO.nairobiGold, PHOTO.nairobi, PHOTO.tableMountain],
  ET: [PHOTO.nairobiGold, PHOTO.nairobi, PHOTO.pyramids],
  ZA: [PHOTO.tableMountain, PHOTO.devilsPeak, PHOTO.nairobiGold],
  EG: [PHOTO.pyramids, PHOTO.gizaAerial, PHOTO.dubaiNight], MA: [PHOTO.pyramids, PHOTO.eiffel, PHOTO.dubaiNight],
  GB: [PHOTO.towerBridgeSunset, PHOTO.towerBridge, PHOTO.londonRainbow, PHOTO.eiffel],
  IE: [PHOTO.towerBridgeSunset, PHOTO.londonRainbow, PHOTO.eiffel],
  FR: [PHOTO.eiffel, PHOTO.towerBridgeSunset, PHOTO.londonRainbow], DE: [PHOTO.eiffel, PHOTO.towerBridgeSunset, PHOTO.towerBridge],
  NL: [PHOTO.eiffel, PHOTO.towerBridgeSunset, PHOTO.towerBridge], IT: [PHOTO.eiffel, PHOTO.towerBridgeSunset, PHOTO.dubaiNight],
  ES: [PHOTO.eiffel, PHOTO.towerBridgeSunset, PHOTO.dubaiNight],
  CA: [PHOTO.cnTower, PHOTO.niagara, PHOTO.vancouver, PHOTO.timesSquare, PHOTO.manhattanDusk],
  US: [PHOTO.timesSquare, PHOTO.manhattanDusk, PHOTO.empireState, PHOTO.nycDay, PHOTO.cnTower, PHOTO.niagara],
  AE: [PHOTO.dubaiNight, PHOTO.burjAlArab, PHOTO.burjKhalifa], SA: [PHOTO.dubaiNight, PHOTO.burjKhalifa, PHOTO.burjAlArab],
}

const same = (a, b) => a.src === b.src

// The photos for this member, their own city's first, never fewer than two.
export function heroPhotos(city, country) {
  const known = findCity(city, country)
  const cc = known?.country || country
  const set = BY_COUNTRY[cc] || WORLD
  const key = String(known?.name || city || '').toLowerCase()
  const own = Object.values(PHOTO).filter((p) => key && p.tags.includes(key))
  const ordered = [...own, ...set.filter((p) => !own.some((o) => same(o, p)))]
  return ordered.length >= 2 ? ordered : WORLD
}

export const worldHeroPhotos = () => WORLD
