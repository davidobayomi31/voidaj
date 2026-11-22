// Quick Job payments through Paystack (server/payments.js). Paystack itself
// is faked: every call to api.paystack.co is answered here, and the test
// checks what VOIDAJ asked it to do (who gets paid, how much, and the fee).
import crypto from 'crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { app, request, signUp } from './helpers.js'
import q from '../server/db.js'
import { parseAmount, feeFor, paystackFee, CONFIRM_MS } from '../server/payments.js'

const SECRET = 'sk_test_voidaj_fake'
const fake = { initialized: [], charges: [], refunds: [], subaccounts: [], deactivated: [], verified: {}, chargeFails: false }
const realFetch = globalThis.fetch

const reply = (data, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => (ok ? { status: true, data } : { status: false, message: data }) })

function paystack(url, opts = {}) {
  const u = new URL(url)
  const body = opts.body ? JSON.parse(opts.body) : null
  const path = u.pathname
  if (path === '/bank') return reply([{ code: '058', name: 'GTBank', active: true }, { code: '999', name: 'Gone Bank', active: false }])
  if (path === '/bank/resolve') {
    const n = u.searchParams.get('account_number')
    return n.startsWith('012345678') ? reply({ account_name: fake.names?.[n] || 'WORKER ONE' }) : reply('Could not resolve account name', false)
  }
  if (path === '/subaccount' && opts.method === 'POST') { fake.subaccounts.push(body); return reply({ subaccount_code: `ACCT_${fake.subaccounts.length}` }) }
  if (path.startsWith('/subaccount/') && opts.method === 'PUT') { if (body.active === false) fake.deactivated.push(path.split('/')[2]); return reply({ subaccount_code: path.split('/')[2] }) }
  if (path === '/transaction/initialize') { fake.initialized.push(body); return reply({ authorization_url: `https://checkout.paystack.com/${body.reference}`, reference: body.reference }) }
  if (path.startsWith('/transaction/verify/')) {
    const ref = decodeURIComponent(path.split('/').pop())
    return fake.verified[ref] ? reply(fake.verified[ref]) : reply('Transaction reference not found', false)
  }
  if (path === '/refund') { fake.refunds.push(body); return reply({}) }
  if (path === '/transaction/charge_authorization') {
    fake.charges.push(body)
    return reply(fake.chargeFails ? { status: 'failed', gateway_response: 'Declined' } : { status: 'success', reference: body.reference })
  }
  return reply(`unexpected ${path}`, false)
}

beforeAll(() => {
  process.env.PAYSTACK_SECRET_KEY = SECRET
  process.env.CRON_SECRET = 'cron-test-secret'
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => (String(url).startsWith('https://api.paystack.co') ? paystack(String(url), opts) : realFetch(url, opts)))
})
afterAll(() => {
  delete process.env.PAYSTACK_SECRET_KEY
  delete process.env.CRON_SECRET
  vi.restoreAllMocks()
})
beforeEach(() => { fake.chargeFails = false })

const CARD_AUTH = { authorization_code: 'AUTH_test', reusable: true, card_type: 'visa ', last4: '4081', exp_month: '12', exp_year: '2030', bank: 'TEST BANK' }

async function saveCard(agent, email) {
  const start = await agent.post('/api/payments/card').send({})
  expect(start.status).toBe(200)
  const init = fake.initialized.at(-1)
  expect(init).toMatchObject({ amount: 5000, currency: 'NGN', channels: ['card'] })
  fake.verified[init.reference] = { status: 'success', amount: 5000, currency: 'NGN', authorization: CARD_AUTH, customer: { email } }
  const done = await agent.post('/api/payments/verify').send({ reference: init.reference })
  expect(done.body).toMatchObject({ ok: true, kind: 'card' })
  return init.reference
}
// Adding a bank account takes a code from the member's email. The test
// swaps in a code it knows.
const KNOWN_CODE = '123456'
async function addPayout(who, accountNumber = '0123456789') {
  const first = await who.agent.post('/api/payments/payout').send({ bankCode: '058', accountNumber })
  if (first.status !== 200) return first
  await q.run('UPDATE payout_changes SET code_hash = ? WHERE user_id = ? AND confirmed_at IS NULL AND cancelled_at IS NULL',
    crypto.createHash('sha256').update(KNOWN_CODE).digest('hex'), who.user.id)
  return who.agent.post('/api/payments/payout/confirm').send({ code: KNOWN_CODE })
}

