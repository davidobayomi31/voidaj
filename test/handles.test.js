// Usernames are unique (server/handles.js).
import { describe, expect, it } from 'vitest'
import { app, request, signUp } from './helpers.js'
import { uniqueHandle } from '../server/handles.js'
import q from '../server/db.js'

const tag = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, 'x')

describe('usernames', () => {
  it('gives people with the same name different usernames', async () => {
    const first = `Grace${tag()}`
    const a = await signUp(`${first} Ojion`)
    const b = await signUp(`${first} Ojion`)
    const c = await signUp(`${first} Ojion`)
    const handles = [a, b, c].map((x) => x.user.handle)
    expect(new Set(handles.map((h) => h.toLowerCase())).size).toBe(3)
    expect(handles[0]).toBe(`@${first.toLowerCase().slice(0, 20)}`)
    expect(handles[1]).toMatch(/_ojion$/)
    expect(handles[2]).toMatch(/_ojion2$/)
  })

  it('keeps them inside 3 to 20 letters, numbers and underscores', async () => {
    expect(await uniqueHandle('Zoë Ñandú-Mbeki')).toMatch(/^@[a-z0-9_]{3,20}$/)
    expect(await uniqueHandle('X')).toMatch(/^@[a-z0-9_]{3,20}$/)
    expect(await uniqueHandle('   ')).toMatch(/^@[a-z0-9_]{3,20}$/)
    expect(await uniqueHandle('Aleksandrovich-Wolfeschlegelstein Jr')).toMatch(/^@[a-z0-9_]{3,20}$/)
  })

  it('checks whether a username is free, in any capitals', async () => {
    const me = await signUp(`Check${tag()} Person`)
    const h = me.user.handle.slice(1)
    expect((await request(app).get(`/api/handle-check?h=${h.toUpperCase()}`)).body.available).toBe(false)
    expect((await me.agent.get(`/api/handle-check?h=${h}`)).body.available).toBe(true) // yours
    expect((await request(app).get(`/api/handle-check?h=free_${tag()}_name`)).body.available).toBe(true)
    expect((await request(app).get('/api/handle-check?h=no')).body).toMatchObject({ available: false })
    expect((await request(app).get('/api/handle-check?h=has space')).body.available).toBe(false)
  })

  it('refuses a taken username when changing it, whatever the capitals', async () => {
    const a = await signUp(`Taken${tag()} One`)
    const b = await signUp(`Taken${tag()} Two`)
    const res = await b.agent.patch('/api/auth/me').send({ handle: a.user.handle.toUpperCase() })
    expect(res.status).toBe(409)
    expect((await b.agent.patch('/api/auth/me').send({ handle: `fresh_${tag()}` })).status).toBe(200)
  })

  it('is enforced by the database too', async () => {
    const a = await signUp(`Db${tag()} Check`)
    const b = await signUp(`Db${tag()} Other`)
    await expect(q.run('UPDATE users SET handle = ? WHERE id = ?', a.user.handle.toUpperCase(), b.user.id)).rejects.toMatchObject({ code: '23505' })
  })
})

describe('city names', () => {
  it('tidies the capitals a member types', async () => {
    const me = await signUp(`City${tag()} Person`)
    const set = async (city) => (await me.agent.patch('/api/auth/me').send({ city })).body.user.city
    expect(await set('toronto')).toBe('Toronto')
    expect(await set('NEW YORK')).toBe('New York')
    expect(await set('  port   harcourt ')).toBe('Port Harcourt')
    expect(await set('São Paulo')).toBe('São Paulo')
    expect(await set("O'Fallon")).toBe("O'Fallon")
  })
})
