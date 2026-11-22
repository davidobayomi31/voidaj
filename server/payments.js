// ── Quick Job payments (Paystack) ────────────────────────────────────
// David, Nov 21: the worker gets 100% of the agreed price, VOIDAJ takes no
// cut and never holds the money. It works like Uber:
//   - A worker adds the bank account they want paying into. That becomes a
//     Paystack subaccount.
//   - A poster saves a card (a ₦50 check that is refunded; the bank can take
//     a few days to show it) before they can hire someone for a paid job.
//   - When the job is done the saved card is charged, split straight to the
//     worker's subaccount. If the poster marks it done, that happens at once.
//     If the worker marks it done, the poster confirms, asks for changes or
//     reports a problem; after 48 hours without any of those, it's charged
//     (the cron runs hourly, and reminds the poster 24 and 4 hours before).
//   - If the charge fails, the card is tried again a day and then two days
//     later (as Uber does), the poster can't hire again until it's paid, and
//     they get a Pay now link (any method).
// Paystack's processing fee is added on top for the poster, so the worker's
// share is exactly the agreed price and VOIDAJ nets nothing.
// A job can also have a part paid up front and a cancellation fee; each is
// its own row in job_payments ("kind"). The rules that keep both sides
// honest live in server/job-safety.js.
//
// Everything here is off until PAYSTACK_SECRET_KEY is set; without it jobs
// work as before (payment arranged between the two people).
import crypto from 'crypto'
import q, { getUserById } from './db.js'
import { requireAuth } from './auth.js'
import { baseUrl } from './social.js'
import * as guard from './guard.js'
import { noticeEmail } from './email-templates.js'
import { accountHash, raiseFlag, eventsFor, logEvent } from './job-safety.js'

const API = 'https://api.paystack.co'
const env = (k) => (process.env[k] || '').trim()
const now = () => Date.now()
const uid = (p) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
const err = (res, code, msg, extra = {}) => res.status(code).json({ error: msg, ...extra })

export const paymentsReady = () => !!env('PAYSTACK_SECRET_KEY')
// Currencies the Paystack account can take. Nigeria-first: NGN.
export const payableCurrencies = () => (env('PAYSTACK_CURRENCIES') || 'NGN').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
// A paid job in a currency we can take, while payments are switched on.
export const isPayable = (job) => paymentsReady() && (job.opportunity || 'paid') === 'paid' && payableCurrencies().includes(String(job.currency || 'NGN').toUpperCase())

// The card check: ₦50, refunded once the card is saved.
const CARD_CHECK = 5000
const HOUR = 60 * 60 * 1000
// How long a worker-marked job waits for the poster before it is charged.
export const CONFIRM_MS = 48 * HOUR
// A failed charge is tried again this long after each failure, up to three
// tries in all.
const RETRY_AFTER = [24 * HOUR, 48 * HOUR]
export const MAX_ATTEMPTS = 3
// A new payout account takes effect this long after it's confirmed.
export const PAYOUT_DELAY_MS = 24 * HOUR
const CODE_MS = 30 * 60 * 1000
const teamEmail = () => env('TEAM_NOTIFY_EMAIL') || env('ADS_NOTIFY_EMAIL') || 'hello@voidaj.com'
const KIND_LABEL = { job: '', upfront: ' (up-front part)', cancel_fee: ' (cancellation fee)' }
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex')
// Sane limits on one job's price, in kobo: ₦100 to ₦10,000,000.
const MIN_AMOUNT = 10000
const MAX_AMOUNT = 1_000_000_000

// ── Money ────────────────────────────────────────────────────────────
// The agreed price is typed by hand ("₦35,000", "35000", "NGN 35,000.50").
// Anything else ("35k", "about 30") is refused rather than guessed at, so
// a card is never charged the wrong amount. Returns kobo, or null.
export function parseAmount(text) {
  let s = String(text ?? '').trim()
  s = s.replace(/^[A-Za-z]{3}\s*/, '').replace(/\s*[A-Za-z]{3}$/, '').replace(/^[^0-9A-Za-z]+/, '').trim()
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null
  const kobo = Math.round(Number(s.replace(/,/g, '')) * 100)
  return kobo >= MIN_AMOUNT && kobo <= MAX_AMOUNT ? kobo : null
}

// Paystack's local Nigerian card fee: 1.5% + ₦100, the ₦100 waived under
// ₦2,500, capped at ₦2,000. Confirm against the dashboard before going
// live; PAYSTACK_FEE_PERCENT / _FLAT / _CAP override it (flat and cap in kobo).
const feeRule = () => ({
  percent: Number(env('PAYSTACK_FEE_PERCENT') || 1.5),
  flat: Number(env('PAYSTACK_FEE_FLAT') || 10000),
  flatFrom: 250000,
  cap: Number(env('PAYSTACK_FEE_CAP') || 200000),
})
export function paystackFee(total) {
  const r = feeRule()
  return Math.min(Math.ceil((total * r.percent) / 100) + (total >= r.flatFrom ? r.flat : 0), r.cap)
}
// The fee to add on top so that, after Paystack takes its cut of the whole
// charge, the worker still gets exactly `amount`.
export function feeFor(amount) {
  let fee = 0
  for (let i = 0; i < 30; i++) {
    const next = paystackFee(amount + fee)
    if (next <= fee) break
    fee = next
  }
  return fee
}
export const money = (kobo, currency = 'NGN') => {
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: kobo % 100 ? 2 : 0 }).format(kobo / 100) } catch { return `${currency} ${(kobo / 100).toLocaleString('en-NG')}` }
}