// A paid NGN job, hired and started: poster with a card, worker with a bank account.
async function startedJob({ price = '20,000' } = {}) {
  const poster = await signUp('Poster Paying')
  const worker = await signUp('Worker Paid')
  await saveCard(poster.agent, poster.email)
  expect((await addPayout(worker)).status).toBe(200)
  const job = (await poster.agent.post('/api/jobs').send({ title: 'Fix a tap', category: 'plumbing', budget: price, currency: 'NGN' })).body.job
  await worker.agent.post(`/api/jobs/${job.id}/interest`)
  const hired = await poster.agent.post(`/api/jobs/${job.id}/applicants/${worker.user.id}`).send({ action: 'hire', price })
  expect(hired.status).toBe(200)
  expect((await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })).body.job.status).toBe('in_progress')
  return { poster, worker, job }
}

describe('money maths', () => {
  it('reads only exact prices', () => {
    expect(parseAmount('₦35,000')).toBe(3500000)
    expect(parseAmount('NGN 35,000.50')).toBe(3500050)
    expect(parseAmount('35000')).toBe(3500000)
    for (const bad of ['35k', 'about 30', '', '1,000,0', '₦50', '99999999999']) expect(parseAmount(bad)).toBeNull()
  })

  it('adds a fee on top so the worker gets exactly the price', () => {
    for (const amount of [10000, 100000, 240000, 249000, 250000, 3500000, 20000000, 500000000]) {
      const fee = feeFor(amount)
      expect(amount + fee - paystackFee(amount + fee)).toBeGreaterThanOrEqual(amount)
      expect(fee - paystackFee(amount + fee)).toBeLessThanOrEqual(1) // VOIDAJ keeps nothing (at most a rounding kobo)
    }
    expect(feeFor(20000000)).toBe(200000) // capped at ₦2,000
  })
})

describe('payments setup', () => {
  it('says whether payments are on, and quotes the total', async () => {
    expect((await request(app).get('/api/payments/config')).body).toEqual({ enabled: true, currencies: ['NGN'] })
    const quote = (await request(app).get('/api/payments/quote?price=35,000')).body
    expect(quote).toMatchObject({ amount: 3500000, fee: feeFor(3500000), total: 3500000 + feeFor(3500000) })
    expect((await request(app).get('/api/payments/quote?price=35k')).status).toBe(400)
  })

  it('saves a worker’s bank account as a 0% subaccount', async () => {
    const w = await signUp('Bank Owner')
    expect((await w.agent.get('/api/payments/banks')).body.banks).toEqual([{ code: '058', name: 'GTBank' }])
    expect((await w.agent.post('/api/payments/payout').send({ bankCode: '058', accountNumber: '123' })).status).toBe(400)
    expect((await w.agent.post('/api/payments/payout').send({ bankCode: '058', accountNumber: '9999999999' })).status).toBe(400)
    // Step one checks the account and emails a code; nothing is saved yet.
    const started = await w.agent.post('/api/payments/payout').send({ bankCode: '058', accountNumber: '0123456789' })
    expect(started.body.payout).toBeNull()
    expect(started.body.pendingPayout).toMatchObject({ accountName: 'WORKER ONE', last4: '6789', confirmed: false })
    expect((await w.agent.post('/api/payments/payout/confirm').send({ code: '000000' })).status).toBe(400)
    const ok = await addPayout(w)
    expect(ok.body.payout).toEqual({ bankName: 'GTBank', accountName: 'WORKER ONE', last4: '6789' })
    expect(ok.body.pendingPayout).toBeNull()
    expect(fake.subaccounts.at(-1)).toMatchObject({ settlement_bank: '058', bank_code: '058', account_number: '0123456789', percentage_charge: 0 })
    // A change waits 24 hours: payments keep going to the old account.
    const changed = await addPayout(w, '0123456780')
    expect(changed.body.payout.last4).toBe('6789')
    expect(changed.body.pendingPayout).toMatchObject({ last4: '6780', confirmed: true })
    expect(changed.body.pendingPayout.effectiveAt).toBeGreaterThan(Date.now() + 23 * 3600e3)
    // It can be cancelled in that time...
    expect((await w.agent.post('/api/payments/payout/cancel')).body.pendingPayout).toBeNull()
    // ...or, once the 24 hours are up, it takes over and the old subaccount is switched off.
    await addPayout(w, '0123456780')
    await q.run('UPDATE payout_changes SET effective_at = ? WHERE user_id = ? AND applied_at IS NULL AND cancelled_at IS NULL', Date.now() - 1, w.user.id)
    const now = (await w.agent.get('/api/payments/me')).body
    expect(now.payout.last4).toBe('6780')
    expect(now.pendingPayout).toBeNull()
    expect(fake.deactivated.length).toBeGreaterThan(0)
  })

  it('saves a card from a refunded ₦50 check, only for the person who started it', async () => {
    const a = await signUp('Card Owner')
    const stranger = await signUp('Stranger')
    const ref = await saveCard(a.agent, a.email)
    expect((await a.agent.get('/api/payments/me')).body.card).toEqual({ brand: 'visa', last4: '4081', exp: '12/30', bank: 'TEST BANK' })
    expect(fake.refunds.at(-1)).toEqual({ transaction: ref })
    const refunds = fake.refunds.length
    expect((await a.agent.post('/api/payments/verify').send({ reference: ref })).body.ok).toBe(true) // again: no second refund
    expect(fake.refunds.length).toBe(refunds)
    expect((await stranger.agent.post('/api/payments/verify').send({ reference: ref })).status).toBe(404)
    expect((await a.agent.delete('/api/payments/card')).body.card).toBeNull()
  })
})

