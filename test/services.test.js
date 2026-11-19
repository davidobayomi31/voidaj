// Services: what people can do, with proof photos and availability (server/services.js).
import { describe, expect, it } from 'vitest'
import { app, request, signUp } from './helpers.js'

const img = (kb = 12) => `data:image/jpeg;base64,${Buffer.alloc(kb * 1024, 9).toString('base64')}`
const offer = (agent, extra = {}) => agent.post('/api/services').send({
  title: 'Home cleaning', category: 'cleaning', description: 'Deep cleans, I bring the supplies.',
  pricing: 'paid', price: '15,000', arrangement: 'local', area: 'Yaba', availability: 'Mon–Sat, 9:00 AM – 6:00 PM',
  photos: [img(), img()], ...extra,
})

describe('services', () => {
  it('publishes a service with proof photos and availability, and lists it', async () => {
    const { agent, user } = await signUp('Cleaner')
    const res = await offer(agent)
    expect(res.status).toBe(200)
    const s = res.body.service
    expect(s).toMatchObject({ title: 'Home cleaning', availability: 'Mon–Sat, 9:00 AM – 6:00 PM', pricing: 'paid', price: '15,000', isMine: true })
    expect(s.photos).toHaveLength(2)
    expect(s.provider.id).toBe(user.id)
    expect(s.record).toMatchObject({ reviews: 0, completed: 0 })

    const photo = await request(app).get(s.photos[0].url)
    expect(photo.status).toBe(200)
    expect(photo.headers['content-type']).toMatch(/image\/jpeg/)

    const list = (await request(app).get('/api/services?category=cleaning')).body.services
    expect(list.some((x) => x.id === s.id)).toBe(true)
    // It is still a Quick Jobs listing.
    expect((await request(app).get(`/api/jobs/${s.id}`)).status).toBe(200)
  })

  it('checks what is sent', async () => {
    const { agent } = await signUp()
    expect((await offer(agent, { title: 'x' })).status).toBe(400)
    expect((await offer(agent, { pricing: 'exchange', exchange: '' })).status).toBe(400)
    expect((await offer(agent, { photos: ['data:text/html;base64,PGI+'] })).status).toBe(400)
    expect((await request(app).post('/api/services').send({ title: 'Anything', category: 'cleaning' })).status).toBe(401)
  })

  it('lets only the owner edit, pause, reorder photos and delete', async () => {
    const owner = await signUp()
    const other = await signUp()
    const s = (await offer(owner.agent)).body.service
    expect((await other.agent.patch(`/api/services/${s.id}`).send({ title: 'Mine now' })).status).toBe(404)

    const edited = (await owner.agent.patch(`/api/services/${s.id}`).send({ title: 'Office cleaning', photos: [{ id: s.photos[1].id }, img()] })).body.service
    expect(edited.title).toBe('Office cleaning')
    expect(edited.photos).toHaveLength(2)
    expect(edited.photos[0].id).toBe(s.photos[1].id)

    await owner.agent.patch(`/api/services/${s.id}`).send({ paused: true })
    expect((await request(app).get('/api/services')).body.services.some((x) => x.id === s.id)).toBe(false)
    expect((await owner.agent.get('/api/services/mine')).body.services.find((x) => x.id === s.id).paused).toBe(true)
    expect((await other.agent.get(`/api/services/${s.id}`)).status).toBe(404)

    expect((await other.agent.delete(`/api/services/${s.id}`)).status).toBe(404)
    expect((await owner.agent.delete(`/api/services/${s.id}`)).status).toBe(200)
    expect((await owner.agent.get('/api/services/mine')).body.services.some((x) => x.id === s.id)).toBe(false)
  })
})

describe('notifications', () => {
  it('shows sparks, looms and connections, and no messages', async () => {
    const me = await signUp('Author')
    const fan = await signUp('Fan')
    const post = (await me.agent.post('/api/posts').send({ body: 'Hello VOIDAJ', audience: 'public' })).body.post
    await fan.agent.post(`/api/posts/${post.id}/spark`).send({ kind: 'spark' })
    await fan.agent.post(`/api/posts/${post.id}/loom`).send({})
    await fan.agent.post(`/api/users/${me.user.id}/connect`)
    const n = (await me.agent.get('/api/notifications')).body
    expect(n.sparks.some((x) => x.user.id === fan.user.id && x.postId === post.id)).toBe(true)
    expect(n.looms.some((x) => x.user.id === fan.user.id)).toBe(true)
    expect(n.connections.some((x) => x.user.id === fan.user.id)).toBe(true)
    expect(n.messages).toBeUndefined()
  })
})

describe('businesses belong to a country', () => {
  it('records the owner’s country, so the page can say where it is', async () => {
    const owner = await signUp('Owner Person')
    await owner.agent.patch('/api/auth/me').send({ country: 'CA', city: 'Toronto' })
    const res = await owner.agent.post('/api/businesses').send({ name: 'Maple Bakes', category: 'food', city: 'Toronto' })
    expect(res.status).toBe(200)
    expect(res.body.business).toMatchObject({ city: 'Toronto', country: 'CA' })
  })
})
