import { describe, it, expect } from 'vitest'
import { app, request, signUp } from './helpers.js'

describe('auth', () => {
  it('registers a user and sets an httpOnly session cookie', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: 'Ada.Cookie@Example.com', password: 'analytical-engine', birthDate: '1990-12-10' })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada.cookie@example.com' })
    expect(res.body.user).not.toHaveProperty('password_hash')
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('is_token='))
    expect(cookie).toMatch(/HttpOnly/i)
  })

  it('never stores the plain-text password', async () => {
    const { user, password } = await signUp()
    const { q } = await import('../server/db.js')
    const row = await q.get('SELECT password_hash FROM users WHERE id = ?', user.id)
    expect(row.password_hash).not.toBe(password)
    expect(row.password_hash).toMatch(/^\$2[aby]\$/) // bcrypt
  })

  it('rejects a duplicate email regardless of letter case', async () => {
    const { email } = await signUp()
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Copy', email: email.toUpperCase(), password: 'another-password', birthDate: '1990-12-10' })
    expect(res.status).toBe(409)
  })

  it.each([
    [{ email: 'a@b.co', password: 'longenough' }, 'missing name'],
    [{ name: 'X', email: 'not-an-email', password: 'longenough' }, 'invalid email'],
    [{ name: 'X', email: 'short@pw.co', password: '123' }, 'short password'],
  ])('rejects bad sign-up input (%#: %s)', async (body) => {
    const res = await request(app).post('/api/auth/register').send(body)
    expect(res.status).toBe(400)
  })

  // Nuel, Nov 10: "Ask about age before anything", "Our limit is 16 for now".
  it('asks for a date of birth and turns away anyone under 16', async () => {
    const base = { name: 'Young', password: 'longenough' }
    const none = await request(app).post('/api/auth/register').send({ ...base, email: `none-${Date.now()}@ex.co` })
    expect(none.status).toBe(400)
    const year = new Date().getFullYear()
    const young = await request(app).post('/api/auth/register').send({ ...base, email: `young-${Date.now()}@ex.co`, birthDate: `${year - 15}-01-01` })
    expect(young.status).toBe(400)
    expect(young.body.error).toMatch(/16/)
    const ok = await request(app).post('/api/auth/register').send({ ...base, email: `ok-${Date.now()}@ex.co`, birthDate: `${year - 17}-01-01` })
    expect(ok.status).toBe(200)
    expect(ok.body.user.needsAge).toBe(false)
  })

  // Nuel, Nov 12: referring people raises your citizen level.
  it('credits the inviter when someone joins from their link', async () => {
    const { agent: inviter, user } = await signUp('Inviter')
    const before = (await inviter.get(`/api/users/${user.id}/journey`)).body
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Friend', email: `friend-${Date.now()}@ex.co`, password: 'longenough', birthDate: '1999-05-05', ref: user.id })
    expect(res.status).toBe(200)
    const mine = (await inviter.get('/api/me/referrals')).body
    expect(mine.count).toBe(1)
    const after = (await inviter.get(`/api/users/${user.id}/journey`)).body
    expect(after.points - before.points).toBe(15)
    expect(after.badges.map((b) => b.id)).toContain('recruiter')
  })

  it('logs in with the right password and returns the same error for wrong password or unknown email', async () => {
    const { email, password } = await signUp()
    const ok = await request(app).post('/api/auth/login').send({ email, password })
    expect(ok.status).toBe(200)

    const wrongPassword = await request(app).post('/api/auth/login').send({ email, password: 'nope-nope' })
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password })
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    // Same message, so the login form can't be used to discover who has an account.
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error)
  })

  it('blocks protected routes without a session and ignores a forged token', async () => {
    const anonymous = await request(app).post('/api/communities').send({ name: 'Nope' })
    expect(anonymous.status).toBe(401)

    const forged = await request(app).get('/api/auth/me').set('Cookie', 'is_token=eyJhbGciOiJIUzI1NiJ9.e30.forged')
    expect(forged.status).toBe(200)
    expect(forged.body.user).toBeNull()
  })

  it('"sign out other devices" invalidates sessions issued before it', async () => {
    const { agent, email, password } = await signUp()
    const otherDevice = request.agent(app)
    await otherDevice.post('/api/auth/login').send({ email, password })
    expect((await otherDevice.get('/api/auth/me')).body.user).not.toBeNull()

    const res = await agent.post('/api/auth/logout-others')
    expect(res.status).toBe(200)
    expect((await otherDevice.get('/api/auth/me')).body.user).toBeNull()
    expect((await agent.get('/api/auth/me')).body.user).not.toBeNull()
  })

  // Idea #4
  it('refuses a password change when the current password is wrong', async () => {
    const { agent } = await signUp()
    const res = await agent.post('/api/auth/password')
      .send({ current: 'not-my-password', next: 'brand-new-password' })
    expect(res.status).toBe(401)
  })

  // Idea #5
  it('changing the password signs out other devices but keeps this one', async () => {
    const { agent, email, password } = await signUp()
    const otherDevice = request.agent(app)
    await otherDevice.post('/api/auth/login').send({ email, password })
    expect((await otherDevice.get('/api/auth/me')).body.user).not.toBeNull()

    const res = await agent.post('/api/auth/password').send({ current: password, next: 'brand-new-password' })
    expect(res.status).toBe(200)
    expect((await otherDevice.get('/api/auth/me')).body.user).toBeNull()
    expect((await agent.get('/api/auth/me')).body.user).not.toBeNull()
  })

  // Idea #6
  it('after a password change, only the new password logs in', async () => {
    const { agent, email, password } = await signUp()
    await agent.post('/api/auth/password').send({ current: password, next: 'brand-new-password' })

    const oldLogin = await request(app).post('/api/auth/login').send({ email, password })
    const newLogin = await request(app).post('/api/auth/login').send({ email, password: 'brand-new-password' })
    expect(oldLogin.status).toBe(401)
    expect(newLogin.status).toBe(200)
  })

  it('logout clears the session', async () => {
    const { agent } = await signUp()
    await agent.post('/api/auth/logout')
    expect((await agent.get('/api/auth/me')).body.user).toBeNull()
  })
})
