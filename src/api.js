// ── Frontend API client ──────────────────────────────────────────────
// Thin fetch wrapper around the Express API in server/. Vite proxies
// /api/* to http://localhost:8787 in dev (see vite.config.js).
async function req(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { code: data.code })
  return data
}

// Auth
export const me = () => req('/auth/me').then((d) => d.user)
// With email on, the first call returns { needsCode: true, email } and the
// account is made when the call is repeated with the emailed `code`.
export const register = (body) => req('/auth/register', { method: 'POST', body }).then((d) => (d.needsCode ? d : d.user))
export const resendSignupCode = (email) => req('/auth/register/resend', { method: 'POST', body: { email } })
export const setAge = (birthDate, ref, country) => req('/me/age', { method: 'PUT', body: { birthDate, ref, country } }).then((d) => d.user)
export const myReferrals = () => req('/me/referrals')
export const login = (body) => req('/auth/login', { method: 'POST', body }).then((d) => d.user)
export const logout = () => req('/auth/logout', { method: 'POST' })
// Which of Google / Apple sign-in are set up on this server.
export const authProviders = () => req('/auth/providers')
export const patchMe = (body) => req('/auth/me', { method: 'PATCH', body }).then((d) => d.user)
// Settings
export const changeEmail = (email, password) => req('/auth/email', { method: 'POST', body: { email, password } }).then((d) => d.user)
export const changePassword = (current, next) => req('/auth/password', { method: 'POST', body: { current, next } })
export const listLogins = () => req('/auth/sessions').then((d) => d.logins)
export const logoutOthers = () => req('/auth/logout-others', { method: 'POST' })
export const deleteAccount = (password) => req('/auth/me', { method: 'DELETE', body: { password } })
export const sendSupport = (body) => req('/support', { method: 'POST', body })
export const exportUrl = '/api/me/export'
export const adminUsers = () => req('/admin/users').then((d) => d.users)
export const adminAnalytics = () => req('/admin/analytics')
export const adminUsersCsvUrl = '/api/admin/users.csv'
export const adminAccounts = () => req('/admin/accounts').then((d) => d.accounts)
export const addAdminAccount = (body) => req('/admin/accounts', { method: 'POST', body }).then((d) => d.account)
export const saveAdminAccount = (id, body) => req(`/admin/accounts/${id}`, { method: 'PATCH', body }).then((d) => d.account)
export const deleteAdminAccount = (id) => req(`/admin/accounts/${id}`, { method: 'DELETE' })
// ID checks: a photo of the ID and a selfie, reviewed by the VOIDAJ team.
export const myVerification = () => req('/verification')
export const sendVerification = (body) => req('/verification', { method: 'POST', body }).then((d) => d.check)
export const adminVerifications = () => req('/admin/verifications').then((d) => d.checks)
export const decideVerification = (id, decision, reason) => req(`/admin/verifications/${id}`, { method: 'POST', body: { decision, reason } })
export const revokeVerification = (userId) => req(`/admin/verifications/revoke/${userId}`, { method: 'POST' })

// Communities & people
export const listCommunities = () => req('/communities').then((d) => d.communities)
export const getCommunity = (id) => req(`/communities/${id}`).then((d) => d.community)
export const joinCommunity = (id) => req(`/communities/${id}/join`, { method: 'POST' })
export const leaveCommunity = (id) => req(`/communities/${id}/leave`, { method: 'POST' })
export const connect = (id) => req(`/users/${id}/connect`, { method: 'POST' }).then((d) => d.user)
export const follow = (id) => req(`/users/${id}/follow`, { method: 'POST' })
export const people = (id, list) => req(`/users/${id}/people?list=${list}`).then((d) => d.people)
export const getUser = (id) => req(`/users/${id}`).then((d) => d.user)
export const createCommunity = (body) => req('/communities', { method: 'POST', body })
export const setModRules = (id, rules) => req(`/communities/${id}/mod-rules`, { method: 'PUT', body: { rules } }).then((d) => d.community)

