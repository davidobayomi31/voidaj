// ID verification reviewed by a person (server/id-checks.js).
import { describe, expect, it } from 'vitest'
import { app, request, signUp } from './helpers.js'
import q from '../server/db.js'

const img = (kb = 20) => `data:image/jpeg;base64,${Buffer.alloc(kb * 1024, 7).toString('base64')}`
const send = (agent, extra = {}) => agent.post('/api/verification')
  .send({ docType: 'nin', legalName: 'Ada Lovelace', document: img(), selfie: img(), consent: true, ...extra })

async function admin() {
  const a = await signUp('Admin')
  await q.run('UPDATE users SET is_admin = 1 WHERE id = ?', a.user.id)
  return a
}

describe('ID checks', () => {
  it('no longer hands out the badge on request', async () => {
    const { agent } = await signUp()
    expect((await agent.post('/api/auth/verify-id').send({})).status).toBe(410)
    expect((await agent.get('/api/auth/me')).body.user.idVerified).toBe(false)
  })

  it('checks what is sent', async () => {
    const { agent } = await signUp()
    expect((await send(agent, { docType: 'library-card' })).status).toBe(400)
    expect((await send(agent, { legalName: '' })).status).toBe(400)
    expect((await send(agent, { consent: false })).status).toBe(400)
    expect((await send(agent, { selfie: 'data:text/html;base64,PGI+' })).status).toBe(400)
    expect((await send(agent, { document: img(1) })).status).toBe(400)
  })

  it('goes from sent to approved, verifies the member, and deletes the photos', async () => {
    const member = await signUp()
    const res = await send(member.agent)
    expect(res.status).toBe(200)
    expect(res.body.check).toMatchObject({ status: 'pending', docType: 'nin' })
    expect((await send(member.agent)).status).toBe(400) // already waiting

    // Not for members' eyes.
    expect((await member.agent.get('/api/admin/verifications')).status).toBe(403)
    expect((await member.agent.post(`/api/admin/verifications/${res.body.check.id}`).send({ decision: 'approve' })).status).toBe(403)

    const boss = await admin()
    const list = (await boss.agent.get('/api/admin/verifications')).body.checks
    const mine = list.find((c) => c.id === res.body.check.id)
    expect(mine.document).toMatch(/^data:image\/jpeg/)
    expect(mine.legalName).toBe('Ada Lovelace')
    expect(mine.user.email).toBe(member.email)

    expect((await boss.agent.post(`/api/admin/verifications/${mine.id}`).send({ decision: 'approve' })).status).toBe(200)
    expect((await member.agent.get('/api/auth/me')).body.user.idVerified).toBe(true)
    const row = await q.get('SELECT * FROM id_checks WHERE id = ?', mine.id)
    expect(row).toMatchObject({ status: 'approved', document: null, selfie: null, legal_name: null })
    expect((await boss.agent.post(`/api/admin/verifications/${mine.id}`).send({ decision: 'reject', reason: 'late' })).status).toBe(400)
  })

  it('rejects with a reason the member sees, and lets them try again', async () => {
    const member = await signUp()
    const { check } = (await send(member.agent)).body
    const boss = await admin()
    expect((await boss.agent.post(`/api/admin/verifications/${check.id}`).send({ decision: 'reject' })).status).toBe(400)
    expect((await boss.agent.post(`/api/admin/verifications/${check.id}`).send({ decision: 'reject', reason: 'Blurry photo' })).status).toBe(200)
    const me = (await member.agent.get('/api/verification')).body
    expect(me).toMatchObject({ verified: false, check: { status: 'rejected', reason: 'Blurry photo' } })
    expect((await send(member.agent)).status).toBe(200)
  })

  it('makes verified-only jobs need an approved check', async () => {
    const poster = await signUp()
    const worker = await signUp()
    const job = (await poster.agent.post('/api/jobs').send({ title: 'Fix a tap', category: 'Moving', verifiedOnly: true })).body.job
    expect(job.verifiedOnly).toBe(true)
    expect((await worker.agent.post(`/api/jobs/${job.id}/interest`)).status).toBe(403)
    await q.run('UPDATE users SET id_verified = 1 WHERE id = ?', worker.user.id)
    expect((await worker.agent.post(`/api/jobs/${job.id}/interest`)).status).toBe(200)
  })
})