describe('paying for a Quick Job', () => {
  it('needs a numeric price and a card to hire, and a bank account to accept', async () => {
    const poster = await signUp('No Card Yet')
    const worker = await signUp('No Bank Yet')
    const job = (await poster.agent.post('/api/jobs').send({ title: 'Paint a wall', category: 'painting', budget: '15,000', currency: 'NGN' })).body.job
    await worker.agent.post(`/api/jobs/${job.id}/interest`)
    const hire = (price) => poster.agent.post(`/api/jobs/${job.id}/applicants/${worker.user.id}`).send({ action: 'hire', price })
    expect((await hire('about 15k')).status).toBe(400)
    const noCard = await hire('15,000')
    expect(noCard.status).toBe(400)
    expect(noCard.body.code).toBe('card_required')
    await saveCard(poster.agent, poster.email)
    const hired = await hire('15,000')
    expect(hired.body.payable).toBe(true)
    expect(hired.body.payment).toMatchObject({ status: 'not_started', amount: 1500000, fee: feeFor(1500000) })
    const accept = await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    expect(accept.body.code).toBe('payout_required')
    await addPayout(worker)
    expect((await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })).body.job.status).toBe('in_progress')
  })

  it('charges the saved card straight to the worker when the poster marks it done', async () => {
    const { poster, worker, job } = await startedJob({ price: '20,000' })
    const done = await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    expect(done.body.payment.status).toBe('paid')
    const fee = feeFor(2000000)
    expect(fake.charges.at(-1)).toMatchObject({ authorization_code: 'AUTH_test', amount: 2000000 + fee, transaction_charge: fee, bearer: 'account', currency: 'NGN' })
    expect(fake.charges.at(-1).subaccount).toMatch(/^ACCT_/)
    expect((await worker.agent.get(`/api/jobs/${job.id}`)).body.payment).toMatchObject({ status: 'paid', amount: 2000000 })
    // Nobody else sees the money.
    expect((await request(app).get(`/api/jobs/${job.id}`)).body.payment).toBeNull()
    expect((await poster.agent.post(`/api/jobs/${job.id}/payment/charge`)).status).toBe(400)
  })

  it('waits for the poster when the worker marks it done', async () => {
    const { poster, worker, job } = await startedJob()
    const charges = fake.charges.length
    const done = await worker.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    expect(done.body.payment.status).toBe('awaiting')
    expect(done.body.payment.confirmBy).toBeGreaterThan(Date.now())
    expect(fake.charges.length).toBe(charges)
    expect((await worker.agent.post(`/api/jobs/${job.id}/payment/charge`)).status).toBe(403)
    const paid = await poster.agent.post(`/api/jobs/${job.id}/payment/charge`)
    expect(paid.body.payment.status).toBe('paid')
  })

  it('does not charge while a problem is reported, and cancels if the team decides so', async () => {
    const { poster, worker, job } = await startedJob()
    await worker.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    await poster.agent.post(`/api/jobs/${job.id}/dispute`).send({ reason: 'The tap still leaks.' })
    expect((await poster.agent.post(`/api/jobs/${job.id}/payment/charge`)).status).toBe(400)
    const admin = await signUp('Payments Admin')
    await q.run('UPDATE users SET is_admin = 1 WHERE id = ?', admin.user.id)
    const d = (await admin.agent.get('/api/admin/disputes')).body.disputes.find((x) => x.jobId === job.id)
    await admin.agent.post(`/api/admin/disputes/${d.id}/resolve`).send({ outcome: 'cancelled' })
    expect((await poster.agent.get(`/api/jobs/${job.id}`)).body.payment.status).toBe('cancelled')
  })

  it('falls back to Pay now when the card is declined, settled by a signed webhook', async () => {
    const { poster, job } = await startedJob({ price: '5,000' })
    fake.chargeFails = true
    const done = await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    expect(done.body.payment).toMatchObject({ status: 'due', failure: 'Declined' })

    const url = (await poster.agent.post(`/api/jobs/${job.id}/payment/checkout`)).body.url
    expect(url).toMatch(/^https:\/\/checkout\.paystack\.com\//)
    const init = fake.initialized.at(-1)
    expect(init).toMatchObject({ amount: 500000 + feeFor(500000), transaction_charge: feeFor(500000), bearer: 'account' })
    expect(init.callback_url).toContain(`/jobs?job=${job.id}&paystack=pay`)

    const event = (amount) => JSON.stringify({ event: 'charge.success', data: { reference: init.reference, status: 'success', amount, currency: 'NGN' } })
    const sign = (raw) => crypto.createHmac('sha512', SECRET).update(raw).digest('hex')
    const send = (raw, sig) => request(app).post('/api/paystack/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(raw)

    expect((await send(event(init.amount), 'not-a-signature')).status).toBe(401)
    expect((await poster.agent.get(`/api/jobs/${job.id}`)).body.payment.status).toBe('due')
    // The wrong amount doesn't count as paid.
    const wrong = event(100)
    expect((await send(wrong, sign(wrong))).status).toBe(200)
    expect((await poster.agent.get(`/api/jobs/${job.id}`)).body.payment.status).toBe('due')
    const right = event(init.amount)
    expect((await send(right, sign(right))).status).toBe(200)
    expect((await send(right, sign(right))).status).toBe(200) // delivered twice: fine
    const p = (await poster.agent.get(`/api/jobs/${job.id}`)).body.payment
    expect(p.status).toBe('paid')
    expect((await q.all('SELECT * FROM job_payments WHERE job_id = ?', job.id)).length).toBe(1)
  })

  it('the daily job charges jobs the poster left unconfirmed for 48 hours', async () => {
    const { worker, job } = await startedJob()
    await worker.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    expect((await request(app).get('/api/cron/payments')).status).toBe(401)
    const cron = () => request(app).get('/api/cron/payments').set('Authorization', 'Bearer cron-test-secret')
    await cron()
    expect((await worker.agent.get(`/api/jobs/${job.id}`)).body.payment.status).toBe('awaiting')
    await q.run('UPDATE job_payments SET created_at = ? WHERE job_id = ?', Date.now() - CONFIRM_MS - 1000, job.id)
    expect((await cron()).body.charged).toBeGreaterThanOrEqual(1)
    expect((await worker.agent.get(`/api/jobs/${job.id}`)).body.payment.status).toBe('paid')
  })

  it('leaves jobs as they were when payments are off or the job isn’t payable', async () => {
    const poster = await signUp('Dollar Poster')
    const worker = await signUp('Dollar Worker')
    // A currency Paystack isn't set up for: arranged between the two, as before.
    const job = (await poster.agent.post('/api/jobs').send({ title: 'Design a logo', category: 'design', budget: '200', currency: 'USD' })).body.job
    await worker.agent.post(`/api/jobs/${job.id}/interest`)
    const hired = await poster.agent.post(`/api/jobs/${job.id}/applicants/${worker.user.id}`).send({ action: 'hire', price: 'about $200' })
    expect(hired.status).toBe(200)
    expect(hired.body.payable).toBe(false)
    expect(hired.body.payment).toBeNull()

    delete process.env.PAYSTACK_SECRET_KEY
    try {
      expect((await request(app).get('/api/payments/config')).body.enabled).toBe(false)
      expect((await poster.agent.post('/api/payments/card').send({})).status).toBe(503)
    } finally { process.env.PAYSTACK_SECRET_KEY = SECRET }
  })
})

