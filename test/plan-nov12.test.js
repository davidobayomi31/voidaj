// PLAN-NOTES-AND-GLOBAL.md: security, outside Nigeria, the organisers'
// side of events, and Jobs & Services from hiring to reviews.
import { afterEach, describe, expect, it } from 'vitest'
import { app, request, signUp } from './helpers.js'
import q from '../server/db.js'
import { normalisePhone, featureOn } from '../server/countries.js'

const unique = () => Math.random().toString(36).slice(2, 10)

describe('security', () => {
  afterEach(() => { process.env.RATE_LIMITS = 'off'; delete process.env.REQUIRE_EMAIL_CONFIRM })

  it('stops password guessing after 10 wrong tries', async () => {
    const { email } = await signUp('Guess Target')
    process.env.RATE_LIMITS = 'on'
    await q.run("DELETE FROM rate_hits WHERE key LIKE 'login:%'")
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' })
      expect(res.status).toBe(401)
    }
    const blocked = await request(app).post('/api/auth/login').send({ email, password: 'correct-horse-battery' })
    expect(blocked.status).toBe(429)
    await q.run("DELETE FROM rate_hits WHERE key LIKE 'login:%'")
  })

  it('limits sign-ups from one address and turns bots away', async () => {
    const bot = await request(app).post('/api/auth/register')
      .send({ name: 'Bot', email: `bot-${unique()}@example.com`, password: 'password1', birthDate: '2000-01-01', website: 'http://spam.example' })
    expect(bot.status).toBe(400)
    process.env.RATE_LIMITS = 'on'
    await q.run("DELETE FROM rate_hits WHERE key LIKE 'register:%'")
    const statuses = []
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/auth/register')
        .send({ name: 'Many', email: `many-${unique()}@example.com`, password: 'password1', birthDate: '2000-01-01' })
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true)
    expect(statuses[5]).toBe(429)
    await q.run("DELETE FROM rate_hits WHERE key LIKE 'register:%'")
  })

  it('asks new accounts to confirm their email before posting jobs', async () => {
    process.env.REQUIRE_EMAIL_CONFIRM = '1'
    const { agent, user } = await signUp('Unconfirmed')
    expect(user.emailConfirmed).toBe(false)
    const blocked = await agent.post('/api/jobs').send({ title: 'Paint a wall', category: 'painting' })
    expect(blocked.status).toBe(403)
    const wrong = await agent.post('/api/auth/confirm-email').send({ code: '000000' })
    // A fresh code we know, the way the email would carry it.
    const crypto = await import('crypto')
    await q.run('UPDATE users SET email_code = ?, email_code_expires = ? WHERE id = ?',
      crypto.createHash('sha256').update('123456').digest('hex'), Date.now() + 60_000, user.id)
    if (wrong.status === 200) throw new Error('a wrong code was accepted')
    const ok = await agent.post('/api/auth/confirm-email').send({ code: '123 456' })
    expect(ok.status).toBe(200)
    expect(ok.body.user.emailConfirmed).toBe(true)
    expect((await agent.post('/api/jobs').send({ title: 'Paint a wall', category: 'painting' })).status).toBe(200)
  })

  it('blocking stops messages and hides posts', async () => {
    const a = await signUp('Blocker')
    const b = await signUp('Blocked Person')
    const post = await b.agent.post('/api/posts').send({ audience: 'public', body: `hello from b ${unique()}` })
    expect(post.status).toBe(200)
    const block = await a.agent.post(`/api/users/${b.user.id}/block`)
    expect(block.body.blocked).toBe(true)
    expect((await b.agent.post(`/api/messages/${a.user.id}`).send({ body: 'hi' })).status).toBe(403)
    expect((await a.agent.post(`/api/messages/${b.user.id}`).send({ body: 'hi' })).status).toBe(403)
    const feed = await a.agent.get('/api/feed')
    expect(feed.body.posts.some((p) => p.id === post.body.post.id)).toBe(false)
    expect((await a.agent.get('/api/me/blocks')).body.people.map((p) => p.id)).toContain(b.user.id)
    expect((await a.agent.get(`/api/users/${b.user.id}`)).body.user.blockedByMe).toBe(true)
    const unblock = await a.agent.post(`/api/users/${b.user.id}/block`)
    expect(unblock.body.blocked).toBe(false)
  })

  it('stops the same post going up twice in a row', async () => {
    process.env.RATE_LIMITS = 'on'
    const { agent } = await signUp('Repeater')
    const body = `the very same words ${unique()}`
    expect((await agent.post('/api/posts').send({ audience: 'public', body })).status).toBe(200)
    expect((await agent.post('/api/posts').send({ audience: 'public', body })).status).toBe(429)
  })
})