// Events members create (the seeded demo events live in data/seed.js)
export const listEvents = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return req('/events' + (q ? `?${q}` : '')).then((d) => d.events)
}
export const listRsvps = () => req('/rsvps')
export const socialNotifications = () => req('/notifications')
// body: { status: 'going' | 'interested', visible, visibleOnly } — all optional.
export const rsvp = (id, body = {}) => req(`/events/${id}/rsvp`, { method: 'POST', body })
export const reportEvent = (id, reason) => req(`/events/${encodeURIComponent(id)}/report`, { method: 'POST', body: { reason } })
export const uploadImage = (image, kind) => req('/uploads', { method: 'POST', body: { image, kind } }).then((d) => d.url)
export const setCommunityCover = (id, cover) => req(`/communities/${id}/cover`, { method: 'PUT', body: { cover } }).then((d) => d.community)
export const createEvent = (communityId, body) => req(`/communities/${communityId}/events`, { method: 'POST', body }).then((d) => d.event)
export const createOpenEvent = (body) => req('/events', { method: 'POST', body }).then((d) => d.event)

// Posts, comments, votes
export const listPosts = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return req('/posts' + (q ? `?${q}` : '')).then((d) => d.posts)
}
export const deletePost = (id) => req(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const deleteComment = (id) => req(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const hidePost = (id) => req(`/posts/${encodeURIComponent(id)}/hide`, { method: 'POST' })
export const unhidePost = (id) => req(`/posts/${encodeURIComponent(id)}/hide`, { method: 'DELETE' })
export const suggestions = () => req('/suggestions')
export const peopleMatches = () => req('/people/matches').then((d) => d.people)
export const createPost = (body) => req('/posts', { method: 'POST', body }).then((d) => d.post)
export const feed = (tab = 'foryou') => req(`/feed?tab=${tab}`).then((d) => d.posts)
export const listStatuses = () => req('/statuses').then((d) => d.groups)
export const postStatus = (body) => req('/statuses', { method: 'POST', body })
export const viewStatus = (id) => req(`/statuses/${id}/view`, { method: 'POST' })
export const deleteStatus = (id) => req(`/statuses/${id}`, { method: 'DELETE' })
export const getPost = (id) => req(`/posts/${id}`)
export const addComment = (postId, body) => req(`/posts/${postId}/comments`, { method: 'POST', body })
export const vote = (targetType, targetId, value) =>
  req('/vote', { method: 'POST', body: { targetType, targetId, value } })

// Reporting & moderation
export const report = (targetType, targetId, reason) =>
  req('/reports', { method: 'POST', body: { targetType, targetId, reason } })
export const modReports = () => req('/mod/reports')
export const modDashboard = () => req('/mod/dashboard')
export const modHistory = () => req('/mod/history').then((d) => d.entries)
export const setRole = (communityId, userId, role) => req(`/communities/${communityId}/roles`, { method: 'POST', body: { userId, role } })
export const resolveReport = (id, action) => req(`/reports/${id}/resolve`, { method: 'POST', body: { action } })

// Community ratings
export const rateCommunity = (id, stars, review) => req(`/communities/${id}/rate`, { method: 'POST', body: { stars, review } })

// Quick Jobs
export const listPros = () => req('/pros').then((d) => d.pros)
export const listJobs = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return req('/jobs' + (q ? `?${q}` : '')).then((d) => d.jobs)
}
export const createJob = (body) => req('/jobs', { method: 'POST', body }).then((d) => d.job)
export const makeOffer = (id, offer, note) => req(`/jobs/${id}/offer`, { method: 'POST', body: { offer, note } }).then((d) => d.job)
export const toggleJobInterest = (id) => req(`/jobs/${id}/interest`, { method: 'POST' }).then((d) => d.job)

// Job history — the applicant's own tracker
export const myJobs = () => req('/me/jobs')
export const updateApplication = (jobId, body) => req(`/jobs/${jobId}/application`, { method: 'PATCH', body })

// Voices — extra, separately shareable versions of a profile
export const listVoices = () => req('/voices')
export const createVoice = (body) => req('/voices', { method: 'POST', body }).then((d) => d.voice)
export const updateVoice = (id, body) => req(`/voices/${id}`, { method: 'PATCH', body }).then((d) => d.voice)
export const deleteVoice = (id) => req(`/voices/${id}`, { method: 'DELETE' })
export const getVoice = (handle) => req(`/v/${encodeURIComponent(handle)}`)

// Direct messages
export const listConversations = () => req('/messages').then((d) => d.conversations)
export const getThread = (userId) => req(`/messages/${userId}`)
export const sendMessage = (userId, body, media = [], context = null) => req(`/messages/${userId}`, { method: 'POST', body: { body, media, context } }).then((d) => d.message)

// Group chats
export const listChats = () => req('/chats').then((d) => d.chats)
export const createChat = (body) => req('/chats', { method: 'POST', body }).then((d) => d.chat)
export const joinChat = (id) => req(`/chats/${id}/join`, { method: 'POST' }).then((d) => d.chat)
export const listChatMessages = (id) => req(`/chats/${id}/messages`).then((d) => d.messages)
export const sendChatMessage = (id, body, media = []) => req(`/chats/${id}/messages`, { method: 'POST', body: { body, media } }).then((d) => d.message)

// Ads
export const listAds = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return req(`/ads${qs ? `?${qs}` : ''}`).then((d) => d.ads)
}
export const getAd = (id) => req(`/ads/${id}`).then((d) => d.ad)
export const listMyAds = () => req('/ads/mine').then((d) => d.ads)
export const createAd = (body) => req('/ads', { method: 'POST', body }).then((d) => d.ad)
export const myAds = () => req('/ads/mine').then((d) => d.ads)
export const adminAds = () => req('/admin/ads').then((d) => d.ads)
export const decideAd = (id, decision, note) => req(`/admin/ads/${id}`, { method: 'POST', body: { decision, note } }).then((d) => d.ad)

