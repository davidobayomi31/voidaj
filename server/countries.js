// ── Countries ────────────────────────────────────────────────────────
// VOIDAJ outside Nigeria (PLAN-NOTES-AND-GLOBAL.md §2). One list, shared
// by the server and the app (src/countries.js re-exports it): each
// country's currency, dialling code and main time zone. Nigeria is the
// default, and the list is ordered for where VOIDAJ's people actually are:
// West Africa first, then the rest of Africa, then the diaspora.
export const COUNTRIES = [
  { code: 'NG', name: 'Nigeria', currency: 'NGN', dial: '234', tz: 'Africa/Lagos' },
  { code: 'GH', name: 'Ghana', currency: 'GHS', dial: '233', tz: 'Africa/Accra' },
  { code: 'KE', name: 'Kenya', currency: 'KES', dial: '254', tz: 'Africa/Nairobi' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', dial: '27', tz: 'Africa/Johannesburg' },
  { code: 'EG', name: 'Egypt', currency: 'EGP', dial: '20', tz: 'Africa/Cairo' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF', dial: '250', tz: 'Africa/Kigali' },
  { code: 'UG', name: 'Uganda', currency: 'UGX', dial: '256', tz: 'Africa/Kampala' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', dial: '255', tz: 'Africa/Dar_es_Salaam' },
  { code: 'SN', name: 'Senegal', currency: 'XOF', dial: '221', tz: 'Africa/Dakar' },
  { code: 'CI', name: 'Côte d’Ivoire', currency: 'XOF', dial: '225', tz: 'Africa/Abidjan' },
  { code: 'CM', name: 'Cameroon', currency: 'XAF', dial: '237', tz: 'Africa/Douala' },
  { code: 'ET', name: 'Ethiopia', currency: 'ETB', dial: '251', tz: 'Africa/Addis_Ababa' },
  { code: 'MA', name: 'Morocco', currency: 'MAD', dial: '212', tz: 'Africa/Casablanca' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', dial: '44', tz: 'Europe/London' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', dial: '353', tz: 'Europe/Dublin' },
  { code: 'US', name: 'United States', currency: 'USD', dial: '1', tz: 'America/New_York' },
  { code: 'CA', name: 'Canada', currency: 'CAD', dial: '1', tz: 'America/Toronto' },
  { code: 'DE', name: 'Germany', currency: 'EUR', dial: '49', tz: 'Europe/Berlin' },
  { code: 'FR', name: 'France', currency: 'EUR', dial: '33', tz: 'Europe/Paris' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', dial: '31', tz: 'Europe/Amsterdam' },
  { code: 'IT', name: 'Italy', currency: 'EUR', dial: '39', tz: 'Europe/Rome' },
  { code: 'ES', name: 'Spain', currency: 'EUR', dial: '34', tz: 'Europe/Madrid' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', dial: '971', tz: 'Asia/Dubai' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', dial: '966', tz: 'Asia/Riyadh' },
  { code: 'IN', name: 'India', currency: 'INR', dial: '91', tz: 'Asia/Kolkata' },
  { code: 'CN', name: 'China', currency: 'CNY', dial: '86', tz: 'Asia/Shanghai' },
  { code: 'JP', name: 'Japan', currency: 'JPY', dial: '81', tz: 'Asia/Tokyo' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', dial: '65', tz: 'Asia/Singapore' },
  { code: 'AU', name: 'Australia', currency: 'AUD', dial: '61', tz: 'Australia/Sydney' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', dial: '55', tz: 'America/Sao_Paulo' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', dial: '52', tz: 'America/Mexico_City' },
  { code: 'JM', name: 'Jamaica', currency: 'JMD', dial: '1', tz: 'America/Jamaica' },
]
export const DEFAULT_COUNTRY = 'NG'
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code)
export const findCountry = (code) => COUNTRIES.find((c) => c.code === code) || null
export const cleanCountry = (v) => (COUNTRY_CODES.includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : null)
export const currencyOf = (code) => findCountry(code)?.currency || 'NGN'

export const CURRENCIES = [...new Set(COUNTRIES.map((c) => c.currency))]
export const cleanCurrency = (v) => (CURRENCIES.includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : null)

// What works where. A feature missing from this map works everywhere.
// ID verification checks a Nigerian NIN, and paid ads and business
// promotions are priced and paid in naira, so those are Nigeria-only until
// they're set up for somewhere else.
export const COUNTRY_FEATURES = {
  idVerification: ['NG'],
  paidAds: ['NG'],
  promotions: ['NG'],
}
export const featureOn = (feature, country) => !COUNTRY_FEATURES[feature] || COUNTRY_FEATURES[feature].includes(country || DEFAULT_COUNTRY)
export const featuresFor = (country) => Object.fromEntries(Object.keys(COUNTRY_FEATURES).map((f) => [f, featureOn(f, country)]))

// Phone numbers are kept in the international format: + then the
// country's dialling code then the number, digits only (E.164). A number
// typed with a leading 0 (the way it's dialled at home) loses the 0.
export function normalisePhone(raw, country = DEFAULT_COUNTRY) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (!/^\+?[0-9 ()./-]+$/.test(s)) return null
  let digits = s.replace(/[^0-9]/g, '')
  if (s.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else {
    const dial = findCountry(country)?.dial || '234'
    digits = dial + digits.replace(/^0+/, '')
  }
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return null
  return `+${digits}`
}

export function isTimeZone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}
