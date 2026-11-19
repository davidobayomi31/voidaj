// Welcome to VOIDAJ — seven short steps, one question each, from Nuel's
// onboarding plan (Oct 14, DO-LATER.md) and his Nov 18 ask: "I want this
// redesigned also with new prompt questions". Why you're here, what kind of
// profile, where you are (and who sees it), what you're into, how you want
// to take part, and a last check on safety. Every answer goes on the
// profile, and the starting map at the end says which answer it came from.
// Anything skipped gets a sensible default, and all of it can be changed
// in Settings later.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../state.jsx'
import { TAGS, JOB_CATEGORIES } from '../data/seed.js'
import { extractTags, tagLabel, matchCommunities, matchPeople, matchEvents } from '../ai.js'
import { Icon, IconTile } from '../components/Icons.jsx'
import { VoidajLockup } from '../components/VoidajMark.jsx'
import { CommunityCard, PersonCard, EventCard } from '../components/bits.jsx'
import { CITIES } from '../components/NigeriaMap.jsx'
import { COUNTRIES, flagOf } from '../countries.js'
import * as api from '../api.js'

const INTENTS = [
  { id: 'community', icon: 'community', label: 'Find my community', sub: 'People who care about what I care about' },
  { id: 'work', icon: 'briefcase', label: 'Find work or hire help', sub: 'Quick jobs, services and gigs' },
  { id: 'business', icon: 'store', label: 'Grow a business', sub: 'Get found by customers nearby' },
  { id: 'voice', icon: 'megaphone', label: 'Share my voice', sub: 'Post, create and be heard' },
  { id: 'meet', icon: 'users', label: 'Meet new people', sub: 'Friends, mentors, collaborators' },
  { id: 'nearby', icon: 'map-pin', label: 'See what’s happening nearby', sub: 'Events and news in my city' },
]
const TYPES = [
  { id: 'individual', icon: 'user', label: 'Just me', sub: 'A personal profile' },
  { id: 'creator', icon: 'sparkle', label: 'Creator or professional', sub: 'Show my work and skills' },
  { id: 'business', icon: 'store', label: 'Business or service provider', sub: 'Customers can find and contact me' },
  { id: 'organisation', icon: 'layers', label: 'Organisation or community leader', sub: 'Schools, churches, NGOs, clubs' },
]
const PRIVACY = [
  { id: 'exact', icon: 'map-pin', label: 'My area', sub: 'Your neighbourhood and city' },
  { id: 'city-only', icon: 'globe', label: 'Just my city', sub: 'The city, nothing closer' },
  { id: 'hidden', icon: 'lock', label: 'Hide it', sub: 'Nobody sees where I am' },
]
const EXTRA_INTERESTS = { faith: 'Faith', sport: 'Sport', education: 'Education', health: 'Health', travel: 'Travel', film: 'Film & TV', gaming: 'Gaming', parenting: 'Parenting' }
const INTEREST_CHOICES = [
  ...['tech', 'business', 'food', 'fashion', 'music', 'photography', 'art', 'fitness', 'farming', 'design', 'writing', 'learning', 'mentorship', 'sustainability'].filter((t) => TAGS[t]),
  ...Object.keys(EXTRA_INTERESTS),
]
const interestLabel = (t) => EXTRA_INTERESTS[t] || tagLabel(t)
const PARTICIPATE = [
  { id: 'join', icon: 'community', label: 'Join communities' },
  { id: 'post', icon: 'edit', label: 'Post and share' },
  { id: 'events', icon: 'calendar', label: 'Go to events' },
  { id: 'offer', icon: 'hand-coins', label: 'Offer my skills' },
  { id: 'hire', icon: 'briefcase', label: 'Hire for jobs' },
  { id: 'browse', icon: 'eye', label: 'Mostly look around for now' },
]
const MESSAGES = [
  { id: 'everyone', label: 'Anyone on VOIDAJ' },
  { id: 'connections', label: 'Only my connections' },
]