// ── Paystack ─────────────────────────────────────────────────────────
async function paystack(path, { method = 'GET', body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.status === false) {
    const e = new Error(data.message || 'The payment provider didn’t answer. Try again in a minute.')
    e.status = r.status
    throw e
  }
  return data.data
}

// The signature Paystack puts on every webhook: HMAC-SHA512 of the raw
// body with the secret key.
export const signatureOk = (raw, sig) => {
  if (!raw || !sig || !paymentsReady()) return false
  const want = crypto.createHmac('sha512', env('PAYSTACK_SECRET_KEY')).update(raw).digest('hex')
  const a = Buffer.from(want)
  const b = Buffer.from(String(sig))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ── What we keep ─────────────────────────────────────────────────────
export const cardOf = (userId) => q.get('SELECT * FROM payment_cards WHERE user_id = ?', userId)

// A payout change that has waited its 24 hours becomes the account payments
// go to. Checked whenever the account is looked up, so it doesn't depend on
// the cron running.
async function applyChange(c) {
  const r = await q.run('UPDATE payout_changes SET applied_at = ?, account_number = NULL WHERE id = ? AND applied_at IS NULL AND cancelled_at IS NULL', now(), c.id)
  if (!r.changes) return
  const old = await q.get('SELECT subaccount_code FROM payout_accounts WHERE user_id = ?', c.user_id)
  await q.run(`INSERT INTO payout_accounts (user_id, subaccount_code, bank_code, bank_name, account_name, last4, account_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET subaccount_code = EXCLUDED.subaccount_code, bank_code = EXCLUDED.bank_code, bank_name = EXCLUDED.bank_name,
      account_name = EXCLUDED.account_name, last4 = EXCLUDED.last4, account_hash = EXCLUDED.account_hash, created_at = EXCLUDED.created_at`,
  c.user_id, c.subaccount_code, c.bank_code, c.bank_name || '', c.account_name || '', c.last4 || '', c.account_hash || null, now())
  // The old subaccount is switched off, so nothing can be paid into it.
  if (old?.subaccount_code && old.subaccount_code !== c.subaccount_code) {
    paystack(`/subaccount/${encodeURIComponent(old.subaccount_code)}`, { method: 'PUT', body: { active: false } }).catch(() => {})
  }
}
export async function payoutOf(userId) {
  const due = await q.all(`SELECT * FROM payout_changes WHERE user_id = ? AND confirmed_at IS NOT NULL AND applied_at IS NULL
    AND cancelled_at IS NULL AND effective_at <= ? ORDER BY created_at`, userId, now())
  for (const c of due) await applyChange(c)
  return q.get('SELECT * FROM payout_accounts WHERE user_id = ?', userId)
}
// A change that's waiting: for its code, or for its 24 hours.
const pendingChange = (userId) => q.get(`SELECT * FROM payout_changes WHERE user_id = ? AND applied_at IS NULL AND cancelled_at IS NULL
  AND (confirmed_at IS NOT NULL OR code_expires > ?) ORDER BY created_at DESC LIMIT 1`, userId, now())

const cardOut = (c) => (c ? { brand: c.brand || 'Card', last4: c.last4 || '', exp: c.exp || '', bank: c.bank || '' } : null)
const payoutOut = (p) => (p ? { bankName: p.bank_name || '', accountName: p.account_name || '', last4: p.last4 || '' } : null)

async function mine(userId) {
  const [card, payout] = await Promise.all([cardOf(userId), payoutOf(userId)])
  const change = await pendingChange(userId)
  return {
    enabled: paymentsReady(), currencies: payableCurrencies(), card: cardOut(card), payout: payoutOut(payout),
    pendingPayout: change ? { ...payoutOut(change), confirmed: !!change.confirmed_at, effectiveAt: change.effective_at || null } : null,
  }
}

async function saveCard(userId, data) {
  const a = data?.authorization
  if (!a?.authorization_code || !a.reusable) return false
  await q.run(`INSERT INTO payment_cards (user_id, authorization_code, email, brand, last4, exp, bank, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET authorization_code = EXCLUDED.authorization_code, email = EXCLUDED.email, brand = EXCLUDED.brand,
      last4 = EXCLUDED.last4, exp = EXCLUDED.exp, bank = EXCLUDED.bank, signature = EXCLUDED.signature, created_at = EXCLUDED.created_at`,
  userId, a.authorization_code, data.customer?.email || '', String(a.card_type || a.brand || 'Card').trim(), a.last4 || '',
  a.exp_month && a.exp_year ? `${a.exp_month}/${String(a.exp_year).slice(-2)}` : '', a.bank || '', a.signature || null, now())
  // The same card saved on another account is worth a look (one person with
  // two accounts, or a card that isn't theirs).
  if (a.signature) {
    const other = await q.get('SELECT user_id FROM payment_cards WHERE signature = ? AND user_id <> ? LIMIT 1', a.signature, userId)
    if (other) await raiseFlag({ userId, otherId: other.user_id, kind: 'shared_card', detail: 'The same card is saved on another VOIDAJ account.' })
  }
  return true
}

// ── One job's payments ───────────────────────────────────────────────
// The charge for the job itself. A round the poster sent back for changes
// ('reopened') no longer counts.
export const paymentFor = (jobId) => q.get("SELECT * FROM job_payments WHERE job_id = ? AND kind = 'job' AND status <> 'reopened' ORDER BY created_at DESC LIMIT 1", jobId)
// The other charges on a job: a part paid up front, a cancellation fee.
export const extrasFor = (jobId) => q.all("SELECT * FROM job_payments WHERE job_id = ? AND kind <> 'job' ORDER BY created_at", jobId)

export function paymentView(p, agreement) {
  if (!p && !agreement?.amount) return null
  const amount = p ? Number(p.amount) : Number(agreement.amount) - Number(agreement.upfront || 0)
  const fee = p ? Number(p.fee) : feeFor(amount)
  const currency = p?.currency || agreement?.currency || 'NGN'
  return {
    id: p?.id || null, kind: p?.kind || 'job',
    status: p?.status || 'not_started', amount, fee, total: amount + fee, currency,
    label: { amount: money(amount, currency), fee: money(fee, currency), total: money(amount + fee, currency) },
    failure: p?.failure || '', paidAt: p?.paid_at || null,
    confirmBy: p?.status === 'awaiting' ? Number(p.created_at) + CONFIRM_MS : null,
    // When the card will be tried again by itself, after a failure.
    retryAt: p?.status === 'due' && p.next_try_at && (p.attempts || 0) < MAX_ATTEMPTS ? Number(p.next_try_at) : null,
  }
}

const sendTo = async (userId, email) => {
  const u = await getUserById(userId)
  if (u?.email) guard.sendMail(u.email, email.subject, email.text, email.html).catch(() => {})
}
const fmtWhen = (t) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })

// What the team would show a bank if the poster disputes the charge: the
// agreement, the job's record and how the payment was triggered. Saved
// with the payment the moment it's paid.
async function evidenceFor(p, how) {
  const [agreement, events, photos] = await Promise.all([
    q.get('SELECT price, terms, created_at, accepted_at FROM job_agreements WHERE job_id = ?', p.job_id),
    eventsFor(p.job_id),
    q.get('SELECT COUNT(*)::int AS n FROM job_photos WHERE job_id = ?', p.job_id),
  ])
  return JSON.stringify({
    how, agreement: agreement ? { price: agreement.price, terms: agreement.terms, hiredAt: agreement.created_at, acceptedAt: agreement.accepted_at } : null,
    events: events.map((e) => ({ action: e.action, by: e.user_id, at: e.at, ip: e.ip })), photos: photos.n,
  })
}

async function markPaid(p, reference, how = 'card') {
  // Money that actually arrived is recorded even on a cancelled payment, so
  // the team can see it and refund it.
  const r = await q.run("UPDATE job_payments SET status = 'paid', paid_at = ?, failure = '', next_try_at = NULL, how = ?, reference = COALESCE(?, reference) WHERE id = ? AND status <> 'paid'",
    now(), how, reference || null, p.id)
  if (!r.changes) return false
  await q.run('UPDATE job_payments SET evidence = ? WHERE id = ?', await evidenceFor(p, how), p.id).catch(() => {})
  await logEvent(null, p.job_id, 'paid', `${p.kind || 'job'} ${how}`)
  const job = await q.get('SELECT title FROM jobs WHERE id = ?', p.job_id)
  const [payer, payee] = await Promise.all([getUserById(p.payer_id), getUserById(p.payee_id)])
  const total = money(Number(p.amount) + Number(p.fee), p.currency)
  const amount = money(Number(p.amount), p.currency)
  const what = `“${job?.title || 'your job'}”${KIND_LABEL[p.kind] || ''}`
  await sendTo(p.payer_id, noticeEmail({
    subject: `Receipt: ${total} for ${what}`, name: payer?.name, heading: 'Payment sent',
    paragraphs: [`You paid ${total} for ${what}. ${payee?.name || 'The worker'} receives the full ${amount}; the rest is the card processing fee.`],
    callout: { label: 'Reference', text: reference || p.reference || p.id },
  }))
  await sendTo(p.payee_id, noticeEmail({
    subject: `You’ve been paid ${amount}`, name: payee?.name, heading: 'You’ve been paid',
    paragraphs: [`${payer?.name || 'The poster'} paid ${amount} for ${what}. Paystack sends it to your bank account on its next payout, usually the next working day.`],
  }))
  return true
}

async function markDue(p, failure) {
  // Each failure counts as a try; the card is tried again later by itself
  // (a day, then two days), unless that was the last try.
  const attempts = (p.attempts || 0) + 1
  const nextTry = attempts < MAX_ATTEMPTS ? now() + RETRY_AFTER[Math.min(attempts - 1, RETRY_AFTER.length - 1)] : null
  const r = await q.run("UPDATE job_payments SET status = 'due', failure = ?, was_due = 1, attempts = ?, next_try_at = ? WHERE id = ? AND status IN ('charging', 'pending', 'awaiting')",
    String(failure || '').slice(0, 200), attempts, nextTry, p.id)
  if (!r.changes) return
  await logEvent(null, p.job_id, 'charge_failed', String(failure || '').slice(0, 120))
  const job = await q.get('SELECT title FROM jobs WHERE id = ?', p.job_id)
  const [payer, payee] = await Promise.all([getUserById(p.payer_id), getUserById(p.payee_id)])
  const what = `“${job?.title || 'your job'}”${KIND_LABEL[p.kind] || ''}`
  await sendTo(p.payer_id, noticeEmail({
    subject: 'Your VOIDAJ job payment didn’t go through', name: payer?.name, heading: 'Payment didn’t go through',
    paragraphs: [
      `We couldn’t charge your saved card for ${what}. Open the job on VOIDAJ and use Pay another way, or make sure the card has enough money.`,
      nextTry ? `We’ll try your card again on ${fmtWhen(nextTry)}.` : 'We won’t try the card again.',
      'You can’t hire anyone new on VOIDAJ until this is paid.',
    ],
    callout: failure ? { label: 'What the bank said', text: String(failure).slice(0, 200) } : undefined,
  }))
  await sendTo(p.payee_id, noticeEmail({
    subject: `Your payment for “${job?.title || 'the job'}” is delayed`, name: payee?.name, heading: 'Payment delayed',
    paragraphs: [`${payer?.name || 'The poster'}’s card didn’t go through for ${what}. They’ve been asked to pay another way${nextTry ? ', and we’ll try the card again' : ''}. They can’t hire anyone else on VOIDAJ until you’re paid. If it isn’t sorted, report a problem on the job and the VOIDAJ team will follow it up.`],
  }))
}