// Live streaming
export const listLive = () => req('/live').then((d) => d.streams)
export const getCommunityLive = (id) => req(`/communities/${id}/live`).then((d) => d.stream)
export const startLive = (communityId, title) => req(`/communities/${communityId}/live/start`, { method: 'POST', body: { title } }).then((d) => d.stream)
export const stopLive = (id) => req(`/live/${id}/stop`, { method: 'POST' })

// Companion
export const companion = (message) => req('/companion', { method: 'POST', body: { message } })

// The engagement system: Spark (react), Loom (spread), #tags and @handles.
export const spark = (postId, kind) => req(`/posts/${postId}/spark`, { method: 'POST', body: { kind } }).then((d) => d.post)
export const loom = (postId, body) => req(`/posts/${postId}/loom`, { method: 'POST', body }).then((d) => d.post)
export const tagPosts = (tag) => req(`/tags/${encodeURIComponent(tag)}`)
export const userByHandle = (handle) => req(`/handles/${encodeURIComponent(handle.replace(/^@/, ''))}`).then((d) => d.user)
export const searchPeople = (q = '') => req(`/people/search?q=${encodeURIComponent(q)}`).then((d) => d.people)
export const searchHandles = (q) => req(`/handles?q=${encodeURIComponent(q)}`).then((d) => d.users)
export const eventPeople = (id, params = {}) => req(`/events/${encodeURIComponent(id)}/people?${new URLSearchParams(params)}`)
// Citizen level and badges.
export const journey = (userId = 'me') => req(`/users/${encodeURIComponent(userId)}/journey`)
export const createBadge = (name, style, image = '') => req('/badges', { method: 'POST', body: { name, style, image } })
export const setBadgeHidden = (id, hidden) => req(`/badges/${encodeURIComponent(id)}/visibility`, { method: 'POST', body: { hidden } })
export const deleteBadge = (id) => req(`/badges/${encodeURIComponent(id)}`, { method: 'DELETE' })