// ── Keeping both sides honest (server/job-safety.js) ─────────────────
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const cron = () => request(app).get('/api/cron/payments').set('Authorization', 'Bearer cron-test-secret')
async function makeAdmin() {
  const a = await signUp('Safety Admin')
  await q.run('UPDATE users SET is_admin = 1 WHERE id = ?', a.user.id)
  return a
}
// A paid job up to the hire: poster with a card, worker with a bank account.
async function readyToHire({ price = '20,000', posterName = 'Poster Paying', verified = false } = {}) {
  const poster = await signUp(posterName)
  const worker = await signUp('Worker Paid')
  await saveCard(poster.agent, poster.email)
  await addPayout(worker)
  if (verified) await q.run('UPDATE users SET id_verified = 1 WHERE id IN (?, ?)', poster.user.id, worker.user.id)
  const job = (await poster.agent.post('/api/jobs').send({ title: 'Tile a floor', category: 'building', budget: price, currency: 'NGN' })).body.job
  await worker.agent.post(`/api/jobs/${job.id}/interest`)
  const hire = (body) => poster.agent.post(`/api/jobs/${job.id}/applicants/${worker.user.id}`).send({ action: 'hire', price, ...body })
  return { poster, worker, job, hire }
}
const flowOf = async (who, job) => (await who.agent.get(`/api/jobs/${job.id}`)).body