// Charge the poster's saved card, split straight to the worker. Only one
// attempt can run at a time for a payment: the status flips to 'charging'
// first, and anyone who loses that race stops. Returns the payment row.
export async function chargeSavedCard(paymentId, how = 'card') {
  const claimed = await q.run("UPDATE job_payments SET status = 'charging' WHERE id = ? AND status IN ('awaiting', 'due', 'pending')", paymentId)
  const row = () => q.get('SELECT * FROM job_payments WHERE id = ?', paymentId)
  if (!claimed.changes) return row()
  const p = await row()
  const [card, payout] = await Promise.all([cardOf(p.payer_id), payoutOf(p.payee_id)])
  if (!card) { await markDue(p, 'There is no saved card.'); return row() }
  if (!payout) { await markDue(p, 'The worker hasn’t added a bank account yet.'); return row() }
  const reference = uid('vjp')
  await q.run('UPDATE job_payments SET reference = ? WHERE id = ?', reference, p.id)
  try {
    const d = await paystack('/transaction/charge_authorization', {
      method: 'POST',
      body: {
        authorization_code: card.authorization_code, email: card.email, amount: Number(p.amount) + Number(p.fee), currency: p.currency, reference,
        subaccount: payout.subaccount_code, transaction_charge: Number(p.fee), bearer: 'account',
        metadata: { purpose: 'job', kind: p.kind || 'job', jobId: p.job_id, paymentId: p.id },
      },
    })
    if (d?.status === 'success') await markPaid(p, reference, how)
    else await markDue(p, d?.gateway_response || 'The card needs another check. Use Pay another way.')
  } catch (e) {
    await markDue(p, e.message)
  }
  return row()
}

