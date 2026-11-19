# Push and deploy checklist (target: before Nov 27)

State on Nov 19: branch `feat/nuel-nov11-12` is 4 commits ahead of `main`, not pushed.
voidaj.com (Vercel project `interact-space`) is still running the code from before Nov 11's
monitoring work. All 253 tests pass locally, the build is clean, and server coverage is 87.3%
(CI needs 80%).

## 1. Before pushing

Done on Nov 19:

- [x] **Production backup made and checked.** `~/voidaj-backups/voidaj-prod-20261119-103956.dump`
      (495 KB, the `public` and `admin` schemas of the live Supabase database). I restored it into
      a scratch database and the counts matched production exactly: 48 users (31 real, 17 sample)
      and 41 posts. The file holds personal data (emails, password hashes), so keep it off GitHub
      and cloud folders. Take a Supabase backup too (Dashboard → Database → Backups) if you
      want a copy that lives at Supabase.
- [x] **Migration rehearsed on that copy.** It ran cleanly with no errors, and left users and
      posts unchanged (48 and 41). What it did to the copy of live data:
      - **Existing accounts are marked email-confirmed:** all 31 real accounts. No extra SQL is
        needed; the migration does it (`email_confirmed_at`), so turning on Resend won't lock
        anyone out. Accounts created *after* deploy get a code as normal.
      - **Duplicate usernames fixed (4 pairs).** The account in use keeps the name:
        | Keeps | Renamed to |
        |---|---|
        | `@david` (David obayomi, admin) | `@david_6997` (David, new today) |
        | `@isabelle` (isabelle) | `@isabelle_3917` (Isabelle Desmarais) |
        | `@nuel` (Nuel, admin, active) | `@nuel_7a22` (Dami, unused) |
        | `@toluwanimi` (Executivee) | `@toluwanimi_47dc` (Exec) |
      - **The 10 live accounts with the old Verified badge keep it** (you decided Nov 19). New badges now need an ID check; an admin can remove one in Admin → ID checks. Unverified members can send an ID from
        Settings → Verification. Tell them, or list their handles to me and I'll keep their
        badges.

Still to do (needs you):

- [ ] **Verify voidaj.com in Resend** (resend.com → Domains: add the DNS records it gives you),
      then create an API key.
- [ ] **Set up email forwarding** for hello@voidaj.com so mail to it reaches you. voidaj.com's DNS
      is at Wix (nameservers ns14/ns15.wixdns.net) and has no MX records yet, so use ImprovMX: add its
      two MX records and SPF in Wix DNS. (Cloudflare Email Routing would mean moving the whole
      domain's nameservers.) Resend's own records live on a `send.` subdomain, so they don't clash.
      Send yourself a test.
- [ ] **Add to Vercel → Settings → Environment Variables (Production):**
      | Name | Value |
      |---|---|
      | `RESEND_API_KEY` | from Resend |
      | `EMAIL_FROM` | `VOIDAJ <hello@voidaj.com>` |
      | `ADMIN_EMAILS` | your email (must be confirmed or signed in with Google/Apple) |
      | `ADS_NOTIFY_EMAIL` | optional, defaults to hello@voidaj.com |
      Already set: `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_URL`, `GOOGLE_*`, `APPLE_*`.
- [ ] **Google Cloud Console:** the OAuth consent screen should be "In production", not
      "Testing", or only listed test users can sign in. Redirect URI must include
      `https://voidaj.com/api/auth/google/callback`.

## 2. Push

```bash
git push -u origin feat/nuel-nov11-12
```
CI (`Tests` workflow) runs on the push. It must be green before merging.

Merge order: this branch includes the monitoring commits from open PR #7 (`feat/monitoring`).
Merge #7 first, then open the new PR so its diff is just today's work:
```bash
gh pr merge 7 --merge        # after its CI is green
gh pr create --base main --head feat/nuel-nov11-12 --title "ID checks, Services, reviewed ads, onboarding, worldwide location"
```
Review the diff once (136 files). The biggest risks are `server/db.js` (migration) and
`server/index.js`.

## 3. Deploy

Merging to `main` should deploy production automatically (check Vercel → Settings → Git; if it
isn't connected, run `vercel --prod`).

- The database migration runs on the **first request** after deploy, in one transaction. If any
  statement fails, every request returns an error until it's fixed. Watch it:
  `vercel logs https://voidaj.com --follow`
- Then restart nothing. Vercel starts fresh on deploy.

## 4. Smoke test on voidaj.com (15 minutes)

- [ ] `https://voidaj.com/api/health` returns `ok: true`
- [ ] Visitor view: rotating hero photos, four menu items, no "Lagos" or "Nigeria" text
- [ ] Sign up with email: date of birth, "Continue with email", full name, code arrives by email
- [ ] **Sign in with Google** and **Sign in with Apple** (Apple only works on voidaj.com)
- [ ] Onboarding: username check works, country and city step, finish lands on Home
- [ ] Hero shows the right landmarks for a non-Nigerian account (Toronto → CN Tower)
- [ ] Settings → Verification: send an ID, approve it in Admin → ID checks, badge appears,
      photos are gone from the database row
- [ ] Services: create one with photos, open it as another account, contact button works
- [ ] Advertise: send a request, see it in Admin → Ads, approve it, it appears as Sponsored and
      the advertiser gets an email
- [ ] Admin opens for your email only; a normal account gets "Admins only"
- [ ] Privacy and Terms pages show hello@voidaj.com, and an email to it arrives

## 5. If something breaks

- **Code:** Vercel → Deployments → previous deployment → Promote to Production.
- **Data:** the migration is not undone by a rollback. Restore from the backup above if the
  username or badge changes caused trouble:
  `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" ~/voidaj-backups/voidaj-prod-20261119-103956.dump`

## 6. Known gaps (not blockers)

- No Supabase storage on Vercel, so community and event cover photo uploads stay switched off.
  Service, ad and ID photos are stored in the database and work.
- Payments, real ID provider (Smile ID / Youverify) and the iOS/Android app are not built.
- Cities outside the ~60 in `src/places.js` get the country map without a pin.
- Nuel's Nov 18 iMessage ("editing" feature) hasn't been read.