describe('hiring safely', () => {
  it('limits new accounts, and asks twice about large amounts', async () => {
    const big = await readyToHire({ price: '80,000' })
    const capped = await big.hire()
    expect(capped.status).toBe(400)
    expect(capped.body.code).toBe('new_account_limit')
    // Both ID verified: no cap, but ₦100,000 or more needs a second yes.
    const verified = await readyToHire({ price: '150,000', verified: true })
    expect((await verified.hire()).body.code).toBe('confirm_amount')
    expect((await verified.hire({ confirmLarge: true })).status).toBe(200)
  })

  it('refuses a hire where the worker’s bank account is in the poster’s name', async () => {
    fake.names = { '0123456781': 'OKAFOR ADA CHIOMA' }
    const poster = await signUp('Ada Okafor')
    const worker = await signUp('Second Account')
    await saveCard(poster.agent, poster.email)
    await addPayout(worker, '0123456781')
    const job = (await poster.agent.post('/api/jobs').send({ title: 'Fake job', category: 'other', budget: '30,000', currency: 'NGN' })).body.job
    await worker.agent.post(`/api/jobs/${job.id}/interest`)
    const r = await poster.agent.post(`/api/jobs/${job.id}/applicants/${worker.user.id}`).send({ action: 'hire', price: '30,000' })
    expect(r.body.code).toBe('same_person')
    const admin = await makeAdmin()
    const flags = (await admin.agent.get('/api/admin/flags')).body.flags
    const flag = flags.find((f) => f.kind === 'same_person' && f.jobId === job.id)
    expect(flag).toBeTruthy()
    expect((await poster.agent.get('/api/admin/flags')).status).toBe(403)
    await admin.agent.post(`/api/admin/flags/${flag.id}/clear`)
    expect((await admin.agent.get('/api/admin/flags')).body.flags.find((f) => f.id === flag.id)).toBeUndefined()
    fake.names = {}
  })

  it('keeps the card on file from the hire until it’s paid', async () => {
    const { poster, worker, job, hire } = await readyToHire()
    await hire()
    expect((await poster.agent.delete('/api/payments/card')).status).toBe(400)
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    expect((await poster.agent.delete('/api/payments/card')).status).toBe(400)
    await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    expect((await poster.agent.delete('/api/payments/card')).status).toBe(200)
  })

  it('a poster who owes a payment can’t hire again; the card is retried by itself', async () => {
    const { poster, worker, job, hire } = await readyToHire({ price: '10,000' })
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    fake.chargeFails = true
    const due = (await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })).body.payment
    expect(due.status).toBe('due')
    expect(due.retryAt).toBeGreaterThan(Date.now())
    // A new job can't be hired for until it's paid.
    const other = await signUp('Next Worker')
    await addPayout(other)
    const job2 = (await poster.agent.post('/api/jobs').send({ title: 'Another', category: 'other', budget: '5,000', currency: 'NGN' })).body.job
    await other.agent.post(`/api/jobs/${job2.id}/interest`)
    const blocked = await poster.agent.post(`/api/jobs/${job2.id}/applicants/${other.user.id}`).send({ action: 'hire', price: '5,000' })
    expect(blocked.body.code).toBe('payment_owed')
    // The retry comes round, the card works this time.
    fake.chargeFails = false
    await q.run("UPDATE job_payments SET next_try_at = ? WHERE job_id = ? AND kind = 'job'", Date.now() - 1, job.id)
    expect((await cron()).body.retried).toBeGreaterThanOrEqual(1)
    expect((await flowOf(poster, job)).payment.status).toBe('paid')
    expect((await poster.agent.post(`/api/jobs/${job2.id}/applicants/${other.user.id}`).send({ action: 'hire', price: '5,000' })).status).toBe(200)
    // It went through, but late: it doesn't count as paid on time.
    expect((await request(app).get(`/api/users/${poster.user.id}/reviews`)).body.record.asPoster).toMatchObject({ paid: 1, onTime: 0, owed: 0 })
  })
})

