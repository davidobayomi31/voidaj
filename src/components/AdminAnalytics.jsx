// Admin → Analytics: how VOIDAJ is growing and whether people use it, on one
// page that can be shown to the team or printed. The numbers come from
// /api/admin/analytics (server/analytics.js); real accounts only.
import { useEffect, useState } from 'react'
import * as api from '../api.js'
import { countryName } from '../countries.js'
import { Icon } from './Icons.jsx'
import './AdminAnalytics.css'

const short = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const n = (v) => Number(v || 0).toLocaleString('en-GB')

// A change against the week before: "+3 vs last week".
function change(now, before) {
  if (before === 0 && now === 0) return 'same as last week'
  const d = now - before
  return `${d > 0 ? '+' : ''}${d} vs last week`
}

function Tile({ label, value, sub, feature }) {
  return (
    <div className={`an-tile${feature ? ' feature' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
      {sub && <em>{sub}</em>}
    </div>
  )
}

// Bars, one per day, with the first and last date underneath.
function Bars({ data, label }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const sum = data.reduce((a, d) => a + d.count, 0)
  return (
    <figure className="an-chart">
      <div className="an-bars" role="img" aria-label={`${label}: ${sum} in the last ${data.length} days`}>
        {data.map((d) => (
          <span key={d.date} className="an-bar" title={`${short(d.date)}: ${d.count}`}>
            <i style={{ height: `${Math.max(d.count ? 6 : 0, (d.count / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <figcaption><span>{short(data[0].date)}</span><span>{short(data[data.length - 1].date)}</span></figcaption>
    </figure>
  )
}

// The running total as a line with a soft fill.
function Line({ data, label }) {
  const W = 600, H = 150, P = 6
  const min = Math.min(...data.map((d) => d.count)), max = Math.max(...data.map((d) => d.count), min + 1)
  const x = (i) => P + (i / (data.length - 1)) * (W - 2 * P)
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P)
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`)
  return (
    <figure className="an-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="an-line" role="img" aria-label={`${label}: ${data[0].count} to ${data[data.length - 1].count}`} preserveAspectRatio="none">
        <polygon points={`${x(0)},${H} ${pts.join(' ')} ${x(data.length - 1)},${H}`} className="an-area" />
        <polyline points={pts.join(' ')} className="an-stroke" />
      </svg>
      <figcaption><span>{short(data[0].date)} · {n(data[0].count)}</span><span>{short(data[data.length - 1].date)} · {n(data[data.length - 1].count)}</span></figcaption>
    </figure>
  )
}

// A ranked list with a bar behind each line.
function Rank({ rows, empty = 'Nothing yet', total }) {
  if (!rows.length) return <p className="meta-dim">{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="an-rank">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="an-rank-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          <span className="an-rank-label">{r.label}</span>
          <b>{n(r.count)}{total ? <small> · {Math.round((r.count / total) * 100)}%</small> : null}</b>
        </li>
      ))}
    </ul>
  )
}

const Card = ({ title, hint, children, wide }) => (
  <section className={`an-card${wide ? ' wide' : ''}`}>
    <h3>{title}</h3>
    {hint && <p className="meta-dim an-hint">{hint}</p>}
    {children}
  </section>
)

export function AdminAnalytics() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.adminAnalytics().then(setData).catch((e) => setError(e.message)) }, [])

  if (error) return <p className="auth-error" role="alert">{error}</p>
  if (!data) return <p className="meta-dim" style={{ marginTop: 24 }}>Loading analytics…</p>

  const h = data.headline
  const made = new Date(data.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="an">
      <div className="an-top">
        <p className="meta-dim">Real accounts only (sample accounts left out). Updated {made}.</p>
        <button className="btn ghost small" onClick={() => window.print()}><Icon name="arrow-down" size={14} /> Print or save as PDF</button>
      </div>

      <div className="an-tiles">
        <Tile feature label="Members" value={n(h.members)} sub={`${n(h.joinedToday)} joined today`} />
        <Tile label="Joined this week" value={n(h.joinedWeek)} sub={change(h.joinedWeek, h.joinedPrevWeek)} />
        <Tile label="Joined this month" value={n(h.joinedMonth)} />
        <Tile label="Active today" value={n(h.activeToday)} sub={`${n(h.activeWeek)} this week · ${n(h.activeMonth)} this month`} />
        <Tile label="Come back weekly" value={h.returningRate == null ? '—' : `${h.returningRate}%`} sub="of members who joined over a week ago" />
        <Tile label="Verified (ID)" value={n(h.verified)} sub={`${n(h.referred)} joined from an invite`} />
      </div>

      <div className="an-grid">
        <Card title="Members over 30 days" hint="Everyone who has joined, adding up day by day." wide>
          <Line data={data.total} label="Members" />
        </Card>
        <Card title="New members per day">
          <Bars data={data.signups} label="New members" />
        </Card>
        <Card title="People signing in per day" hint="Different people who signed in on each day.">
          <Bars data={data.activeDaily} label="People signing in" />
        </Card>
        <Card title="Things made per day" hint="Posts, comments, chat messages, jobs and events together.">
          <Bars data={data.activity} label="Things made" />
        </Card>

        <Card title="From sign-up to taking part" hint="Of everyone who signed up, how many got this far." wide>
          <ol className="an-funnel">
            {data.funnel.map((s) => (
              <li key={s.label}>
                <span className="an-funnel-fill" style={{ width: `${s.percent ?? 0}%` }} />
                <span>{s.label}</span>
                <b>{n(s.count)}<small> · {s.percent ?? 0}%</small></b>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="What people have made" wide>
          <table className="an-table">
            <thead><tr><th>Kind</th><th>All time</th><th>Last 30 days</th></tr></thead>
            <tbody>{data.content.map((c) => <tr key={c.label}><td>{c.label}</td><td>{n(c.total)}</td><td>{n(c.month)}</td></tr>)}</tbody>
          </table>
        </Card>

        <Card title="Countries">
          <Rank rows={data.countries.map((c) => ({ ...c, label: countryName(c.label) || c.label }))} total={h.members} />
        </Card>
        <Card title="Top cities">
          <Rank rows={data.cities} total={h.members} />
        </Card>
        <Card title="How people signed up">
          <Rank rows={data.methods.filter((m) => m.count)} total={h.members} />
        </Card>
        <Card title="Kinds of profile">
          <Rank rows={data.profileTypes.map((p) => ({ ...p, label: p.label.replace(/^./, (c) => c.toUpperCase()) }))} total={h.members} />
        </Card>
        <Card title="Biggest communities" hint="By real members.">
          <Rank rows={data.topCommunities} />
        </Card>
        <Card title="Needs attention">
          <ul className="an-queue">
            <li><span>Ads waiting for review</span><b>{n(data.queue.adsPending)}</b></li>
            <li><span>ID checks waiting</span><b>{n(data.queue.idsPending)}</b></li>
            <li><span>Ads live</span><b>{n(data.queue.adsLive)}</b></li>
            <li><span>IDs approved</span><b>{n(data.queue.idsApproved)}</b></li>
            <li><span>Open Quick Jobs</span><b>{n(data.queue.jobsOpen)}</b></li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
