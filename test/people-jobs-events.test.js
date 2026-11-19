import { describe, it, expect } from 'vitest'
import { signUp } from './helpers.js'

describe('connections', () => {
  // Idea #3
  it('does not let you connect to yourself', async () => {
    const { agent, user } = await signUp()
    const res = await agent.post(`/api/users/${user.id}/connect`)
    expect(res.status).toBe(400)
  })

  it('connects to someone else, and tapping again removes the connection', async () => {
    const { agent } = await signUp('Me')
    const { user: other } = await signUp('Other')

    let res = await agent.post(`/api/users/${other.id}/connect`)
    expect(res.body.user.connections).toContain(other.id)
    res = await agent.post(`/api/users/${other.id}/connect`)
    expect(res.body.user.connections).not.toContain(other.id)
  })
})

describe('quick jobs', () => {
  // Idea #9
  it('only shows the list of offers to the person who posted the job', async () => {
    const { agent: poster } = await signUp('Poster')
    const { agent: worker } = await signUp('Worker')
    const { agent: stranger } = await signUp('Stranger')

    const job = (await poster.post('/api/jobs').send({ title: 'Fix my sink', category: 'Plumbing' })).body.job
    const offer = await worker.post(`/api/jobs/${job.id}/offer`).send({ offer: '15000', note: 'Can come today' })
    expect(offer.body.job.myOffer).toBe('15000')

    const seenBy = async (agent) => (await agent.get('/api/jobs')).body.jobs.find((j) => j.id === job.id)
    const posterView = await seenBy(poster)
    expect(posterView.offers).toHaveLength(1)
    expect(posterView.offers[0]).toMatchObject({ offer: '15000', note: 'Can come today' })

    // Everyone else sees only the count, never who offered or how much.
    const strangerView = await seenBy(stranger)
    expect(strangerView.offers).toBeUndefined()
    expect(strangerView.offerCount).toBe(1)
  })

  it('does not let you make an offer on your own job', async () => {
    const { agent: poster } = await signUp('Poster')
    const job = (await poster.post('/api/jobs').send({ title: 'Paint a wall', category: 'Painting' })).body.job
    const res = await poster.post(`/api/jobs/${job.id}/offer`).send({ offer: '5000' })
    expect(res.status).toBe(400)
  })
})

describe('events', () => {
  // Idea #10
  it('lists you as going after you RSVP, and removes you when you RSVP again', async () => {
    const { agent: host } = await signUp('Host')
    const { agent: guest, user: guestUser } = await signUp('Guest')
    const event = (await host.post('/api/events').send({ title: 'Lagos Tech Meetup', date: '2027-01-15' })).body.event

    const going = async () => (await guest.get(`/api/events/${event.id}/people`)).body.going.map((u) => u.id)

    expect((await guest.post(`/api/events/${event.id}/rsvp`)).body.going).toBe(true)
    expect(await going()).toContain(guestUser.id)

    expect((await guest.post(`/api/events/${event.id}/rsvp`)).body.going).toBe(false)
    expect(await going()).not.toContain(guestUser.id)
  })

  // Nuel's Events notes, Nov 9: attendance is private unless you choose to show it.
  it('keeps attendees off the public list unless they choose to be seen', async () => {
    const { agent: host } = await signUp('Host')
    const { agent: guest, user: guestUser } = await signUp('Quiet Guest')
    const { agent: other } = await signUp('Onlooker')
    const event = (await host.post('/api/events').send({ title: 'Private-ish dinner', date: '2027-02-01', category: 'food', format: 'hybrid' })).body.event
    expect(event).toMatchObject({ category: 'food', format: 'hybrid' })

    await guest.post(`/api/events/${event.id}/rsvp`)
    const seen = async () => (await other.get(`/api/events/${event.id}/people`)).body
    expect((await seen()).going.map((u) => u.id)).not.toContain(guestUser.id)
    expect((await seen()).hiddenGoing).toBe(1)

    await guest.post(`/api/events/${event.id}/rsvp`).send({ visible: true, visibleOnly: true })
    expect((await seen()).going.map((u) => u.id)).toContain(guestUser.id)
  })

  it('records Interested separately from Going', async () => {
    const { agent: host } = await signUp('Host')
    const { agent: guest } = await signUp('Maybe')
    const event = (await host.post('/api/events').send({ title: 'Maybe meetup', date: '2027-03-01' })).body.event
    expect((await guest.post(`/api/events/${event.id}/rsvp`).send({ status: 'interested' })).body.status).toBe('interested')
    const rsvps = (await guest.get('/api/rsvps')).body
    expect(rsvps.status[event.id]).toBe('interested')
    expect(rsvps.mine).not.toContain(event.id)
    expect(rsvps.interested[event.id]).toBe(1)
  })

  it('waitlists people once an event is full and moves them up when a place opens', async () => {
    const { agent: host } = await signUp('Host')
    const { agent: first } = await signUp('First')
    const { agent: second } = await signUp('Second')
    const event = (await host.post('/api/events').send({ title: 'Tiny workshop', date: '2027-04-01', capacity: 1 })).body.event
    expect((await first.post(`/api/events/${event.id}/rsvp`)).body.status).toBe('going')
    expect((await second.post(`/api/events/${event.id}/rsvp`)).body.status).toBe('waitlist')
    await first.post(`/api/events/${event.id}/rsvp`) // gives up the place
    expect((await second.get('/api/rsvps')).body.status[event.id]).toBe('going')
  })

  it('takes a report on an event', async () => {
    const { agent } = await signUp()
    expect((await agent.post('/api/events/ev-pitch-night/report').send({ reason: 'Spam' })).status).toBe(200)
  })

  it('rejects an event without a valid date', async () => {
    const { agent } = await signUp()
    const res = await agent.post('/api/events').send({ title: 'No date party', date: 'next friday' })
    expect(res.status).toBe(400)
  })
})

describe('jobs and services', () => {
  // Nuel's Jobs & Services notes, Nov 12.
  it('posts a volunteer service with no price and a skill exchange that says what it wants back', async () => {
    const { agent } = await signUp('Helper')
    const service = (await agent.post('/api/jobs').send({ title: 'Free maths tutoring', category: 'Tutoring', kind: 'service', opportunity: 'volunteer', arrangement: 'hybrid', budget: '₦5,000' })).body.job
    expect(service).toMatchObject({ kind: 'service', opportunity: 'volunteer', arrangement: 'hybrid', budget: '', openToOffers: false, remote: true })

    const missing = await agent.post('/api/jobs').send({ title: 'Swap skills', category: 'Design', opportunity: 'exchange' })
    expect(missing.status).toBe(400)
    const swap = (await agent.post('/api/jobs').send({ title: 'Swap skills', category: 'Design', opportunity: 'exchange', exchange: 'Logo design for a website' })).body.job
    expect(swap).toMatchObject({ kind: 'job', opportunity: 'exchange', exchange: 'Logo design for a website', arrangement: 'local' })
  })
})
