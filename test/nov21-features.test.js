import { describe, it, expect, afterEach } from 'vitest'
import { app, request, signUp, createCommunity, createPost } from './helpers.js'
import q from '../server/db.js'
import { cleanGender } from '../server/index.js'

describe('gender (Nov 21)', () => {
  it('is optional, saved on the profile and hidden until the owner shows it', async () => {
    const { agent, user } = await signUp('Gender Check')
    expect(user.gender).toBe('')
    const res = await agent.patch('/api/auth/me').send({ gender: 'woman' })
    expect(res.status).toBe(200)
    expect(res.body.user.gender).toBe('woman')
    // Not public yet.
    const other = await signUp('Someone Else')
    expect((await other.agent.get(`/api/users/${user.id}`)).body.user.gender || '').toBe('')
    await agent.patch('/api/auth/me').send({ genderPublic: true })
    expect((await other.agent.get(`/api/users/${user.id}`)).body.user.gender).toBe('woman')
  })
  it('accepts a person’s own words but not junk', () => {
    expect(cleanGender('Genderqueer')).toBe('Genderqueer')
    expect(cleanGender('')).toBe('')
    expect(cleanGender('<script>')).toBeNull()
    expect(cleanGender('x'.repeat(40))).toBeNull()
  })
})

describe('post actions (Nov 22)', () => {
  it('lets an author delete their post, and only the author', async () => {
    const a = await signUp('Author One')
    const b = await signUp('Reader Two')
    const c = await createCommunity(a.agent)
    const post = await createPost(a.agent, c.id)
    expect((await b.agent.delete(`/api/posts/${post.id}`)).status).toBe(403)
    expect((await a.agent.delete(`/api/posts/${post.id}`)).status).toBe(200)
    expect((await b.agent.get(`/api/posts/${post.id}`)).status).toBe(404)
  })
  it('hides a post for one person only, and undoes it', async () => {
    const a = await signUp('Author Three')
    const b = await signUp('Reader Four')
    const c = await createCommunity(a.agent)
    await b.agent.post(`/api/communities/${c.id}/join`)
    const post = await createPost(a.agent, c.id)
    expect((await a.agent.post(`/api/posts/${post.id}/hide`)).status).toBe(400)
    expect((await b.agent.post(`/api/posts/${post.id}/hide`)).status).toBe(200)
    const mine = (await b.agent.get(`/api/posts?community=${c.id}`)).body.posts.map((p) => p.id)
    const theirs = (await a.agent.get(`/api/posts?community=${c.id}`)).body.posts.map((p) => p.id)
    expect(mine).not.toContain(post.id)
    expect(theirs).toContain(post.id)
    await b.agent.delete(`/api/posts/${post.id}/hide`)
    expect((await b.agent.get(`/api/posts?community=${c.id}`)).body.posts.map((p) => p.id)).toContain(post.id)
  })
  it('lets an author delete their own comment only', async () => {
    const a = await signUp('Author Five')
    const b = await signUp('Reader Six')
    const c = await createCommunity(a.agent)
    await b.agent.post(`/api/communities/${c.id}/join`)
    const post = await createPost(a.agent, c.id)
    const res = await b.agent.post(`/api/posts/${post.id}/comments`).send({ body: 'My take' })
    const id = (await q.get('SELECT id FROM comments WHERE post_id = ? ORDER BY created_at DESC LIMIT 1', post.id)).id
    expect(res.status).toBe(200)
    expect((await a.agent.delete(`/api/comments/${id}`)).status).toBe(403)
    expect((await b.agent.delete(`/api/comments/${id}`)).status).toBe(200)
  })
})

describe('how long a community or event stays up (Nov 21)', () => {
  it('takes a community down from the lists once its time is up', async () => {
    const a = await signUp('Keeper One')
    const res = await a.agent.post('/api/communities').send({ name: `Short Lived ${Date.now()}`, tags: ['x'], keepFor: '1w' })
    expect(res.status).toBe(200)
    expect(res.body.community.expiresAt).toBeGreaterThan(Date.now())
    expect(res.body.community.ended).toBe(false)
    const id = res.body.community.id
    expect((await request(app).get('/api/communities')).body.communities.map((c) => c.id)).toContain(id)
    await q.run('UPDATE communities SET expires_at = ? WHERE id = ?', Date.now() - 1000, id)
    expect((await request(app).get('/api/communities')).body.communities.map((c) => c.id)).not.toContain(id)
    expect((await request(app).get(`/api/communities/${id}`)).body.community.ended).toBe(true)
  })
  it('keeps a community with no choice up for good', async () => {
    const a = await signUp('Keeper Two')
    const c = await createCommunity(a.agent)
    expect(c.expiresAt).toBeNull()
  })
})

