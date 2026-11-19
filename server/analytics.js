// Analytics for the Admin page: how VOIDAJ is growing and whether people
// use it. Everything is worked out from the tables we already have, counting
// real accounts only (sample accounts and deleted accounts are left out).
// Days are UTC days, so numbers don't shift with whoever is looking.

const DAY = 24 * 3600 * 1000
const DAYS = 30

const day = (ts) => new Date(ts).toISOString().slice(0, 10)
const num = (v) => Number(v) || 0
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)

// A list of { date, count } for the last `days` days, oldest first, with zero
// for days where nothing happened.
function series(timestamps, now, days = DAYS) {
  const counts = new Map()
  for (const t of timestamps) {
    const d = day(num(t))
    counts.set(d, (counts.get(d) || 0) + 1)
  }
  return Array.from({ length: days }, (_, i) => {
    const date = day(now - (days - 1 - i) * DAY)
    return { date, count: counts.get(date) || 0 }
  })
}

// Distinct people per day (for "who came back").
function distinctSeries(rows, now, days = DAYS) {
  const byDay = new Map()
  for (const r of rows) {
    const d = day(num(r.at))
    if (!byDay.has(d)) byDay.set(d, new Set())
    byDay.get(d).add(r.user_id)
  }
  return Array.from({ length: days }, (_, i) => {
    const date = day(now - (days - 1 - i) * DAY)
    return { date, count: byDay.get(date)?.size || 0 }
  })
}

const top = (map, n = 8) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n)
  .map(([label, count]) => ({ label, count }))