describe('outside Nigeria', () => {
  it('keeps phone numbers in the international format', () => {
    expect(normalisePhone('0801 234 5678', 'NG')).toBe('+2348012345678')
    expect(normalisePhone('07700 900123', 'GB')).toBe('+447700900123')
    expect(normalisePhone('+1 (415) 555-0100', 'NG')).toBe('+14155550100')
    expect(normalisePhone('0044 7700 900123', 'NG')).toBe('+447700900123')
    expect(normalisePhone('12', 'NG')).toBe(null)
    expect(normalisePhone('call me', 'NG')).toBe(null)
    expect(normalisePhone('', 'NG')).toBe('')
  })

  it('stores a country at sign-up and in settings, with features by country', async () => {
    const agent = request.agent(app)
    const res = await agent.post('/api/auth/register')
      .send({ name: 'Kofi', email: `kofi-${unique()}@example.com`, password: 'password1', birthDate: '1999-05-05', country: 'GH' })
    expect(res.body.user.country).toBe('GH')
    expect(res.body.user.features.idVerification).toBe(false)
    expect((await agent.post('/api/auth/verify-id').send({ idNumber: '12345678' })).status).toBe(403)
    const saved = await agent.patch('/api/auth/me').send({ country: 'GB', phone: '07700 900123' })
    expect(saved.body.user.country).toBe('GB')
    expect(saved.body.user.phone).toBe('+447700900123')
    expect((await agent.patch('/api/auth/me').send({ country: 'XX' })).status).toBe(400)
    expect(featureOn('paidAds', 'NG')).toBe(true)
    expect(featureOn('paidAds', 'GB')).toBe(false)
  })

  it('gives jobs a currency and events a time zone', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/register')
      .send({ name: 'Wanjiru', email: `wanjiru-${unique()}@example.com`, password: 'password1', birthDate: '1995-01-01', country: 'KE' })
    const job = await agent.post('/api/jobs').send({ title: 'Fix a sink', category: 'plumbing', budget: '2,000' })
    expect(job.body.job.currency).toBe('KES')
    expect(job.body.job.country).toBe('KE')
    const usd = await agent.post('/api/jobs').send({ title: 'Design a logo', category: 'other', budget: '50', currency: 'usd' })
    expect(usd.body.job.currency).toBe('USD')
    const ev = await agent.post('/api/events').send({ title: 'Nairobi meetup', date: '2027-03-01', time: '6:00 PM', timezone: 'Africa/Nairobi' })
    expect(ev.body.event.timezone).toBe('Africa/Nairobi')
    expect(ev.body.event.country).toBe('KE')
    const fallback = await agent.post('/api/events').send({ title: 'Another meetup', date: '2027-03-02', timezone: 'Not/AZone' })
    expect(fallback.body.event.timezone).toBe('Africa/Nairobi')
  })
})

