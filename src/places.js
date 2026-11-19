// ── Where things are, beyond Nigeria ────────────────────────────────
// My City used to know eight Nigerian cities. VOIDAJ is for everyone, so
// this adds well-known cities in the other countries on the sign-up list,
// each with its coordinates, so a member in Toronto or Accra gets a map of
// their own city, not Nigeria's. Anywhere not listed falls back to the
// country (a pin is only drawn for cities we can place).
//
// Coordinates are approximate city centres (two decimals), enough to put a
// pin in the right spot and fly the map there.
import { CITIES } from './components/NigeriaMap.jsx'
import { countryName } from './countries.js'

// name, country code, longitude, latitude
const W = [
  ['Accra', 'GH', -0.19, 5.60], ['Kumasi', 'GH', -1.62, 6.69],
  ['Nairobi', 'KE', 36.82, -1.29], ['Mombasa', 'KE', 39.67, -4.04],
  ['Johannesburg', 'ZA', 28.05, -26.20], ['Cape Town', 'ZA', 18.42, -33.92], ['Durban', 'ZA', 31.02, -29.86], ['Pretoria', 'ZA', 28.19, -25.75],
  ['Cairo', 'EG', 31.24, 30.04], ['Alexandria', 'EG', 29.92, 31.20],
  ['Kigali', 'RW', 30.06, -1.95], ['Kampala', 'UG', 32.58, 0.35], ['Dar es Salaam', 'TZ', 39.21, -6.79],
  ['Dakar', 'SN', -17.47, 14.72], ['Abidjan', 'CI', -4.01, 5.36],
  ['Douala', 'CM', 9.77, 4.05], ['Yaoundé', 'CM', 11.50, 3.85],
  ['Addis Ababa', 'ET', 38.74, 9.03], ['Casablanca', 'MA', -7.59, 33.57], ['Marrakech', 'MA', -8.01, 31.63],
  ['London', 'GB', -0.13, 51.51], ['Manchester', 'GB', -2.24, 53.48], ['Birmingham', 'GB', -1.89, 52.49], ['Leeds', 'GB', -1.55, 53.80],
  ['Dublin', 'IE', -6.26, 53.35],
  ['New York', 'US', -74.01, 40.71], ['Houston', 'US', -95.37, 29.76], ['Atlanta', 'US', -84.39, 33.75], ['Chicago', 'US', -87.63, 41.88],
  ['Los Angeles', 'US', -118.24, 34.05], ['Washington', 'US', -77.04, 38.91], ['Dallas', 'US', -96.80, 32.78],
  ['Toronto', 'CA', -79.38, 43.65], ['Vancouver', 'CA', -123.12, 49.28], ['Montreal', 'CA', -73.57, 45.50], ['Ottawa', 'CA', -75.70, 45.42],
  ['Calgary', 'CA', -114.07, 51.05], ['Edmonton', 'CA', -113.49, 53.55], ['Winnipeg', 'CA', -97.14, 49.90], ['Sudbury', 'CA', -81.00, 46.49],
  ['Berlin', 'DE', 13.40, 52.52], ['Munich', 'DE', 11.58, 48.14], ['Paris', 'FR', 2.35, 48.86], ['Amsterdam', 'NL', 4.90, 52.37],
  ['Rome', 'IT', 12.50, 41.90], ['Milan', 'IT', 9.19, 45.46], ['Madrid', 'ES', -3.70, 40.42], ['Barcelona', 'ES', 2.17, 41.39],
  ['Dubai', 'AE', 55.27, 25.20], ['Abu Dhabi', 'AE', 54.38, 24.45], ['Riyadh', 'SA', 46.68, 24.71], ['Jeddah', 'SA', 39.17, 21.54],
  ['Mumbai', 'IN', 72.88, 19.08], ['Delhi', 'IN', 77.21, 28.61], ['Bengaluru', 'IN', 77.59, 12.97],
  ['Shanghai', 'CN', 121.47, 31.23], ['Beijing', 'CN', 116.41, 39.90], ['Tokyo', 'JP', 139.69, 35.68], ['Singapore', 'SG', 103.82, 1.35],
  ['Sydney', 'AU', 151.21, -33.87], ['Melbourne', 'AU', 144.96, -37.81],
  ['São Paulo', 'BR', -46.63, -23.55], ['Rio de Janeiro', 'BR', -43.17, -22.91], ['Mexico City', 'MX', -99.13, 19.43], ['Kingston', 'JM', -76.79, 17.97],
]

