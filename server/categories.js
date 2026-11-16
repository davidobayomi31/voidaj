// The shared Event & Community categories (Nuel, Nov 12). Labels and icons
// live in src/categories.js; the server only needs to know which ids exist.
export const CATEGORY_IDS = [
  'music', 'social', 'business', 'tech', 'sports', 'arts', 'education', 'causes',
  'food', 'travel', 'health', 'faith', 'culture', 'hobbies', 'family', 'other',
]
export const cleanCategory = (v) => (CATEGORY_IDS.includes(v) ? v : null)
