// Suggestions: "People like you" and what to join, go to or do next.
// Nuel, Nov 21: "a section where users can see users in the existing
// platform that match their preferences" and "be able to see suggestions".
// Everything has a plain reason under it, taken from what the member shared.
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import * as api from '../api.js'
import { useApp } from '../state.jsx'
import { Icon } from '../components/Icons.jsx'
import { CommunityCard, PersonCard, EventCard, SectionHead } from '../components/bits.jsx'
import { JobCard } from './Jobs.jsx'

export default function Suggestions() {
  const { user, loading } = useApp()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { if (user) api.suggestions().then(setData).catch((e) => setError(e.message)) }, [user?.id]) // eslint-disable-line

  if (loading) return <div className="page"><p className="meta-dim">Loading…</p></div>
  if (!user) return <Navigate to="/auth" replace />
  const empty = data && !data.people.length && !data.communities.length && !data.events.length && !data.jobs.length

  return (
    <div className="page suggest-page">
      <header className="page-head">
        <h1>For you</h1>
        <p className="meta-dim">People, communities, events and jobs that fit what you told us. Each one says why.</p>
      </header>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!data && !error && <p className="meta-dim">Finding people like you…</p>}
      {empty && (
        <div className="card suggest-empty">
          <Icon name="sparkle" size={22} />
          <p><b>Nothing to suggest yet.</b> Add a few interests (and the kind of work you do, if you offer skills) and this page fills up.</p>
          <Link to="/profile/me" className="btn primary small">Edit my profile</Link>
        </div>
      )}
      {data?.people.length > 0 && (
        <section>
          <SectionHead icon="users" title="People like you" sub="Members who share your interests, communities or city." />
          <div className="card-grid two">{data.people.map((p) => <PersonCard key={p.id} user={p} because={p.why} />)}</div>
        </section>
      )}
      {data?.communities.length > 0 && (
        <section>
          <SectionHead icon="community" title="Communities to join" />
          <div className="card-grid two">{data.communities.map((c) => <CommunityCard key={c.id} community={c} because={c.why} />)}</div>
        </section>
      )}
      {data?.events.length > 0 && (
        <section>
          <SectionHead icon="calendar" title="Events for you" />
          <div className="card-grid two">{data.events.map((e) => <EventCard key={e.id} event={e} because={e.why} />)}</div>
        </section>
      )}
      {data?.jobs.length > 0 && (
        <section>
          <SectionHead icon="briefcase" title="Jobs that match your work" />
          <div className="stack">{data.jobs.map((j) => <div key={j.id}><JobCard job={j} /><p className="suggest-why"><Icon name="zap" size={12} /> {j.why}</p></div>)}</div>
        </section>
      )}
    </div>
  )
}