describe('suggestions and people like you (Nov 21)', () => {
  it('matches people on shared interests and says why', async () => {
    const tag = `kite${Date.now() % 100000}`
    const a = await signUp('Match One')
    const b = await signUp('Match Two')
    const c = await signUp('No Match')
    await a.agent.patch('/api/auth/me').send({ interests: [tag, 'chess'] })
    await b.agent.patch('/api/auth/me').send({ interests: [tag] })
    await c.agent.patch('/api/auth/me').send({ interests: ['unrelated-thing'] })
    const res = await a.agent.get('/api/people/matches')
    expect(res.status).toBe(200)
    const ids = res.body.people.map((p) => p.id)
    expect(ids).toContain(b.user.id)
    expect(ids).not.toContain(c.user.id)
    expect(ids).not.toContain(a.user.id)
    expect(res.body.people.find((p) => p.id === b.user.id).why).toMatch(new RegExp(tag))
  })
  it('needs you signed in', async () => {
    expect((await request(app).get('/api/suggestions')).status).toBe(401)
  })
  it('suggests communities that match your interests', async () => {
    const tag = `loom${Date.now() % 100000}`
    const owner = await signUp('Owner Seven')
    await owner.agent.post('/api/communities').send({ name: `Fans ${tag}`, tags: [tag] })
    const me = await signUp('Joiner Eight')
    await me.agent.patch('/api/auth/me').send({ interests: [tag] })
    const res = await me.agent.get('/api/suggestions')
    expect(res.status).toBe(200)
    expect(res.body.communities.some((c) => c.why.includes(tag))).toBe(true)
  })
})

describe('code before account (Nov 21)', () => {
  afterEach(() => { delete process.env.SIGNUP_CODE_FIRST })
  it('makes no account until the emailed code is confirmed', async () => {
    process.env.SIGNUP_CODE_FIRST = '1'
    const email = `codefirst-${Date.now()}@example.com`
    const body = { name: 'Code First', email, password: 'correct-horse-battery', birthDate: '2000-01-01' }
    const first = await request(app).post('/api/auth/register').send(body)
    expect(first.status).toBe(200)
    expect(first.body.needsCode).toBe(true)
    expect(first.headers['set-cookie']).toBeUndefined()
    expect(await q.get('SELECT 1 FROM users WHERE email = ?', email)).toBeFalsy()
    const wrong = await request(app).post('/api/auth/register').send({ ...body, code: '000000' })
    expect(wrong.status).toBe(400)
    expect(await q.get('SELECT 1 FROM users WHERE email = ?', email)).toBeFalsy()
    const done = await request(app).post('/api/auth/register').send({ ...body, code: first.body.devCode })
    expect(done.status).toBe(200)
    expect(done.body.user.emailConfirmed).toBe(true)
    expect(await q.get('SELECT 1 FROM pending_signups WHERE email = ?', email)).toBeFalsy()
  })
  it('can send a new code', async () => {
    process.env.SIGNUP_CODE_FIRST = '1'
    const email = `resend-${Date.now()}@example.com`
    const body = { name: 'Resend Me', email, password: 'correct-horse-battery', birthDate: '2000-01-01' }
    const first = await request(app).post('/api/auth/register').send(body)
    const again = await request(app).post('/api/auth/register/resend').send({ email })
    expect(again.status).toBe(200)
    expect(again.body.devCode).not.toBe(first.body.devCode)
    expect((await request(app).post('/api/auth/register').send({ ...body, code: again.body.devCode })).status).toBe(200)
  })
})

describe('event funds (Nov 21)', () => {
  it('is for the host only, and needs payments and a bank account', async () => {
    const host = await signUp('Event Host')
    const guest = await signUp('Event Guest')
    const ev = (await host.agent.post('/api/events').send({ title: 'Block Party', date: '2099-01-01', category: 'music', audience: 'public' })).body.event
    expect(ev?.id).toBeTruthy()
    const view = await guest.agent.get(`/api/events/${ev.id}/funds`)
    expect(view.status).toBe(200)
    expect(view.body.open).toBe(false)
    expect(view.body.paymentsOn).toBe(false)
    // Payments aren't switched on in tests, so the host can't turn it on yet.
    expect((await host.agent.put(`/api/events/${ev.id}/funds`).send({ open: true })).status).toBe(503)
    expect((await guest.agent.post(`/api/events/${ev.id}/funds/checkout`).send({ amount: '₦5,000' })).status).toBe(503)
  })
})