// Business on VOIDAJ (server/business.js)
export const businessMeta = () => req('/business-meta')
export const listBusinesses = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return req(`/businesses${qs ? `?${qs}` : ''}`).then((d) => d.businesses)
}
export const myBusinesses = () => req('/businesses/mine').then((d) => d.businesses)
export const promotedListings = (city) => req(`/businesses/promoted${city ? `?city=${encodeURIComponent(city)}` : ''}`).then((d) => d.listings)
export const getBusiness = (id) => req(`/businesses/${id}`).then((d) => d.business)
export const createBusiness = (body) => req('/businesses', { method: 'POST', body }).then((d) => d.business)
export const updateBusiness = (id, body) => req(`/businesses/${id}`, { method: 'PATCH', body }).then((d) => d.business)
export const deleteBusiness = (id) => req(`/businesses/${id}`, { method: 'DELETE' })
export const followBusiness = (id, follow = true) => req(`/businesses/${id}/follow`, { method: 'POST', body: { follow } })
export const addListing = (id, body) => req(`/businesses/${id}/listings`, { method: 'POST', body }).then((d) => d.listing)
export const deleteListing = (id, listingId) => req(`/businesses/${id}/listings/${listingId}`, { method: 'DELETE' })
export const viewListing = (id, listingId) => req(`/businesses/${id}/listings/${listingId}/view`, { method: 'POST' }).catch(() => {})
export const businessReviews = (id) => req(`/businesses/${id}/reviews`).then((d) => d.reviews)
export const reviewBusiness = (id, body) => req(`/businesses/${id}/reviews`, { method: 'POST', body })
export const promoteListing = (id, body) => req(`/businesses/${id}/promote`, { method: 'POST', body }).then((d) => d.promotion)
export const businessPromotions = (id) => req(`/businesses/${id}/promotions`).then((d) => d.promotions)

