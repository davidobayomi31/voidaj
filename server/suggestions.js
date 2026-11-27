// ── People like you, and suggestions ─────────────────────────────────
// Nuel, Nov 21: "a section where users can see users in the existing
// platform that match their preferences", and "be able to see suggestions".
//
// Everything is scored from things a member has chosen to share: interests,
// communities, city (unless their location is hidden) and, for jobs, the
// kinds of work you said you do. Each suggestion carries a plain reason, so
// it never feels like a black box ("You both like music and photography").
import q, { publicUser, serializeCommunity, serializeEvent, serializeJob, parseJson } from './db.js'
import { requireAuth } from './auth.js'
import * as guard from './guard.js'

const norm = (v) => String(v ?? '').trim().toLowerCase()
const list = (v) => parseJson(v).map(norm).filter(Boolean)
const sentence = (items) => (items.length <= 1 ? items[0] || '' : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)
const shown = (words) => words.slice(0, 3)

export async function matchPeople(me, { limit = 24 } = {}) {
  const myInterests = new Set(list(me.interests))
  const myCommunities = new Set((await q.all('SELECT community_id FROM memberships WHERE user_id = ?', me.id)).map((r) => r.community_id))
  const myCity = norm(me.city)
  const [blocked, following, rows, memberships] = await Promise.all([
    guard.blockedIds(me.id),
    q.all('SELECT followee_id FROM follows WHERE follower_id = ?', me.id),
    q.all('SELECT * FROM users WHERE deleted_at IS NULL AND id <> ? ORDER BY last_seen_at DESC NULLS LAST LIMIT 600', me.id),
    q.all('SELECT user_id, community_id FROM memberships'),
  ])
  const skip = new Set([...blocked, ...following.map((r) => r.followee_id)])
  const byUser = new Map()
  for (const m of memberships) {
    if (!myCommunities.has(m.community_id)) continue
    byUser.set(m.user_id, (byUser.get(m.user_id) || 0) + 1)
  }
  const out = []
  for (const r of rows) {
    if (skip.has(r.id) || (await guard.eitherBlocked(me.id, r.id))) continue
    const sharedInterests = [...new Set(list(r.interests))].filter((x) => myInterests.has(x))
    const sharedCommunities = byUser.get(r.id) || 0
    const sameCity = !!myCity && r.privacy !== 'hidden' && norm(r.city) === myCity
    const score = sharedInterests.length * 3 + sharedCommunities * 2 + (sameCity ? 2 : 0)
    if (score <= 0) continue
    const why = []
    if (sharedInterests.length) why.push(`You both like ${sentence(shown(sharedInterests))}`)
    if (sharedCommunities) why.push(`${sharedCommunities} ${sharedCommunities === 1 ? 'community' : 'communities'} in common`)
    if (sameCity) why.push(`Also in ${r.city}`)
    out.push({ score, person: { ...publicUser(r), why: why.join(' · '), sharedInterests: shown(sharedInterests) } })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.person)
}

export function suggestionRoutes(app) {
  app.get('/api/people/matches', requireAuth, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 24, 60)
    res.json({ people: await matchPeople(req.userRow, { limit }) })
  })

  app.get('/api/suggestions', requireAuth, async (req, res) => {
    const me = req.userRow
    const now = Date.now()
    const myInterests = new Set(list(me.interests))
    const myCity = norm(me.city)
    const mySkills = list(me.job_skills)

    const [people, joined, comms, evs, jobs] = await Promise.all([
      matchPeople(me, { limit: 6 }),
      q.all('SELECT community_id FROM memberships WHERE user_id = ?', me.id),
      q.all('SELECT * FROM communities WHERE expires_at IS NULL OR expires_at > ?', now),
      q.all('SELECT * FROM events WHERE (expires_at IS NULL OR expires_at > ?) ORDER BY date LIMIT 200', now),
      q.all("SELECT * FROM jobs WHERE status = 'open' AND poster_id <> ? ORDER BY created_at DESC LIMIT 200", me.id),
    ])
    const inCommunity = new Set(joined.map((r) => r.community_id))
    const today = new Date().toISOString().slice(0, 10)

    const communities = comms.filter((c) => !inCommunity.has(c.id)).map((c) => {
      const shared = list(c.tags).filter((t) => myInterests.has(t))
      const sameCity = !!myCity && norm(c.city) === myCity
      const why = [shared.length ? `Matches ${sentence(shown(shared))}` : '', sameCity ? `In ${c.city}` : ''].filter(Boolean).join(' · ')
      return { row: c, score: shared.length * 3 + (sameCity ? 2 : 0), why }
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6)

    const events = evs.filter((e) => e.date >= today && e.creator_id !== me.id).map((e) => {
      const sameCity = !!myCity && norm(e.city) === myCity
      const cat = norm(e.category)
      const likes = !!cat && [...myInterests].some((i) => i.includes(cat) || cat.includes(i))
      const why = [likes ? `Fits your interest in ${e.category}` : '', sameCity ? `In ${e.city}` : ''].filter(Boolean).join(' · ')
      return { row: e, score: (likes ? 3 : 0) + (sameCity ? 2 : 0), why }
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.row.date.localeCompare(b.row.date)).slice(0, 6)

    const jobMatches = jobs.map((j) => {
      const skill = mySkills.includes(norm(j.category))
      const sameCity = !!myCity && norm(j.city) === myCity
      const why = [skill ? 'Matches work you do' : '', sameCity ? `In ${j.city}` : ''].filter(Boolean).join(' · ')
      return { row: j, score: (skill ? 3 : 0) + (sameCity ? 1 : 0), why }
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6)

    res.json({
      people,
      communities: await Promise.all(communities.map(async (x) => ({ ...(await serializeCommunity(x.row, me.id)), why: x.why }))),
      events: events.map((x) => ({ ...serializeEvent(x.row), why: x.why })),
      jobs: await Promise.all(jobMatches.map(async (x) => ({ ...(await serializeJob(x.row, me.id)), why: x.why }))),
    })
  })
}
