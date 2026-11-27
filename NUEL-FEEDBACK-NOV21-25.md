# Nuel's feedback, Nov 21 – 25 (PLAN, approved)

From the WhatsApp chat with Nuel, Saturday Nov 21 ("If you have any miss understanding I am ready to rectify") to Wednesday Nov 25.
Not readable from the chat: his long written specs (Badges, Jobs & Services monetization, Subscriptions, Loading & Performance) and the two voice notes on Nov 21 (7:23 PM and 7:29 PM). Those need pasting or summarising.

## To build (clear)

| # | Nuel said | Plan | Files |
|---|---|---|---|
| 1 | "Add specify by gender also" (profile, per David) | Optional gender field on the profile: Woman / Man / Non-binary / Prefer not to say / Self-describe. Add to Edit profile and onboarding. Visible on the profile only if the owner turns that on. Included in data export. New `gender` column. | server/db.js, server/index.js, src/pages/Profile.jsx, src/pages/Onboarding.jsx |
| 2 | Loading screen: "just the vj logo and the loading animation at the bottom", no "VOIDAJ" or "Connect. Discover. Participate." (design D, "The Rhythm") | Dark full-screen start-up screen: vJ mark with the bar animation beneath it, nothing else. Shown while the app first loads (user/session fetch), then fades out. Respects reduced-motion. | src/App.jsx, src/components/VoidajMark.jsx, new LoadingScreen, CSS |
| 3 | "She don't have post actions like delete or hide all those stuffs I sent in notes" | Post menu: Delete (own posts and comments, with confirm), Hide (others' posts, per person, undo). Report stays. | src/components/Feed.jsx, src/pages/Thread.jsx, server/index.js, server/db.js |
| 4 | "Ability to share job or service updates to friends" | Share button on a job or service: native share sheet, else copy link. | src/pages/Jobs.jsx, src/pages/Services.jsx |
| 5 | "People can choose how long they want a community or event before it goes down" | Duration picker when creating a community or event (e.g. 1 week, 1 month, 3 months, no end). Expired ones hide from lists and show "ended". | server/index.js, server/db.js, EventForm.jsx, NewCommunity.jsx |
| 6 | "Maybe a little bit of colour" on the post-a-job form | Soft colour on the Post a job / Offer a service form (he said not necessary now: do last, small). | src/pages/Jobs.jsx |

## Needs your answer first (see questions)

| # | Topic | The open point |
|---|---|---|
| A | Payments | Nuel (Nov 21): "I'm trying not to be part of any payment structure... more of displaying prices". Paystack job payments are already built and committed. |
| B | Referral points | He asked if 15 is high. You said "may be like 10" then "10-1". Currently 15 (server/db.js POINTS, src/pages/Badges.jsx). |
| C | Email confirmation | Nuel: "email confirmation before any account creation". Today the account is created first, then a code is sent and posting/jobs/events are locked until confirmed. |
| D | New bigger features | Fund collection for events, a section showing users who match your preferences, "see suggestions", Google Pay / Apple Pay. |

## Not now (Nuel said so, or parked)

- Subscription plans (his own words: "not necessary now"; architecture only, activate later with founder approval).
- Jobs & Services monetization spec (free listings, paid promotions): "Okay will do" was David's reply, but it is blocked on A.
- Google search / SEO: a question, not a code change. Separate conversation.
- Side navigation reel, promo videos: reference only.

## Order of work

1 loading screen, 2 gender, 3 post actions, 4 share, 5 duration, 6 colour; then whatever A–D decide. Tests added alongside each; `npm test` before finishing.

## Decisions (David, Nov 25)

- A Payments: leave the Paystack job payments as they are.
- B Referral points: 10 per friend (was 15).
- C Email: code before account. The account is only created once the emailed code is confirmed.
- D In this round: matching people section, suggestions view, event fund collection. Google/Apple Pay: not now.
