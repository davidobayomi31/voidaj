// An amount in words ("twenty thousand naira"), shown under a price before
// someone is hired, so a slipped zero (₦200,000 for ₦20,000) is caught.
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function under1000(n) {
  const h = Math.floor(n / 100)
  const r = n % 100
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ''}`
  return [h ? `${ONES[h]} hundred` : '', rest].filter(Boolean).join(' and ')
}

export function numberInWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0))
  if (n === 0) return 'zero'
  const parts = []
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [1, '']]) {
    const c = Math.floor(n / size) % 1000
    if (c) parts.push(`${under1000(c)}${name ? ` ${name}` : ''}`)
  }
  return parts.join(', ')
}

// Kobo in, words out: "twenty thousand naira", "one hundred naira and fifty kobo".
export function nairaInWords(kobo) {
  const naira = Math.floor(Number(kobo) / 100)
  const k = Math.round(Number(kobo) % 100)
  return `${numberInWords(naira)} naira${k ? ` and ${numberInWords(k)} kobo` : ''}`
}

// Two scams that come up on job chats in Nigeria: being talked into paying
// (or being paid) outside VOIDAJ, and a fake "I've paid you" alert or
// screenshot. A chat message that looks like either gets a quiet note under
// it (src/pages/Chats.jsx).
const MONEY_TALK = /\b\d{10}\b|account\s*(no|number|num)|\bacct\b|\btransfer\b|send (the )?money|\bcash\b|opay|palmpay|moniepoint|\bkuda\b|credit alert|i('| ha)ve paid|\bi paid\b|\bsent it\b|screenshot|receipt/i
export const moneyTalk = (text) => MONEY_TALK.test(String(text || ''))