const STEPS = [
  { id: 'intent', q: (n) => `Welcome${n ? `, ${n}` : ''}! What brings you to VOIDAJ?`, hint: 'Pick as many as you like. This decides what you see first.' },
  { id: 'type', q: () => 'Which of these sounds most like you?', hint: 'It shapes how your profile looks to others.' },
  { id: 'username', q: () => 'Pick your username', hint: 'This is how people find and mention you. It’s one of a kind, and it’s in your link and VOIDAJ ID.' },
  { id: 'place', q: () => 'Where are you based?', hint: 'For things near you. You decide who sees it.' },
  { id: 'interests', q: () => 'What are you into?', hint: 'Tap a few, or say it in your own words.' },
  { id: 'part', q: () => 'How do you want to take part?', hint: 'Nothing’s locked in.' },
  { id: 'safety', q: () => 'Last thing: who can message you?', hint: 'You can change this any time in Settings.' },
]

function Choice({ on, icon, label, sub, onClick, multi }) {
  return (
    <button type="button" className={`ob-choice${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
      <IconTile name={icon} tone={on ? 'grad' : 'blue'} size={40} iconSize={18} />
      <span><b>{label}</b>{sub && <em>{sub}</em>}</span>
      <span className={`ob-tick${multi ? ' square' : ''}`}>{on && <Icon name="check" size={13} />}</span>
    </button>
  )
}

export default function Onboarding() {
  const { user, profile, loading, saveProfile, setAssistantOpen } = useApp()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/auth') }, [user, loading]) // eslint-disable-line

  const [i, setI] = useState(0)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [a, setA] = useState({
    intents: [], type: 'individual', country: '', city: '', area: '', privacy: 'city-only',
    interests: [], said: '', part: [], skills: [], messages: 'everyone', username: '',
  })
  // Whether the username typed is free: null = not checked, true/false = answer.
  const [uname, setUname] = useState({ ok: null, note: '' })
  // Start from the country they signed up with. The city starts empty: the
  // account's stored default is Lagos, which would be wrong for most of the
  // world, so it's asked rather than assumed (David, Nov 19).
  useEffect(() => { if (!a.country && (user?.country || profile?.country)) setA((x) => ({ ...x, country: user?.country || profile?.country })) }, [user?.country, profile?.country]) // eslint-disable-line
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }))
  // Start from the username made for them at sign-up (@grace, @grace_ojion…).
  const current = (profile?.handle || user?.handle || '').replace(/^@/, '')
  useEffect(() => { if (current && !a.username) setA((x) => ({ ...x, username: current })) }, [current]) // eslint-disable-line
  useEffect(() => {
    const h = a.username.trim().toLowerCase()
    if (!h || h === current.toLowerCase()) { setUname({ ok: h ? true : null, note: '' }); return }
    setUname({ ok: null, note: 'Checking…' })
    const t = setTimeout(() => {
      api.checkHandle(h).then((r) => setUname({ ok: r.available, note: r.available ? '' : r.reason || 'That one’s taken.' })).catch(() => setUname({ ok: null, note: '' }))
    }, 350)
    return () => clearTimeout(t)
  }, [a.username, current])
  const flip = (k, id) => setA((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((y) => y !== id) : [...x[k], id] }))

  const first = (profile?.name || user?.name || '').split(' ')[0]
  const step = STEPS[i]
  const canNext = { intent: a.intents.length > 0, type: !!a.type, username: uname.ok !== false && /^[a-z0-9_]{3,20}$/i.test(a.username.trim()), place: a.city.trim().length >= 2 && !!a.country, interests: true, part: a.part.length > 0, safety: true }[step.id]

  // Free text adds to the tapped interests.
  const tags = useMemo(() => [...new Set([...a.interests, ...extractTags(a.said)])], [a.interests, a.said])

  const finishSteps = async () => {
    setBusy(true)
    try {
      await saveProfile({
        city: a.city.trim(), country: a.country, area: a.area.trim(), privacy: a.privacy, profileType: a.type,
        ...(a.username.trim() && uname.ok === true && a.username.trim().toLowerCase() !== current.toLowerCase() ? { handle: a.username.trim().toLowerCase() } : {}),
        interests: tags,
        goals: INTENTS.filter((x) => a.intents.includes(x.id)).map((x) => x.label),
        ...(a.part.includes('offer') ? { jobSkills: a.skills } : {}),
        settings: { messages: a.messages },
        ...(a.said.trim() && !profile?.bio ? { bio: a.said.trim().slice(0, 200) } : {}),
        onboarded: true,
      })
    } catch { /* the reveal still shows; settings can be fixed later */ }
    setBusy(false)
    setDone(true)
  }
  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : finishSteps())
  const skip = () => {
    if (step.id === 'username') set('username', current) // keep the one made for them
    return i < STEPS.length - 1 ? setI(i + 1) : finishSteps()
  }

  const understood = tags.length > 0
  const forReveal = understood ? tags : ['community', 'networking']
  const because = understood ? undefined : `Popular on VOIDAJ right now. Tell the companion more and it’ll retune this`
  const enter = () => {
    setAssistantOpen(false)
    // Home leads with what they came for (DO-LATER.md, "After onboarding").
    navigate(a.intents[0] === 'work' ? '/jobs' : a.intents[0] === 'business' ? '/businesses' : a.intents[0] === 'nearby' ? '/events' : '/home')
  }

  return (
    <div className="onboarding ob2">
      <div className="onboarding-bg" aria-hidden="true" />
      <div className="ob-panel">
        <div className="onboarding-head">
          <Link to="/" className="brand small-brand"><VoidajLockup size={15} /></Link>
          {!done && <span className="ob-count">{i + 1} of {STEPS.length}</span>}
        </div>
        {!done && (
          <div className="ob-progress" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }}>
            {STEPS.map((s, n) => <span key={s.id} className={n <= i ? 'on' : ''} />)}
          </div>
        )}

        {!done ? (
          <div className="ob-step" key={step.id}>
            <h1>{step.q(first)}</h1>
            <p className="meta-dim">{step.hint}</p>

            {step.id === 'intent' && (
              <div className="ob-grid">
                {INTENTS.map((x) => <Choice key={x.id} multi {...x} on={a.intents.includes(x.id)} onClick={() => flip('intents', x.id)} />)}
              </div>
            )}

            {step.id === 'type' && (
              <div className="ob-grid">
                {TYPES.map((x) => <Choice key={x.id} {...x} on={a.type === x.id} onClick={() => set('type', x.id)} />)}
              </div>
            )}

            {step.id === 'username' && (
              <div className="ob-place">
                <label className="field"><span>Username</span>
                  <span className="settings-prefixed ob-handle"><span>@</span>
                    <input value={a.username} onChange={(e) => set('username', e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                      placeholder="yourname" maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="uname-note" autoFocus />
                  </span>
                </label>
                <p id="uname-note" className={`ob-uname ${uname.ok === true ? 'ok' : uname.ok === false ? 'bad' : ''}`}>
                  {uname.ok === true && a.username.trim().toLowerCase() === current.toLowerCase() && <><Icon name="check" size={13} /> This is yours: voidaj.com/u/{a.username.trim().toLowerCase()}</>}
                  {uname.ok === true && a.username.trim().toLowerCase() !== current.toLowerCase() && <><Icon name="check" size={13} /> @{a.username.trim().toLowerCase()} is free</>}
                  {uname.ok === false && <><Icon name="x" size={13} /> {uname.note}</>}
                  {uname.ok === null && (uname.note || 'Letters, numbers and underscores, 3 to 20 characters.')}
                </p>
                <p className="meta-dim">You can change it later in Settings.</p>
              </div>
            )}

            {step.id === 'place' && (
              <div className="ob-place">
                <div className="settings-row">
                  <label className="field"><span>Country</span>
                    <select value={a.country} onChange={(e) => set('country', e.target.value)} autoComplete="country">
                      {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flagOf(c.code)} {c.name}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>City or town</span>
                    <input value={a.city} onChange={(e) => set('city', e.target.value)} placeholder="Your city" maxLength={60}
                      list={a.country === 'NG' ? 'ob-ng-cities' : undefined} autoComplete="address-level2" autoFocus />
                    {a.country === 'NG' && <datalist id="ob-ng-cities">{CITIES.map((c) => <option key={c.id} value={c.name} />)}</datalist>}
                  </label>
                </div>
                <label className="field"><span>Your area (optional)</span>
                  <input value={a.area} onChange={(e) => set('area', e.target.value)} placeholder="A neighbourhood or district" maxLength={60} />
                </label>
                <span className="ob-sub">Who can see where you are?</span>
                <div className="ob-grid three">
                  {PRIVACY.map((x) => <Choice key={x.id} {...x} on={a.privacy === x.id} onClick={() => set('privacy', x.id)} />)}
                </div>
              </div>
            )}

            {step.id === 'interests' && (
              <>
                <div className="ob-pills">
                  {INTEREST_CHOICES.map((t) => (
                    <button key={t} type="button" className={a.interests.includes(t) ? 'on' : ''} aria-pressed={a.interests.includes(t)} onClick={() => flip('interests', t)}>
                      {a.interests.includes(t) && <Icon name="check" size={12} />} {interestLabel(t)}
                    </button>
                  ))}
                </div>
                <label className="field ob-said"><span>Or in your own words</span>
                  <textarea rows={2} value={a.said} onChange={(e) => set('said', e.target.value)} maxLength={300}
                    placeholder="e.g. I want to learn farming and meet people into sustainable agriculture" />
                </label>
                {tags.length > 0 && <p className="meta-dim ob-heard">I’m hearing: {tags.map(interestLabel).join(', ')}</p>}
              </>
            )}

            {step.id === 'part' && (
              <>
                <div className="ob-grid">
                  {PARTICIPATE.map((x) => <Choice key={x.id} multi {...x} on={a.part.includes(x.id)} onClick={() => flip('part', x.id)} />)}
                </div>
                {a.part.includes('offer') && (
                  <>
                    <span className="ob-sub">What kind of work can you do? We’ll tell you about jobs that match.</span>
                    <div className="ob-pills">
                      {JOB_CATEGORIES.map((c) => (
                        <button key={c.id} type="button" className={a.skills.includes(c.id) ? 'on' : ''} onClick={() => flip('skills', c.id)}>
                          <Icon name={c.icon} size={12} /> {c.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {step.id === 'safety' && (
              <>
                <div className="ob-grid">
                  {MESSAGES.map((x) => <Choice key={x.id} icon={x.id === 'everyone' ? 'message-circle' : 'user-check'} label={x.label} on={a.messages === x.id} onClick={() => set('messages', x.id)} />)}
                </div>
                <div className="ob-safety">
                  <span><Icon name="badge-check" size={15} /> Want the Verified tick? Send your ID in <b>Settings → Verification</b> whenever you’re ready.</span>
                  <span><Icon name="flag" size={15} /> See something wrong? Every post, person and event has <b>Report</b>.</span>
                  <span><Icon name="book" size={15} /> We all follow the <Link to="/terms">VOIDAJ Charter</Link>.</span>
                </div>
              </>
            )}

            <div className="ob-nav">
              {i > 0 ? <button type="button" className="btn ghost" onClick={() => setI(i - 1)}><Icon name="back" size={15} /> Back</button> : <span />}
              <span className="ob-nav-right">
                {step.id !== 'safety' && step.id !== 'place' && <button type="button" className="btn ghost" onClick={skip}>Skip</button>}
                <button type="button" className="btn primary" onClick={next} disabled={!canNext || busy}>
                  {busy ? 'Saving…' : i === STEPS.length - 1 ? 'Finish' : 'Next'} <Icon name="arrow" size={15} />
                </button>
              </span>
            </div>
          </div>
        ) : (
          <div className="ob-step reveal">
            <h1>You’re in, {first || 'friend'}. 🎉</h1>
            <p className="meta-dim">{understood ? `Here’s a starting map of ${a.city || 'your city'}, from what you told me.` : 'Here’s what’s popular on VOIDAJ to start with.'}</p>
            <div className="assistant-section-label">Communities for you</div>
            <div className="card-grid three tight">
              {matchCommunities(forReveal, { communities: [] }, 3).map(({ item, shared }) => <CommunityCard key={item.id} community={item} shared={shared} source="said" because={because} />)}
            </div>
            <div className="assistant-section-label">People you should meet</div>
            <div className="card-grid three tight">
              {matchPeople(forReveal, { connections: [] }, 3).map(({ item, shared }) => <PersonCard key={item.id} user={item} shared={shared} source="said" because={because} />)}
            </div>
            {matchEvents(forReveal, null, 2).length > 0 && (
              <>
                <div className="assistant-section-label">Events near you</div>
                <div className="card-grid two tight">
                  {matchEvents(forReveal, null, 2).map(({ item, shared }) => <EventCard key={item.id} event={item} shared={shared} source="said" because={because} />)}
                </div>
              </>
            )}
            <div className="reveal-actions">
              <button className="btn primary large" onClick={enter}>Enter VOIDAJ <Icon name="arrow" size={16} /></button>
              <p className="meta-dim">All of this can be changed later in Settings.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
