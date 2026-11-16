// The shared Event & Community categories (src/categories.js) as UI: a
// picker for the create forms, the small tab on each card that says which
// category it falls under, and the row of filter chips on the list pages.
import { CATEGORIES, findCategory } from '../categories.js'
import { Icon } from './Icons.jsx'

export function CategorySelect({ value, onChange, id = 'category' }) {
  return (
    <select id={id} className="job-select" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label="Category" required>
      <option value="" disabled>Pick a category</option>
      {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  )
}

export function CategoryTag({ id, short = true }) {
  const c = findCategory(id)
  if (!c) return null
  return <span className="cat-tag" title={c.label}><Icon name={c.icon} size={11} /> {short ? c.short : c.label}</span>
}

// `counts` (optional) hides categories with nothing in them.
export function CategoryChips({ value, onChange, counts }) {
  const shown = counts ? CATEGORIES.filter((c) => counts[c.id]) : CATEGORIES
  return (
    <div className="chip-row cat-chips" role="tablist" aria-label="Categories">
      <button type="button" role="tab" aria-selected={!value} className={!value ? 'on' : ''} onClick={() => onChange('')}>All</button>
      {shown.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={value === c.id} className={value === c.id ? 'on' : ''} onClick={() => onChange(value === c.id ? '' : c.id)}>
          <Icon name={c.icon} size={13} /> {c.short}
        </button>
      ))}
    </div>
  )
}