// Where to look when a member's city isn't in the list: the country, from
// its centre. zoom is how far in.
const COUNTRY_VIEW = {
  NG: { lon: 8.2, lat: 9.1, zoom: 5.2 }, GH: { lon: -1.0, lat: 7.9, zoom: 6 }, KE: { lon: 37.9, lat: 0.0, zoom: 5.6 },
  ZA: { lon: 25.0, lat: -29.0, zoom: 4.8 }, EG: { lon: 30.8, lat: 26.8, zoom: 5 }, RW: { lon: 29.9, lat: -1.95, zoom: 8 },
  UG: { lon: 32.3, lat: 1.4, zoom: 6.3 }, TZ: { lon: 34.9, lat: -6.4, zoom: 5.3 }, SN: { lon: -14.5, lat: 14.5, zoom: 6.3 },
  CI: { lon: -5.5, lat: 7.5, zoom: 6 }, CM: { lon: 12.4, lat: 5.7, zoom: 5.5 }, ET: { lon: 40.5, lat: 9.1, zoom: 5.3 },
  MA: { lon: -7.1, lat: 31.8, zoom: 5.3 }, GB: { lon: -2.5, lat: 54.0, zoom: 5 }, IE: { lon: -8.0, lat: 53.2, zoom: 6.2 },
  US: { lon: -96.0, lat: 38.5, zoom: 3.3 }, CA: { lon: -96.0, lat: 56.0, zoom: 2.8 }, DE: { lon: 10.4, lat: 51.2, zoom: 5.3 },
  FR: { lon: 2.4, lat: 46.6, zoom: 5 }, NL: { lon: 5.3, lat: 52.2, zoom: 6.6 }, IT: { lon: 12.6, lat: 42.5, zoom: 4.9 },
  ES: { lon: -3.7, lat: 40.2, zoom: 5 }, AE: { lon: 54.4, lat: 24.4, zoom: 6.5 }, SA: { lon: 45.0, lat: 24.0, zoom: 4.6 },
  IN: { lon: 78.9, lat: 22.5, zoom: 4 }, CN: { lon: 104.0, lat: 35.0, zoom: 3.4 }, JP: { lon: 138.0, lat: 37.5, zoom: 4.3 },
  SG: { lon: 103.8, lat: 1.35, zoom: 10 }, AU: { lon: 134.0, lat: -26.0, zoom: 3.4 }, BR: { lon: -52.0, lat: -12.0, zoom: 3.4 },
  MX: { lon: -102.0, lat: 23.5, zoom: 4 }, JM: { lon: -77.3, lat: 18.1, zoom: 7.5 },
}

const key = (s) => String(s || '').trim().toLowerCase()
const NG = CITIES.map((c) => ({ id: `ng-${c.id}`, name: c.name, country: 'NG', lon: c.lon, lat: c.lat, photo: c.photo, live: c.live }))
const WORLD = W.map(([name, country, lon, lat]) => ({ id: `${country.toLowerCase()}-${key(name).replace(/[^a-z]/g, '')}`, name, country, lon, lat }))
export const KNOWN_CITIES = [...NG, ...WORLD]

// A city we can put on the map. A country code narrows it down when two
// countries share a name (there's a London in Canada, too).
export function findCity(name, country) {
  const n = key(name)
  if (!n) return null
  const same = KNOWN_CITIES.filter((c) => key(c.name) === n)
  return same.find((c) => c.country === country) || same[0] || null
}

export const cities = (country) => KNOWN_CITIES.filter((c) => c.country === country)
export const countryView = (country) => COUNTRY_VIEW[country] || { lon: 8.2, lat: 9.1, zoom: 2.4 }

// "Toronto, Canada" — the country is the city's own where we know the city,
// otherwise the member's.
export function placeLabel(city, country) {
  const known = findCity(city, country)
  const cc = known?.country || country
  const name = countryName(cc)
  return [city, name].filter(Boolean).join(', ')
}