// ── Nov 12 plan (PLAN-NOTES-AND-GLOBAL.md) ──────────────────────────
// Security: email confirmation codes and blocking.
export const confirmEmail = (code) => req('/auth/confirm-email', { method: 'POST', body: { code } }).then((d) => d.user)
export const resendEmailCode = () => req('/auth/email-code', { method: 'POST' })
export const toggleBlock = (userId) => req(`/users/${userId}/block`, { method: 'POST' })
export const myBlocks = () => req('/me/blocks').then((d) => d.people)
// Events: the organisers' side.
const ev = (id) => `/events/${encodeURIComponent(id)}`
export const manageEvent = (id) => req(`${ev(id)}/manage`)
export const updateEvent = (id, body) => req(ev(id), { method: 'PATCH', body }).then((d) => d.event)
export const addEventHost = (id, handle, role) => req(`${ev(id)}/hosts`, { method: 'POST', body: { handle, role } })
export const removeEventHost = (id, userId) => req(`${ev(id)}/hosts/${userId}`, { method: 'DELETE' })
export const eventAnnouncements = (id) => req(`${ev(id)}/announcements`)
export const announce = (id, body) => req(`${ev(id)}/announcements`, { method: 'POST', body: { body } }).then((d) => d.announcement)
export const deleteAnnouncement = (id, aid) => req(`${ev(id)}/announcements/${aid}`, { method: 'DELETE' })
export const answerRequest = (id, userId, decision) => req(`${ev(id)}/requests/${userId}`, { method: 'POST', body: { decision } })
export const inviteToEvent = (id, handle) => req(`${ev(id)}/invite`, { method: 'POST', body: { handle } })
export const removeAttendee = (id, userId) => req(`${ev(id)}/attendees/${userId}`, { method: 'DELETE' })
export const eventCircle = (id) => req(`${ev(id)}/circle`).then((d) => d.chatId)
export const myHosting = () => req('/me/hosting').then((d) => d.events)
// Jobs: hiring, agreements, stages, disputes, reviews.
export const jobFlow = (id) => req(`/jobs/${id}`)
export const jobApplicant = (id, userId, action, extra = {}) => req(`/jobs/${id}/applicants/${userId}`, { method: 'POST', body: { action, ...extra } })
export const answerAgreement = (id, accept) => req(`/jobs/${id}/agreement`, { method: 'POST', body: { accept } })
export const jobStage = (id, to, extra = {}) => req(`/jobs/${id}/stage`, { method: 'POST', body: { to, ...extra } })
// Quick Job payments (server/payments.js, Paystack)
export const paymentsConfig = () => req('/payments/config')
export const myPayments = () => req('/payments/me')
export const paymentQuote = (price, currency) => req(`/payments/quote?price=${encodeURIComponent(price)}&currency=${encodeURIComponent(currency || 'NGN')}`)
export const payoutBanks = () => req('/payments/banks').then((d) => d.banks)
export const savePayout = (bankCode, accountNumber) => req('/payments/payout', { method: 'POST', body: { bankCode, accountNumber } })
export const confirmPayout = (code) => req('/payments/payout/confirm', { method: 'POST', body: { code } })
export const cancelPayout = () => req('/payments/payout/cancel', { method: 'POST' })
export const startCardSetup = (jobId) => req('/payments/card', { method: 'POST', body: { jobId } }).then((d) => d.url)
export const removeCard = () => req('/payments/card', { method: 'DELETE' })
export const eventFunds = (id) => req(`/events/${encodeURIComponent(id)}/funds`)
export const setEventFunds = (id, body) => req(`/events/${encodeURIComponent(id)}/funds`, { method: 'PUT', body })
export const eventFundCheckout = (id, amount) => req(`/events/${encodeURIComponent(id)}/funds/checkout`, { method: 'POST', body: { amount } })
export const verifyPayment = (reference) => req('/payments/verify', { method: 'POST', body: { reference } })
export const chargeJob = (id, paymentId) => req(`/jobs/${id}/payment/charge`, { method: 'POST', body: { paymentId } })
export const checkoutJob = (id, paymentId) => req(`/jobs/${id}/payment/checkout`, { method: 'POST', body: { paymentId } }).then((d) => d.url)
export const jobDispute = (id, reason, extra = {}) => req(`/jobs/${id}/dispute`, { method: 'POST', body: { reason, ...extra } })
export const answerDispute = (id, response, photos) => req(`/jobs/${id}/dispute/respond`, { method: 'POST', body: { response, photos } })
export const proposePrice = (id, price, note) => req(`/jobs/${id}/price`, { method: 'POST', body: { price, note } })
export const answerPrice = (id, changeId, body) => req(`/jobs/${id}/price/${changeId}`, { method: 'POST', body })
export const askForChanges = (id, note) => req(`/jobs/${id}/changes`, { method: 'POST', body: { note } })
export const reportNoShow = (id) => req(`/jobs/${id}/no-show`, { method: 'POST' })
export const jobReview = (id, rating, body) => req(`/jobs/${id}/review`, { method: 'POST', body: { rating, body } })
export const userReviews = (userId) => req(`/users/${userId}/reviews`)
export const adminDisputes = () => req('/admin/disputes').then((d) => d.disputes)
export const resolveDispute = (id, body) => req(`/admin/disputes/${id}/resolve`, { method: 'POST', body: typeof body === 'string' ? { outcome: body } : body })
export const adminDispute = (id) => req(`/admin/disputes/${id}`)
export const adminJobRecord = (id) => req(`/admin/jobs/${id}/record`)
export const adminFlags = () => req('/admin/flags').then((d) => d.flags)
export const clearFlag = (id) => req(`/admin/flags/${id}/clear`, { method: 'POST' })

// Services: what people can do, with proof photos and availability.
export const listServices = (params = {}) => req(`/services?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`).then((d) => d.services)
export const myServices = () => req('/services/mine').then((d) => d.services)
export const getService = (id) => req(`/services/${id}`).then((d) => d.service)
export const createService = (body) => req('/services', { method: 'POST', body }).then((d) => d.service)
export const updateService = (id, body) => req(`/services/${id}`, { method: 'PATCH', body }).then((d) => d.service)
export const deleteService = (id) => req(`/services/${id}`, { method: 'DELETE' })
export const checkHandle = (h) => req(`/handle-check?h=${encodeURIComponent(h)}`)
