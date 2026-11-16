# Plan: the rest of Nuel's notes, and VOIDAJ outside Nigeria

Written Nov 12, after the Nov 10–12 round (see NUEL-FEEDBACK-NOV10-12.md). The layout stays the same: new things go into the pages, tabs and sheets that already exist.

Order: security first (it matters even in Lagos), then working outside Nigeria, then the later-phase pieces from the notes, then Google and Apple sign-in.

**Status (Nov 12, end of day):** sections 1–5 are built on `feat/nuel-nov11-12` and tested (211 automated tests, plus a run-through in the browser). Section 6 waits on keys from David's Google and Apple accounts. Email codes go out by email once `RESEND_API_KEY` is set; until then they're printed in the server log.

## 1. Security against fake accounts and spam

| Piece | How |
|---|---|
| Limit sign-in attempts | 10 failed tries per email and per network address every 15 minutes, then "Too many tries, wait a few minutes". Kept in the database so it holds across servers. |
| Limit sign-ups | 5 new accounts per network address per hour. |
| Bot trap | A hidden field on the sign-up form that only bots fill in. |
| Confirm email | A 6-digit code is emailed after sign-up (sent through Resend once `RESEND_API_KEY` is set; locally the code is printed in the server log). Until it's confirmed, a banner asks for it and the account can't post jobs, create events or communities, or message people it doesn't already know. |
| Spam limits | Posts, comments, messages, jobs and events: at most 20 a minute per person, and the same text can't be posted twice in 10 minutes. |
| Block people | Block from any profile. A blocked person can't message you, and you stop seeing their posts. Unblock in Settings → Privacy. |

## 2. Working outside Nigeria

| Piece | How |
|---|---|
| Country | Every account has a country (Nigeria by default). Asked at sign-up next to the date of birth, changeable in Settings. City stays free text, area stays optional. |
| Discovery filters | Events, Communities and Quick Jobs get **My city · My country · Everywhere**. New events, communities and jobs remember their country. |
| Event time zones | Each event saves the time zone it was created in. Times show in that zone ("6:00 PM WAT"), plus "your time" when you're somewhere else. Add to calendar uses the right time. |
| Currency | Paid jobs and services have a currency (defaulting to the poster's country: NGN, GHS, KES, GBP, USD, …). Prices and offers show that currency instead of always ₦. |
| Phone numbers | A country dialling code plus the number, saved in the international format (+234…, +44…). |
| Features by country | One list says which features each country has. For now: ID verification (NIN) and paid ads are Nigeria-only, so other countries don't see them. |
| Privacy and location | Already there: exact / city only / hidden, and private event attendance. Added here: blocking, and country follows the same "hidden" setting. |

## 3. Events (from the Events note)

| Piece | How |
|---|---|
| Organiser page | "Manage" on your own event: everyone registered (including people who hid themselves from the public list), the waitlist, Interested, join requests, and simple numbers (going, interested, waitlist, places left). |
| Co-hosts and moderators | The organiser adds people by username as co-host (can manage) or moderator (can post announcements and remove people). |
| Invite-only | An event can be "Invite only": Going becomes "Ask to join", and hosts approve. Hosts can also invite people directly. |
| Announcements | Hosts post updates; they show on the event page for everyone going. |
| Event Circle | Each event gets a group chat for the people going. |
| Edit and drafts | Hosts can edit their event. The create form keeps an unfinished event as a draft on the device. |

## 4. Jobs & Services (from the Jobs & Services note)

| Piece | How |
|---|---|
| Shortlist, hire, decline | The poster sees everyone who applied or offered, and can shortlist, hire or decline them. |
| Agreement record | Hiring writes down who, what, the price and any terms. The worker accepts it. |
| Job status | Open → Worker selected → In progress → Completed (or Cancelled). Both sides see where it is. |
| Two-way reviews | After a job is completed, the poster and the worker each leave 1–5 stars and a few words. Reviews show on profiles. |
| Disputes | Either side can "Report a problem" on a job in progress. It's marked Disputed and goes to the VOIDAJ team. |
| Pause a service | Service providers can pause a listing and turn it back on. |

## 5. Communities (from the Communities note)

A **Chat** tab on each community next to Discussions, Events and Members, holding that community's group chats.

## 6. Google and Apple sign-in

The code is already written; what's missing are the keys from Google and Apple.

- **Google**: an OAuth client from Google Cloud Console, with the voidaj.com and localhost callback addresses. Works locally once the two keys are in `.env`.
- **Apple**: needs a paid Apple Developer account ($99/year), a Services ID, a key file, and the live https site, because Apple won't send people back to localhost.
- Both: the same keys added in Vercel → Settings → Environment Variables, plus `PUBLIC_URL=https://voidaj.com`.

These need David's Google and Apple accounts, so they're done together with him.

## Left for later

- Map pins for events (needs a place lookup service).
- A multi-step event form (would change the layout; drafts cover the main need).
- Paying through VOIDAJ (Nuel's notes say VOIDAJ doesn't hold payments for now).
- SMS phone verification (needs an SMS provider and has a cost per message).
