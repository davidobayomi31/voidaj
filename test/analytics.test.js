import { describe, it, expect } from 'vitest'
import q from '../server/db.js'
import { app, request, signUp, createCommunity, createPost } from './helpers.js'
import { buildAnalytics } from '../server/analytics.js'

async function admin() {
  const a = await signUp('Analytics Admin')
  await q.run('UPDATE users SET is_admin = 1 WHERE id = ?', a.user.id)
  return a
}

describe('GET /api/admin/analytics', () => {
  it('is for admins only', async () => {
    const member = await signUp('Not An Admin')
    expect((await request(app).get('/api/admin/analytics')).status).toBe(401)
    expect((await member.agent.get('/api/admin/analytics')).status).toBe(403)
  })

  it('counts new members, what they did, and leaves sample accounts out', async () => {
    const boss = await admin()
    const maker = await signUp('Maker')
    const community = await createCommunity(maker.agent)
    await createPost(maker.agent, community.id)

    const before = (await boss.agent.get('/api/admin/analytics')).body
    await q.run("UPDATE users SET is_seed = 1 WHERE id = ?", maker.user.id)
    const after = (await boss.agent.get('/api/admin/analytics')).body

    expect(before.headline.members).toBeGreaterThanOrEqual(2)
    expect(before.headline.joinedToday).toBeGreaterThanOrEqual(2)
    expect(before.signups).toHaveLength(30)
    expect(before.signups.at(-1).count).toBeGreaterThanOrEqual(2)
    expect(before.total.at(-1).count).toBe(before.headline.members)
    expect(before.funnel[0]).toMatchObject({ label: 'Signed up', count: before.headline.members, percent: 100 })
    expect(before.content.find((c) => c.label === 'Posts').total).toBeGreaterThanOrEqual(1)
    // Marking the account as a sample removes it, and its post, from the numbers.
    expect(after.headline.members).toBe(before.headline.members - 1)
    expect(after.content.find((c) => c.label === 'Posts').total).toBe(before.content.find((c) => c.label === 'Posts').total - 1)
  })

  it('handles an empty database without dividing by zero', async () => {
    const empty = { all: async () => [], get: async () => undefined, run: async () => {} }
    const out = await buildAnalytics(empty, Date.UTC(2026, 10, 19))
    expect(out.headline.members).toBe(0)
    expect(out.headline.returningRate).toBeNull()
    expect(out.funnel.every((s) => s.percent === null)).toBe(true)
    expect(out.signups).toHaveLength(30)
    expect(out.total.every((t) => t.count === 0)).toBe(true)
  })
})
