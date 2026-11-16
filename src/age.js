// Age comes before anything else on VOIDAJ, and the minimum is 16 for now
// (Nuel, Nov 10). The server checks it too (server/index.js, checkAge).
export const MIN_AGE = 16

export function ageOn(birthDate, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) return null
  const [y, m, d] = birthDate.split('-').map(Number)
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1
  return age
}

// The latest date of birth someone can have and still join today.
export const latestBirthDate = (today = new Date()) =>
  new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate()).toLocaleDateString('en-CA')

// Invite links (/auth?ref=…) and a date of birth given before going off to
// Google or Apple are kept for the moment the account exists.
const read = (k) => { try { return localStorage.getItem(k) || '' } catch { return '' } }
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* private mode */ } }
export const savedRef = () => read('voidaj_ref')
export const saveRef = (ref) => write('voidaj_ref', String(ref || '').slice(0, 60))
export const savedBirthDate = () => read('voidaj_dob')
export const saveBirthDate = (d) => write('voidaj_dob', d)

// Both are only needed until the account exists. A date of birth has no
// business sitting in someone's browser after that, so whoever uses these
// clears them (voidaj_country already works this way — see AgeGate).
export function clearSignUpCarryOver() {
  write('voidaj_dob', '')
  write('voidaj_ref', '')
}