export async function buildAnalytics(q, now = Date.now()) {
  const REAL = 'COALESCE(u.is_seed, 0) = 0 AND u.deleted_at IS NULL'
  const since = now - (DAYS + 1) * DAY

  const users = await q.all(`SELECT u.id, u.created_at, u.last_seen_at, u.onboarded, u.id_verified, u.email_confirmed_at,
      u.google_sub, u.apple_sub, u.referred_by, u.country, u.city, u.profile_type
    FROM users u WHERE ${REAL}`)
  const ids = new Set(users.map((u) => u.id))

  const memberships = (await q.all('SELECT user_id, community_id FROM memberships')).filter((m) => ids.has(m.user_id))
  const posts = await q.all(`SELECT p.created_at, p.author_id FROM posts p JOIN users u ON u.id = p.author_id WHERE ${REAL}`)
  const comments = await q.all(`SELECT c.created_at, c.author_id FROM comments c JOIN users u ON u.id = c.author_id WHERE ${REAL}`).catch(() => [])
  const messages = await q.all(`SELECT m.created_at, m.sender_id FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE ${REAL}`)
  const jobs = await q.all(`SELECT j.created_at, j.status FROM jobs j JOIN users u ON u.id = j.poster_id WHERE ${REAL}`)
  const events = await q.all(`SELECT e.created_at FROM events e JOIN users u ON u.id = e.creator_id WHERE ${REAL}`)
  const businesses = await q.all(`SELECT b.created_at FROM businesses b JOIN users u ON u.id = b.owner_id WHERE ${REAL}`)
  const logins = (await q.all('SELECT user_id, at FROM login_events WHERE at > ?', since)).filter((l) => ids.has(l.user_id))
  const communities = await q.all('SELECT id, name FROM communities')
  const adRows = await q.all(`SELECT status, active FROM ads WHERE COALESCE(status, 'live') <> 'sample'`).catch(() => [])
  const idChecks = await q.all('SELECT status FROM id_checks')

  // ── Headline numbers ──
  const joined = (days) => users.filter((u) => u.created_at && now - num(u.created_at) < days * DAY).length
  const seen = (days) => users.filter((u) => u.last_seen_at && now - num(u.last_seen_at) < days * DAY).length
  const older = users.filter((u) => u.created_at && now - num(u.created_at) >= 7 * DAY)
  const headline = {
    members: users.length,
    joinedToday: joined(1), joinedWeek: joined(7), joinedMonth: joined(30),
    // Compared with the week before, so the page can say "up" or "down".
    joinedPrevWeek: users.filter((u) => u.created_at && now - num(u.created_at) >= 7 * DAY && now - num(u.created_at) < 14 * DAY).length,
    activeToday: seen(1), activeWeek: seen(7), activeMonth: seen(30),
    // Of members who joined over a week ago, how many were seen in the last week.
    returningRate: pct(older.filter((u) => u.last_seen_at && now - num(u.last_seen_at) < 7 * DAY).length, older.length),
    verified: users.filter((u) => u.id_verified).length,
    referred: users.filter((u) => u.referred_by).length,
  }

  // ── Growth: new members per day, and the running total ──
  const signups = series(users.map((u) => u.created_at).filter(Boolean), now)
  const before = users.filter((u) => u.created_at && num(u.created_at) < now - (DAYS - 1) * DAY - (now % DAY)).length
  let running = before
  const total = signups.map((s) => ({ date: s.date, count: (running += s.count) }))

  // ── The path from signing up to taking part ──
  const posters = new Set([...posts, ...comments].map((r) => r.author_id))
  const chatters = new Set(messages.map((m) => m.sender_id))
  const joiners = new Set(memberships.map((m) => m.user_id))
  const confirmed = users.filter((u) => u.email_confirmed_at || u.google_sub || u.apple_sub)
  const funnel = [
    { label: 'Signed up', count: users.length },
    { label: 'Confirmed their account', count: confirmed.length },
    { label: 'Finished onboarding', count: users.filter((u) => u.onboarded).length },
    { label: 'Joined a community', count: users.filter((u) => joiners.has(u.id)).length },
    { label: 'Posted or commented', count: users.filter((u) => posters.has(u.id)).length },
    { label: 'Sent a message', count: users.filter((u) => chatters.has(u.id)).length },
  ].map((s) => ({ ...s, percent: pct(s.count, users.length) }))

  // ── Where people are, and how they signed up ──
  const countries = new Map(), cities = new Map()
  for (const u of users) {
    countries.set(u.country || 'NG', (countries.get(u.country || 'NG') || 0) + 1)
    if (u.city) cities.set(u.city, (cities.get(u.city) || 0) + 1)
  }
  const methods = [
    { label: 'Google', count: users.filter((u) => u.google_sub).length },
    { label: 'Apple', count: users.filter((u) => u.apple_sub).length },
    { label: 'Email', count: users.filter((u) => !u.google_sub && !u.apple_sub).length },
  ]
  const types = new Map()
  for (const u of users) types.set(u.profile_type || 'individual', (types.get(u.profile_type || 'individual') || 0) + 1)

  // ── What people are making ──
  const within = (rows) => rows.filter((r) => num(r.created_at) > now - DAYS * DAY).length
  const content = [
    { label: 'Posts', total: posts.length, month: within(posts) },
    { label: 'Comments', total: comments.length, month: within(comments) },
    { label: 'Chat messages', total: messages.length, month: within(messages) },
    { label: 'Quick Jobs and Services', total: jobs.length, month: within(jobs) },
    { label: 'Events', total: events.length, month: within(events) },
    { label: 'Businesses', total: businesses.length, month: within(businesses) },
  ]
  const activity = series([...posts, ...comments, ...messages, ...jobs, ...events].map((r) => r.created_at).filter(Boolean), now)

  // ── Communities people actually joined ──
  const perCommunity = new Map()
  for (const m of memberships) perCommunity.set(m.community_id, (perCommunity.get(m.community_id) || 0) + 1)
  const names = new Map(communities.map((c) => [c.id, c.name]))
  const topCommunities = [...perCommunity.entries()].map(([id, count]) => [names.get(id) || id, count])

  return {
    generatedAt: now,
    headline,
    signups, total,
    activeDaily: distinctSeries(logins, now),
    activity,
    funnel,
    countries: top(countries),
    cities: top(cities),
    methods,
    profileTypes: top(types),
    content,
    topCommunities: top(new Map(topCommunities)),
    queue: {
      adsPending: adRows.filter((a) => a.status === 'pending').length,
      adsLive: adRows.filter((a) => a.status === 'live' && a.active).length,
      idsPending: idChecks.filter((c) => c.status === 'pending').length,
      idsApproved: idChecks.filter((c) => c.status === 'approved').length,
      jobsOpen: jobs.filter((j) => j.status === 'open').length,
    },
  }
}