describe('events: the organisers’ side', () => {
  it('co-hosts, announcements, invite-only requests and the Event Circle', async () => {
    const host = await signUp('Host')
    const cohost = await signUp('Cohost')
    const guest = await signUp('Guest')
    const outsider = await signUp('Outsider')
    const { body } = await host.agent.post('/api/events').send({ title: 'Private dinner', date: '2027-01-10', time: '7pm', inviteOnly: true, capacity: 1 })
    const id = body.event.id
    expect(body.event.inviteOnly).toBe(true)

    expect((await outsider.agent.get(`/api/events/${id}/manage`)).status).toBe(403)
    const handle = (await cohost.agent.get('/api/auth/me')).body.user.handle
    // Handles aren't unique for new accounts; give the co-host one of their own.
    const h = `cohost${unique()}`
    await cohost.agent.patch('/api/auth/me').send({ handle: h })
    expect(handle).toBeTruthy()
    expect((await host.agent.post(`/api/events/${id}/hosts`).send({ handle: h, role: 'cohost' })).status).toBe(200)
    const manage = await cohost.agent.get(`/api/events/${id}/manage`)
    expect(manage.status).toBe(200)
    expect(manage.body.role).toBe('cohost')

    // Invite-only: Going becomes a request.
    const ask = await guest.agent.post(`/api/events/${id}/rsvp`).send({ status: 'going' })
    expect(ask.body.status).toBe('requested')
    expect((await guest.agent.get(`/api/events/${id}/circle`)).status).toBe(403)
    const approve = await cohost.agent.post(`/api/events/${id}/requests/${guest.user.id}`).send({ decision: 'approve' })
    expect(approve.body.status).toBe('going')

    // Announcements reach people going, not outsiders.
    await cohost.agent.post(`/api/events/${id}/announcements`).send({ body: 'Doors open at 6:30.' })
    expect((await guest.agent.get(`/api/events/${id}/announcements`)).body.announcements[0].body).toBe('Doors open at 6:30.')
    expect((await outsider.agent.get(`/api/events/${id}/announcements`)).body.canSee).toBe(false)

    // The circle is a group chat for people going, hidden from everyone else.
    const circle = await guest.agent.get(`/api/events/${id}/circle`)
    expect(circle.status).toBe(200)
    expect((await guest.agent.get(`/api/chats/${circle.body.chatId}/messages`)).status).toBe(200)
    expect((await outsider.agent.get('/api/chats')).body.chats.some((c) => c.id === circle.body.chatId)).toBe(false)
    expect((await outsider.agent.post(`/api/chats/${circle.body.chatId}/join`)).status).toBe(403)

    // Editing: more places moves the waitlist up.
    const stats = (await host.agent.get(`/api/events/${id}/manage`)).body.stats
    expect(stats.going).toBe(1)
    const edited = await host.agent.patch(`/api/events/${id}`).send({ title: 'Private dinner (moved)', capacity: 5 })
    expect(edited.body.event.title).toBe('Private dinner (moved)')
    expect((await guest.agent.patch(`/api/events/${id}`).send({ title: 'Mine now' })).status).toBe(403)

    // Removing someone takes them off the list and out of the circle.
    expect((await host.agent.delete(`/api/events/${id}/attendees/${guest.user.id}`)).status).toBe(200)
    expect((await guest.agent.get(`/api/chats/${circle.body.chatId}/messages`)).status).toBe(403)
    const hosting = await cohost.agent.get('/api/me/hosting')
    expect(hosting.body.events.map((e) => e.id)).toContain(id)
  })
})