describe('the money between hire and done', () => {
  it('charges an up-front part when the work starts, and the rest at the end', async () => {
    const { worker, job, hire, poster } = await readyToHire({ price: '20,000' })
    expect((await hire({ upfront: '15,000' })).status).toBe(400) // more than half
    const hired = await hire({ upfront: '5,000' })
    expect(hired.body.agreement.upfront.amount).toBe(500000)
    expect(hired.body.payment).toMatchObject({ amount: 1500000 })
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    expect(fake.charges.at(-1)).toMatchObject({ amount: 500000 + feeFor(500000), metadata: expect.objectContaining({ kind: 'upfront' }) })
    const f = await flowOf(worker, job)
    expect(f.extras[0]).toMatchObject({ kind: 'upfront', status: 'paid' })
    await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    expect(fake.charges.at(-1)).toMatchObject({ amount: 1500000 + feeFor(1500000) })
  })

  it('takes a price change only when the other side accepts it', async () => {
    const { worker, job, hire, poster } = await readyToHire({ price: '10,000' })
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    expect((await worker.agent.post(`/api/jobs/${job.id}/price`).send({ price: 'more' })).status).toBe(400)
    const proposed = (await worker.agent.post(`/api/jobs/${job.id}/price`).send({ price: '12,500', note: 'Two extra taps' })).body.priceChange
    expect(proposed).toMatchObject({ byMe: true, price: '12,500' })
    expect((await worker.agent.post(`/api/jobs/${job.id}/price/${proposed.id}`).send({ accept: true })).status).toBe(400)
    const accepted = await poster.agent.post(`/api/jobs/${job.id}/price/${proposed.id}`).send({ accept: true })
    expect(accepted.body.payment.amount).toBe(1250000)
    expect(accepted.body.priceChange).toBeNull()
    // Declining a second one changes nothing.
    const again = (await poster.agent.post(`/api/jobs/${job.id}/price`).send({ price: '9,000' })).body.priceChange
    await worker.agent.post(`/api/jobs/${job.id}/price/${again.id}`).send({ accept: false })
    expect((await flowOf(poster, job)).payment.amount).toBe(1250000)
    const third = (await poster.agent.post(`/api/jobs/${job.id}/price`).send({ price: '9,500' })).body.priceChange
    expect((await poster.agent.post(`/api/jobs/${job.id}/price/${third.id}`).send({ cancel: true })).body.priceChange).toBeNull()
  })

  it('charges a cancellation fee once the worker has been on it for an hour', async () => {
    const { worker, job, hire, poster } = await readyToHire({ price: '20,000' })
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    expect((await flowOf(poster, job)).cancelFee).toBeNull() // still within the hour
    await q.run('UPDATE job_agreements SET accepted_at = ? WHERE job_id = ?', Date.now() - 2 * 3600e3, job.id)
    expect((await flowOf(poster, job)).cancelFee).toMatchObject({ amount: 200000 })
    const asked = await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'cancelled' })
    expect(asked.body.code).toBe('cancel_fee')
    const done = await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'cancelled', acceptFee: true })
    expect(done.body.job.status).toBe('cancelled')
    expect(fake.charges.at(-1)).toMatchObject({ amount: 200000 + feeFor(200000), metadata: expect.objectContaining({ kind: 'cancel_fee' }) })
    expect((await request(app).get(`/api/users/${poster.user.id}/reviews`)).body.record.asPoster.lateCancels).toBe(1)
  })

  it('lets the poster send the work back twice before confirming, with proof photos', async () => {
    const { worker, job, hire, poster } = await readyToHire()
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    expect((await worker.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed', photos: ['data:text/plain;base64,aGk='] })).status).toBe(400)
    const done = await worker.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed', photos: [PNG] })
    expect(done.body.payment.status).toBe('awaiting')
    const photo = done.body.photos[0]
    expect(photo.purpose).toBe('proof')
    expect((await poster.agent.get(photo.url)).headers['content-type']).toMatch(/image\/png/)
    expect((await (await signUp('Nosy')).agent.get(photo.url)).status).toBe(404)
    // Only the poster can send the work back (and once there are photos of
    // the work, they can't claim a no-show: checked in the loop).
    expect((await worker.agent.post(`/api/jobs/${job.id}/changes`).send({ note: 'Please redo the corners' })).status).toBe(403)
    for (let round = 1; round <= 2; round++) {
      const back = await poster.agent.post(`/api/jobs/${job.id}/changes`).send({ note: 'The corner tiles are loose.' })
      expect(back.body.job.status).toBe('in_progress')
      expect(back.body.agreement.changesLeft).toBe(2 - round)
      expect((await poster.agent.post(`/api/jobs/${job.id}/no-show`)).status).toBe(400)
      expect((await worker.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })).body.payment.status).toBe('awaiting')
    }
    expect((await poster.agent.post(`/api/jobs/${job.id}/changes`).send({ note: 'Still not right at all.' })).status).toBe(400)
    expect((await poster.agent.post(`/api/jobs/${job.id}/payment/charge`)).body.payment.status).toBe('paid')
    expect((await q.all("SELECT status FROM job_payments WHERE job_id = ? AND kind = 'job'", job.id)).map((r) => r.status).sort()).toEqual(['paid', 'reopened', 'reopened'])
  })

  it('reminds the poster before the automatic charge, once each time', async () => {
    const { worker, job, hire } = await readyToHire()
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    await worker.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    await q.run("UPDATE job_payments SET created_at = ? WHERE job_id = ? AND kind = 'job'", Date.now() - CONFIRM_MS + 20 * 3600e3, job.id)
    expect((await cron()).body.reminded).toBeGreaterThanOrEqual(1)
    const after = (await q.get("SELECT reminded FROM job_payments WHERE job_id = ? AND kind = 'job'", job.id)).reminded
    expect(after).toBe(1)
    await cron()
    expect((await q.get("SELECT reminded FROM job_payments WHERE job_id = ? AND kind = 'job'", job.id)).reminded).toBe(1)
    await q.run("UPDATE job_payments SET created_at = ? WHERE job_id = ? AND kind = 'job'", Date.now() - CONFIRM_MS + 2 * 3600e3, job.id)
    await cron()
    expect((await q.get("SELECT reminded FROM job_payments WHERE job_id = ? AND kind = 'job'", job.id)).reminded).toBe(3)
  })
})

