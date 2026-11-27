// Gender on the profile (Nuel, Nov 21: "Add specify by gender also").
// Optional. Stored as one of these codes, or as the person's own words.
export const GENDER_OPTIONS = [
  { id: 'woman', label: 'Woman' },
  { id: 'man', label: 'Man' },
  { id: 'non-binary', label: 'Non-binary' },
  { id: 'prefer-not', label: 'Prefer not to say' },
]
const LABELS = Object.fromEntries(GENDER_OPTIONS.map((g) => [g.id, g.label]))
export const isGenderCode = (v) => !!LABELS[v]
// What to show on a profile. "Prefer not to say" shows nothing.
export const genderLabel = (v) => (!v || v === 'prefer-not' ? '' : LABELS[v] || v)