describe('jobs: from hiring to reviews', () => {
  it('shortlist, hire, agreement, complete, review both ways', async () => {
    const poster = await signUp('Poster')
    const worker = await signUp('Worker')
    const other = await signUp('Other Applicant')
    const { body } = await poster.agent.post('/api/jobs').send({ title: 'Tile a bathroom', category: 'painting', budget: '40,000' })
    const id = body.job.id
    await worker.agent.post(`/api/jobs/${id}/offer`).send({ offer: '₦35,000', note: 'Can start Monday' })
    await other.agent.post(`/api/jobs/${id}/interest`)

    expect((await worker.agent.post(`/api/jobs/${id}/applicants/${other.user.id}`).send({ action: 'hire' })).status).toBe(403)
    const short = await poster.agent.post(`/api/jobs/${id}/applicants/${worker.user.id}`).send({ action: 'shortlist' })
    expect(short.body.applicants.find((a) => a.user.id === worker.user.id).status).toBe('shortlisted')
    const hired = await poster.agent.post(`/api/jobs/${id}/applicants/${worker.user.id}`).send({ action: 'hire', terms: 'Tiles provided.' })
    expect(hired.body.job.status).toBe('selected')
    expect(hired.body.agreement.price).toBe('₦35,000')
    expect(hired.body.applicants.find((a) => a.user.id === other.user.id).status).toBe('declined')
    // Gone from the open list, still openable on its own.
    expect((await request(app).get('/api/jobs')).body.jobs.some((j) => j.id === id)).toBe(false)
    expect((await request(app).get(`/api/jobs/${id}`)).body.job.status).toBe('selected')

    const accepted = await worker.agent.post(`/api/jobs/${id}/agreement`).send({ accept: true })
    expect(accepted.body.job.status).toBe('in_progress')
    expect(accepted.body.role).toBe('worker')
    expect((await poster.agent.post(`/api/jobs/${id}/review`).send({ rating: 5 })).status).toBe(400)
    expect((await worker.agent.post(`/api/jobs/${id}/stage`).send({ to: 'completed' })).body.job.status).toBe('completed')
    await poster.agent.post(`/api/jobs/${id}/review`).send({ rating: 5, body: 'Neat work, on time.' })
    await worker.agent.post(`/api/jobs/${id}/review`).send({ rating: 4, body: 'Paid promptly.' })
    expect((await other.agent.post(`/api/jobs/${id}/review`).send({ rating: 1 })).status).toBe(403)
    const reviews = await request(app).get(`/api/users/${worker.user.id}/reviews`)
    expect(reviews.body.count).toBe(1)
    expect(reviews.body.average).toBe(5)
    expect(reviews.body.reviews[0].body).toBe('Neat work, on time.')
    const flow = await worker.agent.get(`/api/jobs/${id}`)
    expect(flow.body.myReview.rating).toBe(4)
    expect(flow.body.theirReview.rating).toBe(5)
  })

  it('turning down an agreement reopens the job; disputes and pausing', async () => {
    const poster = await signUp('Poster Two')
    const worker = await signUp('Worker Two')
    const { body } = await poster.agent.post('/api/jobs').send({ title: 'Move a fridge', category: 'moving', budget: '5,000' })
    const id = body.job.id
    await worker.agent.post(`/api/jobs/${id}/interest`)
    await poster.agent.post(`/api/jobs/${id}/applicants/${worker.user.id}`).send({ action: 'hire' })
    const no = await worker.agent.post(`/api/jobs/${id}/agreement`).send({ accept: false })
    expect(no.body.job.status).toBe('open')

    // Their application is still there (marked withdrawn), so they can be asked again.
    await poster.agent.post(`/api/jobs/${id}/applicants/${worker.user.id}`).send({ action: 'hire' })
    await worker.agent.post(`/api/jobs/${id}/agreement`).send({ accept: true })
    expect((await worker.agent.post(`/api/jobs/${id}/dispute`).send({ reason: 'x' })).status).toBe(400)
    const disputed = await worker.agent.post(`/api/jobs/${id}/dispute`).send({ reason: 'The fridge was not ready to move.' })
    expect(disputed.body.job.status).toBe('disputed')
    expect(disputed.body.dispute.byMe).toBe(true)

    const service = await poster.agent.post('/api/jobs').send({ title: 'Weekend tutoring', category: 'tutoring', kind: 'service' })
    const sid = service.body.job.id
    expect((await poster.agent.post(`/api/jobs/${sid}/stage`).send({ to: 'paused' })).body.job.status).toBe('paused')
    expect((await request(app).get('/api/jobs')).body.jobs.some((j) => j.id === sid)).toBe(false)
    expect((await worker.agent.post(`/api/jobs/${sid}/stage`).send({ to: 'open' })).status).toBe(400)
    expect((await poster.agent.post(`/api/jobs/${sid}/stage`).send({ to: 'open' })).body.job.status).toBe('open')
  })
})
