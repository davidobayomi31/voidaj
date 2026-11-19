// Advert requests are reviewed by a person before they go live (server/ads.js).
import { afterEach, describe, expect, it } from 'vitest'
import { app, request, signUp } from './helpers.js'
import q from '../server/db.js'

afterEach(() => { delete process.env.REQUIRE_EMAIL_CONFIRM })

const req = (agent, extra = {}) => agent.post('/api/ads').send({
  businessName: 'Test Bakery', tagline: 'Fresh bread daily', ctaLabel: 'Order now', accent: '#1F5FA8',
  contactEmail: 'owner@example.com', phone: '08012345678', link: 'testbakery.com', ...extra,
})
async function admin() {
  const a = await signUp('Admin')
  await q.run('UPDATE users SET is_admin = 1 WHERE id = ?', a.user.id)
  return a
}
const liveNames = async () => (await request(app).get('/api/ads')).body.ads.map((a) => a.businessName)

describe('advert requests', () => {
  it('saves a request as pending and shows it to nobody', async () => {
    const { agent } = await signUp()
    const res = await req(agent)
    expect(res.status).toBe(200)
    expect(res.body.ad).toMatchObject({ status: 'pending', active: false, link: 'https://testbakery.com', contactEmail: 'owner@example.com' })
    expect(await liveNames()).not.toContain('Test Bakery')
    expect((await agent.get('/api/ads/mine')).body.ads.some((a) => a.id === res.body.ad.id)).toBe(true)
  })

  it('no longer lets anyone switch an ad on by paying', async () => {
    const { agent } = await signUp()
    const { ad } = (await req(agent)).body
    expect((await agent.post(`/api/ads/${ad.id}/pay`)).status).toBe(410)
    expect(await liveNames()).not.toContain('Test Bakery')
  })

  it('checks what is sent, and caps open requests', async () => {
    const { agent } = await signUp()
    expect((await req(agent, { businessName: '' })).status).toBe(400)
    expect((await req(agent, { contactEmail: 'not-an-email' })).status).toBe(400)
    expect((await req(agent, { logo: 'data:text/html;base64,PGI+' })).status).toBe(400)
    for (let i = 0; i < 3; i++) expect((await req(agent, { businessName: `Shop ${i}` })).status).toBe(200)
    expect((await req(agent, { businessName: 'One too many' })).status).toBe(429)
    expect((await request(app).post('/api/ads').send({ businessName: 'Anon' })).status).toBe(401)
  })

  it('needs a confirmed email once emails are being sent', async () => {
    process.env.REQUIRE_EMAIL_CONFIRM = '1'
    const { agent } = await signUp()
    expect((await req(agent)).status).toBe(403)
  })

  it('goes live when an admin approves, and the advertiser can see the result', async () => {
    const owner = await signUp()
    const boss = await admin()
    const { ad } = (await req(owner.agent, { businessName: 'Approve Me Ltd' })).body
    expect((await owner.agent.get('/api/admin/ads')).status).toBe(403)
    expect((await owner.agent.post(`/api/admin/ads/${ad.id}`).send({ decision: 'approve' })).status).toBe(403)

    const list = (await boss.agent.get('/api/admin/ads')).body.ads
    expect(list.find((a) => a.id === ad.id)).toMatchObject({ status: 'pending', ownerEmail: owner.email })
    expect((await boss.agent.post(`/api/admin/ads/${ad.id}`).send({ decision: 'approve' })).status).toBe(200)
    expect(await liveNames()).toContain('Approve Me Ltd')
    expect((await owner.agent.get('/api/ads/mine')).body.ads.find((a) => a.id === ad.id).status).toBe('live')

    // And it can be taken down again.
    await boss.agent.post(`/api/admin/ads/${ad.id}`).send({ decision: 'pause' })
    expect(await liveNames()).not.toContain('Approve Me Ltd')
  })

  it('stays hidden when rejected, with the reason', async () => {
    const owner = await signUp()
    const boss = await admin()
    const { ad } = (await req(owner.agent, { businessName: 'Reject Me Ltd' })).body
    expect((await boss.agent.post(`/api/admin/ads/${ad.id}`).send({ decision: 'reject' })).status).toBe(400)
    expect((await boss.agent.post(`/api/admin/ads/${ad.id}`).send({ decision: 'reject', note: 'Blurry logo' })).status).toBe(200)
    expect(await liveNames()).not.toContain('Reject Me Ltd')
    expect((await owner.agent.get('/api/ads/mine')).body.ads.find((a) => a.id === ad.id)).toMatchObject({ status: 'rejected', reviewNote: 'Blurry logo' })
  })
})
