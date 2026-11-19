// My city · My country · Everywhere (PLAN-NOTES-AND-GLOBAL.md §2): which
// places a list of events, communities or jobs covers. Kept in the URL as
// ?reach= so a filtered list can be linked to. Everywhere is the default.
import { useSearchParams } from 'react-router-dom'
import { Icon } from './Icons.jsx'
import { REACH, flagOf } from '../countries.js'

export function useReach() {
  const [params, setParams] = useSearchParams()
  const reach = REACH.some((r) => r.id === params.get('reach')) ? params.get('reach') : 'all'
  const setReach = (v) => setParams((p) => { v === 'all' ? p.delete('reach') : p.set('reach', v); return p }, { replace: true })
  return [reach, setReach]
}

export function ReachChips({ value, onChange, me }) {
  if (!me) return null
  return (
    <div className="chip-row reach-chips" role="tablist" aria-label="Where">
      {REACH.map((r) => (
        <button key={r.id} type="button" role="tab" aria-selected={value === r.id} className={value === r.id ? 'on' : ''} onClick={() => onChange(r.id)}>
          <Icon name={r.icon} size={13} /> {r.id === 'city' ? me.city || 'My city' : r.id === 'country' ? `${flagOf(me.country || 'NG')} My country` : r.label}
        </button>
      ))}
    </div>
  )
}
