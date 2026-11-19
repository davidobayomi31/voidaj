// ── Event & community categories ─────────────────────────────────────
// One shared list for Events and Communities (Nuel, Nov 12: "I want to
// categorize events and also communities", with his list of 16). They show
// as small tabs saying which category something falls under ("not this tho
// it's just like small tabs"), and as filters on the Events and
// Communities pages. The server keeps the same ids (server/categories.js).
import { CATEGORY_IDS } from '../server/categories.js'

const META = {
  music: { label: 'Music & Entertainment', short: 'Music', icon: 'radio' },
  social: { label: 'Social & Lifestyle', short: 'Social', icon: 'users' },
  business: { label: 'Business & Entrepreneurship', short: 'Business', icon: 'briefcase' },
  tech: { label: 'Technology & Gaming', short: 'Tech', icon: 'code' },
  sports: { label: 'Sports & Fitness', short: 'Sports', icon: 'award' },
  arts: { label: 'Arts & Creativity', short: 'Arts', icon: 'image' },
  education: { label: 'Education & Learning', short: 'Education', icon: 'book' },
  causes: { label: 'Community & Causes', short: 'Causes', icon: 'heart' },
  food: { label: 'Food & Drinks', short: 'Food', icon: 'store' },
  travel: { label: 'Travel & Adventure', short: 'Travel', icon: 'compass' },
  health: { label: 'Health & Wellness', short: 'Health', icon: 'leaf' },
  faith: { label: 'Faith & Spirituality', short: 'Faith', icon: 'sun' },
  culture: { label: 'Culture & Heritage', short: 'Culture', icon: 'globe' },
  hobbies: { label: 'Hobbies & Interests', short: 'Hobbies', icon: 'camera' },
  family: { label: 'Family & Relationships', short: 'Family', icon: 'home' },
  other: { label: 'Other', short: 'Other', icon: 'more' },
}

export const CATEGORIES = CATEGORY_IDS.map((id) => ({ id, ...META[id] }))
export const findCategory = (id) => CATEGORIES.find((c) => c.id === id) || null

// Things made before categories existed (and the demo data) have none, so
// one is worked out from their tags and name. A chosen category always wins.
const HINTS = [
  ['tech', /\b(tech|coding|code|developer|devs?|web|data|ai|gaming|game|software|javascript|startup ?tech)\b/],
  ['business', /\b(business|entrepreneur\w*|startups?|finance|market\w*|pitch|founders?|small-business|networking|investors?)\b/],
  ['arts', /\b(art|arts|photo\w*|design|fashion|craft|creative|paint\w*|lens)\b/],
  ['education', /\b(learn\w*|study|class|course|workshop|mentorship|school|tutor\w*|bootcamp)\b/],
  ['causes', /\b(sustainab\w*|green|volunteer\w*|charity|ngo|climate|renewable\w*|cleanup|community)\b/],
  ['food', /\b(food|cook\w*|farm\w*|agricultur\w*|restaurant|drinks?|chops)\b/],
  ['music', /\b(music|concert|dj|party|comedy|film|movie|entertainment)\b/],
  ['sports', /\b(sports?|football|fitness|gym|run\w*|basketball|yoga)\b/],
  ['health', /\b(health|wellness|mental|medical|clinic)\b/],
  ['faith', /\b(faith|church|mosque|prayer|spiritual\w*|worship)\b/],
  ['travel', /\b(travel|trip|tour|adventure|hike|hiking)\b/],
  ['culture', /\b(culture|heritage|tradition\w*|language|history)\b/],
  ['family', /\b(family|parent\w*|kids|marriage|relationship\w*|dating)\b/],
  ['hobbies', /\b(hobby|hobbies|books?|reading|chess|garden\w*)\b/],
  ['social', /\b(social|hangout|meetup|friends|lifestyle)\b/],
]
export function categoryOf(item) {
  if (!item) return null
  if (item.category && META[item.category]) return item.category
  const text = `${(item.tags || []).join(' ')} ${item.name || item.title || ''}`.toLowerCase().replace(/-/g, ' ')
  return HINTS.find(([, re]) => re.test(text))?.[0] || 'other'
}