describe('no-shows, reports and reviews', () => {
  it('a no-show cancels for free, counts on the worker, and can be contested', async () => {
    const { worker, job, hire, poster } = await readyToHire()
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    expect((await worker.agent.post(`/api/jobs/${job.id}/no-show`)).status).toBe(403)
    const gone = await poster.agent.post(`/api/jobs/${job.id}/no-show`)
    expect(gone.body.job.status).toBe('cancelled')
    expect(gone.body.canReview).toBe(true)
    expect((await request(app).get(`/api/users/${worker.user.id}/reviews`)).body.record.asWorker.noShows).toBe(1)
    await poster.agent.post(`/api/jobs/${job.id}/review`).send({ rating: 1, body: 'Never came.' })
    // The worker says they did come.
    const contest = await worker.agent.post(`/api/jobs/${job.id}/dispute`).send({ reason: 'I came at 9am and nobody opened the gate.', photos: [PNG] })
    expect(contest.body.dispute).toMatchObject({ category: 'no_show', byMe: true })
    const admin = await makeAdmin()
    const d = (await admin.agent.get('/api/admin/disputes')).body.disputes.find((x) => x.jobId === job.id)
    const detail = (await admin.agent.get(`/api/admin/disputes/${d.id}`)).body
    expect(detail.events.map((e) => e.action)).toEqual(expect.arrayContaining(['hired', 'accepted', 'no_show', 'reported']))
    expect(detail.photos.length).toBe(1)
    expect((await admin.agent.post(`/api/admin/disputes/${d.id}/resolve`).send({ outcome: 'pay_full', note: 'The gate camera shows the worker arriving.' })).body.ok).toBe(true)
    expect((await request(app).get(`/api/users/${worker.user.id}/reviews`)).body.record.asWorker.noShows).toBe(0)
    expect((await flowOf(worker, job)).payment.status).toBe('paid')
    expect((await admin.agent.post(`/api/admin/disputes/${d.id}/resolve`).send({ outcome: 'cancel' })).status).toBe(400)
  })

  it('reports need a reason, get the other side’s answer, and can end in part payment', async () => {
    const { worker, job, hire, poster } = await readyToHire({ price: '20,000' })
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    await worker.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    expect((await poster.agent.post(`/api/jobs/${job.id}/dispute`).send({ reason: 'bad' })).status).toBe(400)
    const r = await poster.agent.post(`/api/jobs/${job.id}/dispute`).send({ category: 'poor_quality', reason: 'Half the floor is uneven.', photos: [PNG] })
    expect(r.body.dispute).toMatchObject({ category: 'poor_quality', canRespond: false })
    expect((await poster.agent.post(`/api/jobs/${job.id}/dispute`).send({ reason: 'And another thing here.' })).status).toBe(400)
    expect((await poster.agent.post(`/api/jobs/${job.id}/dispute/respond`).send({ response: 'Answering myself' })).status).toBe(403)
    expect((await flowOf(worker, job)).dispute.canRespond).toBe(true)
    const answered = await worker.agent.post(`/api/jobs/${job.id}/dispute/respond`).send({ response: 'Only one corner, I offered to fix it.' })
    expect(answered.body.dispute.response).toMatch(/one corner/)
    expect((await worker.agent.post(`/api/jobs/${job.id}/dispute/respond`).send({ response: 'Saying it twice now.' })).status).toBe(400)
    // Nothing is charged while it's open, even after 48 hours.
    await q.run("UPDATE job_payments SET created_at = ? WHERE job_id = ? AND kind = 'job'", Date.now() - CONFIRM_MS - 1000, job.id)
    await cron()
    expect((await flowOf(poster, job)).payment.status).toBe('awaiting')
    const admin = await makeAdmin()
    const d = (await admin.agent.get('/api/admin/disputes')).body.disputes.find((x) => x.jobId === job.id)
    expect(d).toMatchObject({ category: 'poor_quality', answered: true })
    expect((await admin.agent.post(`/api/admin/disputes/${d.id}/resolve`).send({ outcome: 'pay_part', amount: '25,000' })).status).toBe(400)
    await admin.agent.post(`/api/admin/disputes/${d.id}/resolve`).send({ outcome: 'pay_part', amount: '15,000' })
    expect(fake.charges.at(-1)).toMatchObject({ amount: 1500000 + feeFor(1500000) })
    expect((await flowOf(poster, job)).dispute).toMatchObject({ outcome: 'pay_part' })
    const record = (await admin.agent.get(`/api/admin/jobs/${job.id}/record`)).body
    expect(record.payments.find((p) => p.kind === 'job' && p.status === 'paid').how).toBe('team')
  })

  it('stops someone filing reports for a while after two baseless ones', async () => {
    const admin = await makeAdmin()
    const poster = await signUp('Serial Reporter')
    for (let i = 0; i < 3; i++) {
      const worker = await signUp(`Reported Worker ${i}`)
      const job = (await poster.agent.post('/api/jobs').send({ title: `Unpaid help ${i}`, category: 'other', budget: '', currency: 'USD' })).body.job
      await worker.agent.post(`/api/jobs/${job.id}/interest`)
      await poster.agent.post(`/api/jobs/${job.id}/applicants/${worker.user.id}`).send({ action: 'hire', price: 'free' })
      const r = await poster.agent.post(`/api/jobs/${job.id}/dispute`).send({ reason: 'They did nothing at all.' })
      if (i === 2) { expect(r.body.code).toBe('reports_paused'); break }
      const d = (await admin.agent.get('/api/admin/disputes')).body.disputes.find((x) => x.jobId === job.id)
      await admin.agent.post(`/api/admin/disputes/${d.id}/resolve`).send({ outcome: 'pay_full', unfounded: true })
    }
  })

  it('keeps reviews hidden until both are in', async () => {
    const { worker, job, hire, poster } = await readyToHire()
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    await poster.agent.post(`/api/jobs/${job.id}/review`).send({ rating: 2, body: 'Slow.' })
    const w = await flowOf(worker, job)
    expect(w.theirReview).toBeNull()
    expect(w.reviewWaiting).toBe(true)
    expect((await request(app).get(`/api/users/${worker.user.id}/reviews`)).body.count).toBe(0)
    // The poster can still change theirs while it's hidden.
    await poster.agent.post(`/api/jobs/${job.id}/review`).send({ rating: 3, body: 'Slow, but tidy.' })
    await worker.agent.post(`/api/jobs/${job.id}/review`).send({ rating: 5 })
    expect((await flowOf(worker, job)).theirReview.rating).toBe(3)
    expect((await request(app).get(`/api/users/${worker.user.id}/reviews`)).body.count).toBe(1)
    expect((await poster.agent.post(`/api/jobs/${job.id}/review`).send({ rating: 5 })).status).toBe(400)
  })
})