// A charge other than the job itself (the up-front part, a cancellation
// fee), made straight away.
export async function chargeExtra(job, kind, amount) {
  const id = uid('jp')
  await q.run(`INSERT INTO job_payments (id, job_id, payer_id, payee_id, amount, fee, currency, status, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, job.id, job.poster_id, job.worker_id, amount, feeFor(amount), String(job.currency || 'NGN').toUpperCase(), 'pending', kind, now())
  return chargeSavedCard(id)
}

// Called when a payable job is marked completed (server/jobs-flow.js).
// The poster marking it done is their go-ahead to charge; the worker
// marking it done waits for the poster (or 48 hours). What's charged is the
// price less any part already paid up front.
export async function startJobPayment(job, agreement, byRole, { amount: override } = {}) {
  if (!agreement?.amount || await paymentFor(job.id)) return paymentFor(job.id)
  const upfront = (await extrasFor(job.id)).find((x) => x.kind === 'upfront')
  // An up-front part that never went through is folded into the final charge.
  if (upfront && upfront.status !== 'paid') await q.run("UPDATE job_payments SET status = 'cancelled' WHERE id = ? AND status IN ('due', 'pending', 'awaiting')", upfront.id)
  const amount = override ?? (Number(agreement.amount) - (upfront?.status === 'paid' ? Number(upfront.amount) : 0))
  if (amount <= 0) return null
  const id = uid('jp')
  await q.run(`INSERT INTO job_payments (id, job_id, payer_id, payee_id, amount, fee, currency, status, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, job.id, job.poster_id, job.worker_id, amount, feeFor(amount), agreement.currency || 'NGN', byRole === 'worker' ? 'awaiting' : 'pending', 'job', now())
  if (byRole !== 'worker') return chargeSavedCard(id, byRole === 'team' ? 'team' : 'card')
  const [worker, poster] = await Promise.all([getUserById(job.worker_id), getUserById(job.poster_id)])
  await sendTo(job.poster_id, noticeEmail({
    subject: `${worker?.name || 'Your worker'} marked “${job.title}” as done`, name: poster?.name, heading: 'Confirm the job is done',
    paragraphs: [
      `${worker?.name || 'Your worker'} marked “${job.title}” as completed. Open the job on VOIDAJ to confirm and pay, ask for changes, or report a problem.`,
      `If you do none of those by ${fmtWhen(now() + CONFIRM_MS)}, your saved card is charged automatically.`,
    ],
  }))
  return paymentFor(job.id)
}

// Nothing more is owed on a job (cancelled, or a dispute decided that way).
// Money already paid stays paid.
export const cancelJobPayment = (jobId) =>
  q.run("UPDATE job_payments SET status = 'cancelled', next_try_at = NULL WHERE job_id = ? AND status IN ('awaiting', 'due', 'pending')", jobId)

// The unpaid charge on a job the poster is paying: the one asked for, or
// the first that's waiting.
async function payableRow(jobId, paymentId) {
  if (paymentId) return q.get("SELECT * FROM job_payments WHERE id = ? AND job_id = ? AND status <> 'reopened'", String(paymentId).slice(0, 80), jobId)
  return (await q.get("SELECT * FROM job_payments WHERE job_id = ? AND status IN ('awaiting', 'due') ORDER BY (status = 'due') DESC, created_at LIMIT 1", jobId)) || paymentFor(jobId)
}

// A hosted Paystack checkout for a payment the saved card couldn't cover.
async function checkoutFor(req, p) {
  const payout = await payoutOf(p.payee_id)
  if (!payout) throw Object.assign(new Error('The worker hasn’t added a bank account yet.'), { status: 400 })
  const payer = await getUserById(p.payer_id)
  if (!payer?.email) throw Object.assign(new Error('Add an email address to your account first.'), { status: 400 })
  const reference = uid('vjp')
  await q.run('UPDATE job_payments SET reference = ? WHERE id = ?', reference, p.id)
  const d = await paystack('/transaction/initialize', {
    method: 'POST',
    body: {
      email: payer.email, amount: Number(p.amount) + Number(p.fee), currency: p.currency, reference,
      subaccount: payout.subaccount_code, transaction_charge: Number(p.fee), bearer: 'account',
      callback_url: `${baseUrl(req)}/jobs?job=${encodeURIComponent(p.job_id)}&paystack=pay`,
      metadata: { purpose: 'job', jobId: p.job_id, paymentId: p.id },
    },
  })
  return d.authorization_url
}

// Settle a reference that came back from Paystack (the browser returning,
// or the webhook). Always re-checked with Paystack, never trusted as sent.
async function settle(reference, data) {
  const setup = await q.get('SELECT * FROM payment_setups WHERE reference = ?', reference)
  if (setup) {
    if (setup.done_at) return { kind: 'card', userId: setup.user_id, ok: true }
    if (data?.status !== 'success' || Number(data.amount) !== CARD_CHECK) return { kind: 'card', userId: setup.user_id, ok: false }
    const saved = await saveCard(setup.user_id, data)
    const done = await q.run('UPDATE payment_setups SET done_at = ? WHERE reference = ? AND done_at IS NULL', now(), reference)
    // The ₦50 check goes back to the card.
    if (done.changes) paystack('/refund', { method: 'POST', body: { transaction: reference } }).catch(() => {})
    return { kind: 'card', userId: setup.user_id, ok: saved, jobId: setup.job_id }
  }
  const p = await q.get('SELECT * FROM job_payments WHERE reference = ?', reference)
  if (p) {
    const ok = data?.status === 'success' && Number(data.amount) === Number(p.amount) + Number(p.fee) && String(data.currency || p.currency).toUpperCase() === p.currency
    if (ok) await markPaid(p, reference, 'checkout')
    return { kind: 'job', userId: p.payer_id, ok, jobId: p.job_id }
  }
  return { kind: 'unknown', ok: false }
}

// ── Routes ───────────────────────────────────────────────────────────
let banksCache = null
export function paymentRoutes(app) {
  const on = (_req, res, next) => (paymentsReady() ? next() : err(res, 503, 'Payments aren’t switched on yet.'))

  // Public: whether paid jobs go through VOIDAJ, so listings say the right thing.
  app.get('/api/payments/config', (_req, res) => res.json({ enabled: paymentsReady(), currencies: payableCurrencies() }))
  app.get('/api/payments/me', requireAuth, async (req, res) => res.json(await mine(req.userId)))

  // What the poster will pay for an agreed price, fee included.
  app.get('/api/payments/quote', on, (req, res) => {
    const amount = parseAmount(req.query.price)
    if (amount == null) return err(res, 400, 'Enter the price as a number, like 15,000.')
    const fee = feeFor(amount)
    const currency = String(req.query.currency || 'NGN').toUpperCase()
    res.json({ amount, fee, total: amount + fee, currency, label: { amount: money(amount, currency), fee: money(fee, currency), total: money(amount + fee, currency) } })
  })

  app.get('/api/payments/banks', requireAuth, on, async (_req, res) => {
    if (!banksCache) {
      try {
        const list = await paystack('/bank?country=nigeria&currency=NGN&perPage=200')
        banksCache = list.filter((b) => b.active !== false && !b.is_deleted).map((b) => ({ code: b.code, name: b.name }))
      } catch (e) { return err(res, 502, e.message) }
    }
    res.json({ banks: banksCache })
  })

  // A worker's bank account → a Paystack subaccount that takes 0% for VOIDAJ.
  // Two steps, so a stolen password isn't enough to redirect someone's pay:
  // the account is checked with the bank and a code goes to the member's
  // email; once the code is in, a first account works straight away, and a
  // change takes effect 24 hours later (payments keep going to the old one
  // meanwhile, and the change can be cancelled).
  app.post('/api/payments/payout', requireAuth, on, async (req, res) => {
    const bankCode = String(req.body?.bankCode || '').trim().slice(0, 20)
    const accountNumber = String(req.body?.accountNumber || '').replace(/\s/g, '')
    if (!bankCode) return err(res, 400, 'Pick your bank.')
    if (!/^\d{10}$/.test(accountNumber)) return err(res, 400, 'Account numbers are 10 digits.')
    if (!req.userRow.email) return err(res, 400, 'Add an email address to your account first.')
    if (await guard.over(`payout:${req.userId}`, { max: 5, windowMs: HOUR })) return err(res, 429, 'Too many tries. Wait an hour and try again.')
    await guard.record(`payout:${req.userId}`)
    let resolved
    try { resolved = await paystack(`/bank/resolve?account_number=${accountNumber}&bank_code=${encodeURIComponent(bankCode)}`) } catch {
      return err(res, 400, 'We couldn’t find that account. Check the number and the bank.')
    }
    const bankName = (banksCache || []).find((b) => b.code === bankCode)?.name || ''
    await q.run('UPDATE payout_changes SET cancelled_at = ? WHERE user_id = ? AND confirmed_at IS NULL AND cancelled_at IS NULL', now(), req.userId)
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    await q.run(`INSERT INTO payout_changes (id, user_id, bank_code, bank_name, account_name, last4, account_number, account_hash, code_hash, code_expires, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid('poc'), req.userId, bankCode, bankName, resolved.account_name || '', accountNumber.slice(-4), accountNumber, accountHash(bankCode, accountNumber), hashCode(code), now() + CODE_MS, now())
    if (!guard.emailReady() && process.env.NODE_ENV !== 'test') console.log(`[email] payout code for ${req.userRow.email}: ${code}`)
    await sendTo(req.userId, noticeEmail({
      subject: `${code} is your code to confirm your bank account`, name: req.userRow.name, heading: 'Confirm where you get paid',
      preheader: `Your VOIDAJ code is ${code}`,
      paragraphs: [
        `Enter this code on VOIDAJ to have job payments sent to ${bankName || 'your bank'} account ••${accountNumber.slice(-4)} (${resolved.account_name || 'no name given'}). It works for 30 minutes.`,
        'If you didn’t ask for this, don’t share the code with anyone. Someone may know your password: change it in Settings → Account.',
      ],
      callout: { label: 'Your code', text: `${code.slice(0, 3)} ${code.slice(3)}` },
    }))
    res.json(await mine(req.userId))
  })

  app.post('/api/payments/payout/confirm', requireAuth, on, async (req, res) => {
    const c = await q.get(`SELECT * FROM payout_changes WHERE user_id = ? AND confirmed_at IS NULL AND cancelled_at IS NULL ORDER BY created_at DESC LIMIT 1`, req.userId)
    if (!c || Number(c.code_expires) < now()) return err(res, 400, 'That code has expired. Enter your bank details again for a new one.')
    if ((c.tries || 0) >= 5) return err(res, 400, 'Too many wrong codes. Enter your bank details again for a new one.')
    if (hashCode(String(req.body?.code || '').replace(/\D/g, '')) !== c.code_hash) {
      await q.run('UPDATE payout_changes SET tries = COALESCE(tries, 0) + 1 WHERE id = ?', c.id)
      return err(res, 400, 'That code isn’t right. Check the email and try again.')
    }
    // Always a fresh subaccount: the old one keeps receiving until the
    // change takes effect, then it's switched off.
    let sub
    try {
      sub = await paystack('/subaccount', {
        method: 'POST',
        body: { business_name: String(req.userRow.name || c.account_name).slice(0, 100), settlement_bank: c.bank_code, bank_code: c.bank_code, account_number: c.account_number, percentage_charge: 0, description: `VOIDAJ worker ${req.userId}` },
      })
    } catch (e) { return err(res, 502, e.message) }
    const existing = await payoutOf(req.userId)
    const effective = existing ? now() + PAYOUT_DELAY_MS : now()
    await q.run('UPDATE payout_changes SET confirmed_at = ?, effective_at = ?, subaccount_code = ?, code_hash = NULL, account_number = NULL WHERE id = ?',
      now(), effective, sub?.subaccount_code, c.id)
    const change = { ...c, subaccount_code: sub?.subaccount_code, effective_at: effective }
    if (!existing) await applyChange(change)
    else {
      await sendTo(req.userId, noticeEmail({
        subject: 'Your VOIDAJ payout account is changing', name: req.userRow.name, heading: 'Your payout account is changing',
        paragraphs: [
          `From ${fmtWhen(effective)}, your VOIDAJ job payments will go to ${c.bank_name || 'your new bank'} account ••${c.last4}. Until then they keep going to ${existing.bank_name || 'your current bank'} ••${existing.last4}.`,
          'If this wasn’t you, open Settings → Payments on VOIDAJ, cancel the change, and change your password.',
        ],
      }))
    }
    // Worth a look for the team: an account already paid into for someone
    // else, or a name on the account that shares nothing with the member's.
    const twin = await q.get('SELECT user_id FROM payout_accounts WHERE account_hash = ? AND user_id <> ? LIMIT 1', c.account_hash, req.userId)
    if (twin) await raiseFlag({ userId: req.userId, otherId: twin.user_id, kind: 'shared_bank', detail: 'This bank account is also the payout account of another VOIDAJ account.' })
    const words = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3)
    if (c.account_name && !words(c.account_name).some((w) => words(req.userRow.name).includes(w))) {
      await raiseFlag({ userId: req.userId, kind: 'name_mismatch', detail: `Payout account name “${c.account_name}” doesn’t match the profile name.` })
    }
    res.json(await mine(req.userId))
  })

  app.post('/api/payments/payout/cancel', requireAuth, async (req, res) => {
    await q.run('UPDATE payout_changes SET cancelled_at = ?, account_number = NULL WHERE user_id = ? AND applied_at IS NULL AND cancelled_at IS NULL', now(), req.userId)
    res.json(await mine(req.userId))
  })

  // Save a card: a ₦50 card-only checkout, refunded once it's confirmed.
  // Limited per person and per connection, because fraudsters use small
  // checks like this to test stolen cards.
  app.post('/api/payments/card', requireAuth, on, async (req, res) => {
    if (!req.userRow.email) return err(res, 400, 'Add an email address to your account first.')
    const ip = guard.ipOf(req)
    if (await guard.over(`card:${req.userId}`, { max: 5, windowMs: 24 * HOUR }) || await guard.over(`card-ip:${ip}`, { max: 10, windowMs: 24 * HOUR })) {
      return err(res, 429, 'Too many cards tried today. Try again tomorrow, or contact us.')
    }
    await guard.record(`card:${req.userId}`)
    await guard.record(`card-ip:${ip}`)
    const jobId = req.body?.jobId ? String(req.body.jobId).slice(0, 80) : null
    const reference = uid('vjc')
    await q.run('INSERT INTO payment_setups (reference, user_id, purpose, job_id, created_at) VALUES (?, ?, ?, ?, ?)', reference, req.userId, 'card', jobId, now())
    const back = jobId ? `/jobs?job=${encodeURIComponent(jobId)}&paystack=card` : '/settings/payments?paystack=card'
    try {
      const d = await paystack('/transaction/initialize', {
        method: 'POST',
        body: { email: req.userRow.email, amount: CARD_CHECK, currency: 'NGN', reference, channels: ['card'], callback_url: baseUrl(req) + back, metadata: { purpose: 'card', userId: req.userId } },
      })
      res.json({ url: d.authorization_url })
    } catch (e) { err(res, 502, e.message) }
  })

  // The card stays from the hire until the job is paid: it can be replaced
  // with another card, but not removed.
  app.delete('/api/payments/card', requireAuth, async (req, res) => {
    const busy = await q.get(`SELECT 1 FROM job_payments WHERE payer_id = ? AND status IN ('awaiting', 'pending', 'charging', 'due') LIMIT 1`, req.userId)
      || await q.get(`SELECT 1 FROM jobs j JOIN job_agreements a ON a.job_id = j.id WHERE j.poster_id = ? AND a.amount IS NOT NULL
        AND j.status IN ('selected', 'in_progress', 'disputed') LIMIT 1`, req.userId)
    if (busy) return err(res, 400, 'You’ve hired someone with this card. It stays until that job is paid. You can replace it with another card.')
    await q.run('DELETE FROM payment_cards WHERE user_id = ?', req.userId)
    res.json(await mine(req.userId))
  })

  // The browser coming back from Paystack with ?reference=…
  app.post('/api/payments/verify', requireAuth, on, async (req, res) => {
    const reference = String(req.body?.reference || '').slice(0, 80)
    const setup = await q.get('SELECT user_id FROM payment_setups WHERE reference = ?', reference)
    const pay = setup ? null : await q.get('SELECT payer_id FROM job_payments WHERE reference = ?', reference)
    if ((setup?.user_id || pay?.payer_id) !== req.userId) return err(res, 404, 'Payment not found.')
    let data
    try { data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`) } catch (e) { return err(res, 502, e.message) }
    const out = await settle(reference, data)
    res.json({ ...out, ...(await mine(req.userId)) })
  })

  // The poster's "Confirm and pay" after the worker marked the job done,
  // or "Try my card again" after a failure (of the job's charge, or of the
  // up-front part or a cancellation fee: body.paymentId).
  app.post('/api/jobs/:id/payment/charge', requireAuth, on, async (req, res) => {
    const jobId = String(req.params.id).slice(0, 80)
    const p = await payableRow(jobId, req.body?.paymentId)
    if (!p) return err(res, 404, 'There’s nothing to pay on this job.')
    if (p.payer_id !== req.userId) return err(res, 403, 'Only the person who hired can pay.')
    if (!['awaiting', 'due'].includes(p.status)) return err(res, 400, p.status === 'paid' ? 'This job is already paid.' : 'A payment is already going through.')
    if (await q.get("SELECT 1 FROM job_disputes WHERE job_id = ? AND status = 'open'", p.job_id)) return err(res, 400, 'There’s an open problem report on this job. The VOIDAJ team will sort it out first.')
    if (p.status === 'awaiting') await logEvent(req, jobId, 'confirmed_done')
    res.json({ payment: paymentView(await chargeSavedCard(p.id, p.status === 'awaiting' ? 'confirmed' : 'card')) })
  })

  // "Pay another way", when the saved card didn't work.
  app.post('/api/jobs/:id/payment/checkout', requireAuth, on, async (req, res) => {
    const p = await payableRow(String(req.params.id).slice(0, 80), req.body?.paymentId)
    if (!p) return err(res, 404, 'There’s nothing to pay on this job.')
    if (p.payer_id !== req.userId) return err(res, 403, 'Only the person who hired can pay.')
    if (!['awaiting', 'due'].includes(p.status)) return err(res, 400, p.status === 'paid' ? 'This job is already paid.' : 'A payment is already going through.')
    try { res.json({ url: await checkoutFor(req, p) }) } catch (e) { err(res, e.status === 400 ? 400 : 502, e.message) }
  })

  // Paystack's webhook. Signed with the secret key; the same event can
  // arrive more than once, which settle() shrugs off.
  app.post('/api/paystack/webhook', async (req, res) => {
    if (!signatureOk(req.rawBody, req.get('x-paystack-signature'))) return res.status(401).end()
    const { event, data } = req.body || {}
    try {
      if (event === 'charge.success' && data?.reference) await settle(String(data.reference), data)
      // A poster disputed a charge with their bank (a chargeback). Paystack
      // takes it back from VOIDAJ's balance, not the worker's, so the team
      // needs to answer it with the job's record, and the poster can't hire
      // again until it's settled.
      if (String(event || '').startsWith('charge.dispute.')) await chargeback(event, data)
    } catch (e) { console.error('[paystack] webhook', e.message) }
    res.status(200).json({ ok: true })
  })

  // Hourly (.github/workflows/payments-cron.yml, with a daily backup in
  // vercel.json):
  //   - charge jobs the worker marked done that the poster didn't confirm,
  //     send back or report within 48 hours;
  //   - remind the poster 24 hours and 4 hours before that happens;
  //   - try failed cards again when their retry time comes.
  app.get('/api/cron/payments', async (req, res) => {
    if (!env('CRON_SECRET') || req.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return res.status(401).end()
    if (!paymentsReady()) return res.json({ charged: 0, reminded: 0, retried: 0 })
    const noDispute = "NOT EXISTS (SELECT 1 FROM job_disputes d WHERE d.job_id = p.job_id AND d.status = 'open')"
    const due = await q.all(`SELECT p.id FROM job_payments p WHERE p.status = 'awaiting' AND p.created_at < ? AND ${noDispute} LIMIT 50`, now() - CONFIRM_MS)
    for (const { id } of due) await chargeSavedCard(id, 'auto')

    let reminded = 0
    const waiting = await q.all(`SELECT p.* FROM job_payments p WHERE p.status = 'awaiting' AND p.created_at < ? AND ${noDispute} LIMIT 200`, now() - CONFIRM_MS + 24 * HOUR)
    for (const p of waiting) {
      const left = Number(p.created_at) + CONFIRM_MS - now()
      const bit = left <= 4 * HOUR ? 2 : 1
      const r = await q.run('UPDATE job_payments SET reminded = COALESCE(reminded, 0) | ? WHERE id = ? AND (COALESCE(reminded, 0) & ?) = 0', bit | 1, p.id, bit)
      if (!r.changes) continue
      reminded++
      const job = await q.get('SELECT title FROM jobs WHERE id = ?', p.job_id)
      const poster = await getUserById(p.payer_id)
      await sendTo(p.payer_id, noticeEmail({
        subject: `Reminder: “${job?.title || 'your job'}” will be paid ${bit === 2 ? 'in a few hours' : 'tomorrow'}`, name: poster?.name, heading: 'Check the job, then confirm',
        paragraphs: [
          `The worker marked “${job?.title || 'your job'}” as done. Your saved card is charged ${money(Number(p.amount) + Number(p.fee), p.currency)} on ${fmtWhen(Number(p.created_at) + CONFIRM_MS)}.`,
          'If something isn’t right, open the job on VOIDAJ before then and ask for changes or report a problem.',
        ],
      }))
    }

    const retry = await q.all(`SELECT p.id FROM job_payments p WHERE p.status = 'due' AND p.next_try_at IS NOT NULL AND p.next_try_at <= ?
      AND COALESCE(p.attempts, 0) < ? AND ${noDispute} LIMIT 50`, now(), MAX_ATTEMPTS)
    for (const { id } of retry) await chargeSavedCard(id, 'retry')
    // A job's record (who did what, from which internet address) is kept a
    // year, long enough to answer a bank chargeback, then deleted.
    await q.run('DELETE FROM job_events WHERE at < ?', now() - 365 * 24 * HOUR).catch(() => {})
    res.json({ charged: due.length, reminded, retried: retry.length })
  })
}

async function chargeback(event, data) {
  const ref = data?.transaction?.reference || data?.transaction_reference || data?.reference
  const p = ref && await q.get('SELECT * FROM job_payments WHERE reference = ?', String(ref))
  if (!p) return
  const open = event !== 'charge.dispute.resolve'
  await q.run('UPDATE job_payments SET chargeback_at = COALESCE(chargeback_at, ?), chargeback_status = ? WHERE id = ?',
    now(), open ? 'open' : `resolved:${String(data?.resolution || data?.status || '').slice(0, 40)}`, p.id)
  await logEvent(null, p.job_id, open ? 'chargeback' : 'chargeback_resolved', String(data?.resolution || data?.status || '').slice(0, 60))
  if (event !== 'charge.dispute.create') return
  await raiseFlag({ userId: p.payer_id, otherId: p.payee_id, jobId: p.job_id, kind: 'chargeback', detail: `The cardholder disputed ${money(Number(p.amount) + Number(p.fee), p.currency)} with their bank. Answer it in the Paystack dashboard with this job’s record.` })
  guard.sendMail(teamEmail(), `Chargeback on job ${p.job_id}`,
    `A card payment on VOIDAJ was disputed with the bank (reference ${ref}). Paystack will take it from the main balance unless it's answered.\n\nOpen Admin → Job disputes → Payment checks, then answer it in the Paystack dashboard with the job's record (Admin → the job → Record).`).catch(() => {})
}