describe('card and bank safety', () => {
  it('flags one card on two accounts, and limits card checks', async () => {
    const a = await signUp('Card One')
    const b = await signUp('Card Two')
    CARD_AUTH.signature = 'SIG_same_card'
    try {
      await saveCard(a.agent, a.email)
      await saveCard(b.agent, b.email)
    } finally { delete CARD_AUTH.signature }
    expect(await q.get("SELECT 1 FROM risk_flags WHERE user_id = ? AND kind = 'shared_card'", b.user.id)).toBeTruthy()
    process.env.RATE_LIMITS = 'on'
    try {
      const c = await signUp('Card Tester')
      const tries = []
      for (let i = 0; i < 6; i++) tries.push((await c.agent.post('/api/payments/card').send({})).status)
      expect(tries.at(-1)).toBe(429)
    } finally { process.env.RATE_LIMITS = 'off' }
  })

  it('records chargebacks: the poster can’t hire until it’s settled', async () => {
    const { worker, job, hire, poster } = await readyToHire({ price: '6,000' })
    await hire()
    await worker.agent.post(`/api/jobs/${job.id}/agreement`).send({ accept: true })
    await poster.agent.post(`/api/jobs/${job.id}/stage`).send({ to: 'completed' })
    const ref = fake.charges.at(-1).reference
    const sign = (raw) => crypto.createHmac('sha512', SECRET).update(raw).digest('hex')
    const send = (event) => {
      const raw = JSON.stringify({ event, data: { transaction: { reference: ref }, resolution: 'merchant-accepted' } })
      return request(app).post('/api/paystack/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', sign(raw)).send(raw)
    }
    await send('charge.dispute.create')
    expect(await q.get("SELECT 1 FROM risk_flags WHERE user_id = ? AND kind = 'chargeback'", poster.user.id)).toBeTruthy()
    const other = await signUp('After Chargeback')
    await addPayout(other)
    const job2 = (await poster.agent.post('/api/jobs').send({ title: 'Next', category: 'other', budget: '5,000', currency: 'NGN' })).body.job
    await other.agent.post(`/api/jobs/${job2.id}/interest`)
    const hire2 = () => poster.agent.post(`/api/jobs/${job2.id}/applicants/${other.user.id}`).send({ action: 'hire', price: '5,000' })
    expect((await hire2()).body.code).toBe('payment_owed')
    await send('charge.dispute.resolve')
    expect((await hire2()).status).toBe(200)
    expect((await request(app).get(`/api/users/${poster.user.id}/reviews`)).body.record.asPoster.chargebacks).toBe(1)
  })
})
