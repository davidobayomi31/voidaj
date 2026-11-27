// ── VOIDAJ database ──────────────────────────────────────────────────
// Postgres. Owns everything dynamic: accounts, membership, posts,
// threaded comments, votes, connections, reports, jobs, chats and ads.
//
// This replaced a single-file SQLite database. Serverless hosts give a
// function no persistent disk, so the data had to move somewhere that
// outlives a single request. Every read below is therefore async.
import pg from 'pg'
import crypto from 'crypto'
import { featuresFor } from './countries.js'
import { SUPABASE_ROOT_CA } from './supabase-ca.js'
import { VERIFICATION_IS_REAL } from './verification.js'

// pg hands back BIGINT and NUMERIC as strings, to protect values too large
// for a JS number. Here they are only millisecond timestamps, counts and a
// star average — all of which the app does arithmetic on — so parse them.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))) // int8
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))) // numeric

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and point it at a Postgres database ' +
    '(locally: postgres://postgres@127.0.0.1:5432/voidaj).',
  )
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(url)
const isSupabase = /@[^/@]*\.supabase\.(com|co)[:/]/.test(url)

// Managed Postgres requires TLS; a local cluster has none. Supabase signs its
// certificates with a private root, so Node needs that root handed to it or
// the connection dies with SELF_SIGNED_CERT_IN_CHAIN — supplying it keeps
// full verification on, which turning verification off would not.
const sslOptions = () => {
  if (isLocal) return false
  if (process.env.PGSSL_NO_VERIFY === '1') return { rejectUnauthorized: false }
  if (isSupabase) return { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true }
  return { rejectUnauthorized: true }
}

export const pool = new pg.Pool({
  connectionString: url,
  // See sslOptions above. PGSSL_NO_VERIFY=1 remains the escape hatch for a
  // host whose chain Node still doesn't recognise — it keeps the connection
  // encrypted but stops verifying who is on the other end.
  ssl: sslOptions(),
  // Serverless functions come and go; don't hold a large idle pool open.
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
})

// The queries below are written with SQLite-style "?" placeholders because
// that is how they were first written and they read better; Postgres wants
// $1, $2… so translate on the way through. No query here contains a literal
// "?" inside a string, which is what would make this unsafe.
const toPg = (sql) => {
  let n = 0
  return sql.replace(/\?/g, () => `$${++n}`)
}

// The query surface the rest of the server uses. `get` returns one row or
// undefined, `all` returns an array, `run` reports how many rows changed.
export const q = {
  get: async (sql, ...args) => (await pool.query(toPg(sql), args)).rows[0],
  all: async (sql, ...args) => (await pool.query(toPg(sql), args)).rows,
  run: async (sql, ...args) => ({ changes: (await pool.query(toPg(sql), args)).rowCount }),
}

// ── Schema ───────────────────────────────────────────────────────────
// Booleans stay INTEGER 0/1 rather than becoming Postgres BOOLEAN: the
// whole app already reads them as `!!row.x` and writes 0/1, and changing
// that would have meant touching every route for no behavioural gain.
// Timestamps are BIGINT because they are Date.now() milliseconds.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL,
  handle TEXT,
  title TEXT,
  city TEXT DEFAULT 'Lagos',
  area TEXT,
  color TEXT DEFAULT '#D8A63A',
  bio TEXT DEFAULT '',
  interests TEXT DEFAULT '[]',
  goals TEXT DEFAULT '[]',
  skills TEXT DEFAULT '[]',
  privacy TEXT DEFAULT 'neighborhood',
  onboarded INTEGER DEFAULT 0,
  is_seed INTEGER DEFAULT 0,
  created_at BIGINT,
  id_verified INTEGER DEFAULT 0,
  verified_at BIGINT,
  job_skills TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  scope TEXT,
  city TEXT,
  accent TEXT,
  icon TEXT,
  tags TEXT DEFAULT '[]',
  rules TEXT DEFAULT '[]',
  member_count INTEGER DEFAULT 0,
  trending INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  created_at BIGINT,
  PRIMARY KEY (user_id, community_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  pinned INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  base_score INTEGER DEFAULT 0,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  parent_id TEXT,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  hidden INTEGER DEFAULT 0,
  base_score INTEGER DEFAULT 0,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS votes (
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS connections (
  user_id TEXT NOT NULL,
  other_id TEXT NOT NULL,
  created_at BIGINT,
  PRIMARY KEY (user_id, other_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  community_id TEXT,
  reason TEXT,
  status TEXT DEFAULT 'open',
  action TEXT,
  created_at BIGINT,
  resolved_at BIGINT,
  resolver_id TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  poster_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  area TEXT,
  city TEXT DEFAULT 'Lagos',
  budget TEXT,
  verified_only INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS job_interests (
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at BIGINT,
  PRIMARY KEY (job_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at BIGINT,
  read INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  community_id TEXT,
  creator_id TEXT NOT NULL,
  accent TEXT DEFAULT '#4A90E8',
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at BIGINT,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  review TEXT DEFAULT '',
  created_at BIGINT,
  PRIMARY KEY (user_id, community_id)
);

CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  cta_label TEXT DEFAULT 'Learn more',
  accent TEXT DEFAULT '#D8A63A',
  emoji TEXT DEFAULT '✨',
  active INTEGER DEFAULT 0,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS live_streams (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  title TEXT NOT NULL,
  started_at BIGINT,
  ended_at BIGINT,
  viewer_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_posts_community ON posts(community_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_dm_pair ON dm_messages(from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id);

-- Location privacy: 'exact' | 'city-only' | 'hidden'. 'neighborhood' is a
-- retired option; rows that still hold it are treated as 'exact'.
ALTER TABLE users ALTER COLUMN privacy SET DEFAULT 'city-only';

-- Public portfolio on the main profile.
ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio TEXT DEFAULT '[]';

-- Applicants track where each application stands.
ALTER TABLE job_interests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'applied';
ALTER TABLE job_interests ADD COLUMN IF NOT EXISTS status_at BIGINT;
ALTER TABLE job_interests ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

-- Voices: extra, separately shareable versions of a member's profile
-- (a work voice, a creative voice...). The main profile is the first voice;
-- these rows are the additional ones.
CREATE TABLE IF NOT EXISTS voices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  headline TEXT DEFAULT '',
  sections TEXT DEFAULT '[]',
  content TEXT DEFAULT '{}',
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_voices_user ON voices(user_id);

-- Presence: when a member last did anything, for the green "active" dot.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at BIGINT;

-- Members can start communities. Moderators can add rules of their own,
-- which sit beside the community's standing rules.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS created_at BIGINT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS mod_rules TEXT DEFAULT '[]';

-- Events members create inside a community. The seeded demo events still
-- live in the frontend catalog; these are the real ones.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  description TEXT DEFAULT '',
  attending INTEGER DEFAULT 1,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_events_community ON events(community_id);

-- Roles: owner > admin > moderator > member. Whoever started a community
-- owns it; before roles existed they were recorded as its moderator.
UPDATE memberships m SET role = 'owner' FROM communities c
  WHERE c.id = m.community_id AND c.created_by = m.user_id AND m.role = 'moderator';

-- When a role was last given by an owner or admin. Moderators with no such
-- record got the role from the retired demo rule ("the first community you
-- join, you moderate"), so they go back to being members. Seeded personas
-- keep the moderator roles the demo data gives them.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS role_set_at BIGINT;
UPDATE memberships m SET role = 'member' FROM users u
  WHERE u.id = m.user_id AND m.role = 'moderator' AND m.role_set_at IS NULL AND COALESCE(u.is_seed, 0) = 0;

-- Moderation history: every action a community's staff takes, so owners
-- can see what happened and who did it.
CREATE TABLE IF NOT EXISTS mod_log (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_user_id TEXT,
  summary TEXT DEFAULT '',
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_mod_log_community ON mod_log(community_id, created_at);

-- Settings (VOIDAJ-Blueprint.md §10). Contact details, one JSON blob of
-- preferences, and a token version: bumping it signs out every session.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings TEXT DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at BIGINT;

-- Every sign-in, so members can see where their account is being used.
CREATE TABLE IF NOT EXISTS login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  at BIGINT,
  user_agent TEXT DEFAULT '',
  ip TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, at);

-- "Report a problem" from Settings → Help & Support.
CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT DEFAULT 'problem',
  body TEXT NOT NULL,
  page TEXT DEFAULT '',
  created_at BIGINT
);

-- Photos, short camera videos and voice messages on posts and in chats.
-- A JSON list of { kind, type, src, ... }; src is an inline data URL for
-- now (placeholder until real object storage is wired up).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media TEXT DEFAULT '[]';
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS media TEXT DEFAULT '[]';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media TEXT DEFAULT '[]';

-- Verified jobs. How a job earns this isn't settled yet; for now a job is
-- verified when this flag is set or its poster is ID-verified.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS verified INTEGER DEFAULT 0;

-- Cover photos: a public link into the Supabase Storage bucket (see
-- server/storage.js), or a bundled /images/ path. Empty means none.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS cover TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover TEXT DEFAULT '';
-- How long a community or event stays up before it comes down (Nuel, Nov 21). NULL means no end.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS expires_at BIGINT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS expires_at BIGINT;

-- Social links on a profile: a JSON list of { kind, value }, where value
-- is a handle (instagram, x, …) or a full https link (website, other).
ALTER TABLE users ADD COLUMN IF NOT EXISTS socials TEXT DEFAULT '[]';

-- Admins (the CEO and whoever he trusts) can open /admin: every account,
-- sign-up numbers and a CSV download. Set by hand in the database.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin INTEGER DEFAULT 0;

-- The company's own accounts (Wix, Supabase, Vercel…): which login
-- controls each service, who owns it, what it costs. Never passwords —
-- those live in a password manager. Admins only.
CREATE TABLE IF NOT EXISTS company_accounts (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  purpose TEXT DEFAULT '',
  login TEXT DEFAULT '',
  url TEXT DEFAULT '',
  owner TEXT DEFAULT '',
  plan TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at BIGINT,
  updated_at BIGINT
);

-- Interact Space is now VOIDAJ: retitle members who never changed the
-- default headline.
UPDATE users SET title = 'New citizen of VOIDAJ' WHERE title = 'New citizen of Interact Space';

-- Ads belong to a city. 'local' ads show to people looking at that city;
-- 'universal' ones show everywhere (the rail's Local / Universal switch).
ALTER TABLE ads ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Lagos';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS reach TEXT DEFAULT 'local';
-- Ad requests are reviewed by a person before they go live (server/ads.js).
-- Rows from before this existed stay live.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'live';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT '';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS link TEXT DEFAULT '';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS logo TEXT DEFAULT '';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS cover TEXT DEFAULT '';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS review_note TEXT DEFAULT '';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS reviewed_at BIGINT;
-- The unpaid "Pay and go live" button used to switch any ad on. Anything
-- that was switched on that way and never reviewed is left as it was; new
-- requests start as 'pending' with active = 0.

-- Posts don't have to live in a community any more (Nuel, Oct 26):
-- 'public' posts are for everyone, 'city' posts for people in the
-- author's city, 'community' posts stay inside their community.
ALTER TABLE posts ALTER COLUMN community_id DROP NOT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'community';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';

-- Events too (Nuel, Oct 28: "post an event without going through
-- community route"). Same three audiences as posts; city is where the
-- creator lives, so My City can place public and city events.
ALTER TABLE events ALTER COLUMN community_id DROP NOT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'community';
ALTER TABLE events ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';

-- Followers are anyone who follows you, one way. Connections (the
-- existing table) are the people you've picked out — Nuel: "selected
-- people from the mass".
CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  followee_id TEXT NOT NULL,
  created_at BIGINT,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee ON follows (followee_id);

-- Status: a photo or a line of text that disappears after 24 hours.
CREATE TABLE IF NOT EXISTS statuses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  image TEXT DEFAULT '',
  text TEXT DEFAULT '',
  bg TEXT DEFAULT '',
  city TEXT DEFAULT '',
  created_at BIGINT,
  expires_at BIGINT
);
CREATE INDEX IF NOT EXISTS statuses_live ON statuses (expires_at);
CREATE TABLE IF NOT EXISTS status_views (
  status_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (status_id, user_id)
);

-- A profile photo and a cover photo (links, like community covers).
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover TEXT DEFAULT '';

-- Going to an event. event_id is text so it covers both events members
-- make (the events table) and the city calendar that ships with the app.
CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at BIGINT,
  PRIMARY KEY (event_id, user_id)
);

-- Quick Jobs: when it's needed, whether it can be done remotely, and
-- whether the poster takes offers. Anyone offering can name their own
-- price (Nuel: "in case of price there should be a 'make an offer'").
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS timing TEXT DEFAULT 'Flexible';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS remote INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS open_to_offers INTEGER DEFAULT 1;
ALTER TABLE job_interests ADD COLUMN IF NOT EXISTS offer TEXT DEFAULT '';
ALTER TABLE job_interests ADD COLUMN IF NOT EXISTS offer_note TEXT DEFAULT '';
UPDATE jobs SET timing = 'Today' WHERE timing = 'Flexible' AND category IN ('plumbing', 'appliance-repair', 'electrical') AND poster_id IN (SELECT id FROM users WHERE COALESCE(is_seed, 0) = 1);
UPDATE jobs SET timing = 'This weekend' WHERE timing = 'Flexible' AND category IN ('moving', 'painting', 'cleaning') AND poster_id IN (SELECT id FROM users WHERE COALESCE(is_seed, 0) = 1);
UPDATE jobs SET remote = 1 WHERE category IN ('tech-support', 'tutoring') AND remote = 0 AND poster_id IN (SELECT id FROM users WHERE COALESCE(is_seed, 0) = 1);

-- Where a conversation started (Nuel: "make it known where someone is
-- communicating to you from… from a community, for a job, about an
-- event"). JSON: { kind, id, title, sub, image, link }.
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS context TEXT DEFAULT '';

-- The VOIDAJ engagement system (Nuel's mockup v2.0, Nov 2):
--   Spark  — a reaction, one per person per post, of five kinds.
--   Loom   — spreading a post: a new post that carries the original.
-- Take is a comment and Stash is a save, so they need nothing new here.
-- Existing likes carry over as plain Sparks.
CREATE TABLE IF NOT EXISTS post_sparks (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'spark',
  created_at BIGINT,
  PRIMARY KEY (post_id, user_id)
);
INSERT INTO post_sparks (post_id, user_id, kind, created_at)
  SELECT target_id, user_id, 'spark', 0 FROM votes WHERE target_type = 'post' AND value = 1
  ON CONFLICT DO NOTHING;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS loom_of TEXT;
CREATE INDEX IF NOT EXISTS idx_posts_loom ON posts(loom_of);

-- Badges a member made themselves (Badging → Create).
CREATE TABLE IF NOT EXISTS custom_badges (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'violet',
  hidden INTEGER DEFAULT 0,
  created_at BIGINT
);
-- Nuel, Nov 28: people can upload their own picture for a badge they make.
ALTER TABLE custom_badges ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';

-- Citizen level (New Citizen → Resident → … → City Icon), kept on the
-- user so names in lists can show it without recounting. Badges a member
-- has chosen to hide from their profile.
ALTER TABLE users ADD COLUMN IF NOT EXISTS citizen_level INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden_badges TEXT DEFAULT '[]';

-- The same list as a read-only "spreadsheet" in Supabase's Table Editor
-- (schema "admin", view "ceo_users"). It leaves out password hashes and
-- private settings, and sits outside the public schema so Supabase's Data
-- API never serves it.
CREATE SCHEMA IF NOT EXISTS admin;
CREATE OR REPLACE VIEW admin.ceo_users AS
  SELECT u.name, u.handle AS username, u.email, u.phone, u.city, u.area,
    to_timestamp(u.created_at / 1000.0) AS joined,
    to_timestamp(u.last_seen_at / 1000.0) AS last_active,
    (COALESCE(u.id_verified, 0) = 1) AS id_verified,
    (COALESCE(u.onboarded, 0) = 1) AS finished_signup,
    (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id) AS communities,
    (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS posts,
    (SELECT COUNT(*) FROM jobs j WHERE j.poster_id = u.id) AS jobs_posted,
    (SELECT COUNT(*) FROM job_interests ji WHERE ji.user_id = u.id) AS jobs_offered_on,
    (COALESCE(u.is_seed, 0) = 1) AS sample_account
  FROM users u
  WHERE u.deleted_at IS NULL
  ORDER BY (COALESCE(u.is_seed, 0) = 1), u.created_at DESC;

-- Sign in with Google / Apple (Nuel, Nov 9): each provider's own id for
-- the person, so they land in the same account every time.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub ON users (apple_sub) WHERE apple_sub IS NOT NULL;

-- Business on VOIDAJ (Nuel's mockup, Nov 8; routes in server/business.js):
-- a business profile, its listings, followers, reviews and promotions.
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT DEFAULT '',
  city TEXT DEFAULT 'Lagos',
  area TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  cover TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  hours TEXT DEFAULT '',
  verified INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  enquiries INTEGER DEFAULT 0,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS businesses_owner ON businesses (owner_id);
CREATE TABLE IF NOT EXISTS business_listings (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'product',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  price BIGINT,
  status TEXT DEFAULT '',
  image TEXT DEFAULT '',
  area TEXT DEFAULT '',
  views INTEGER DEFAULT 0,
  enquiries INTEGER DEFAULT 0,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS business_listings_biz ON business_listings (business_id);
CREATE TABLE IF NOT EXISTS business_follows (
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at BIGINT,
  PRIMARY KEY (business_id, user_id)
);
CREATE TABLE IF NOT EXISTS business_reviews (
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  body TEXT DEFAULT '',
  created_at BIGINT,
  PRIMARY KEY (business_id, user_id)
);
CREATE TABLE IF NOT EXISTS business_promotions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  audience TEXT NOT NULL,
  days INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  reach_low INTEGER,
  reach_high INTEGER,
  views_at_start INTEGER DEFAULT 0,
  enquiries_at_start INTEGER DEFAULT 0,
  starts_at BIGINT,
  ends_at BIGINT
);
CREATE INDEX IF NOT EXISTS business_promotions_live ON business_promotions (ends_at);

-- Nuel, Nov 11–12. One category list shared by events and communities
-- (server/categories.js). Events can be in person, online or hybrid, have
-- a capacity (extra people go on a waitlist), and people can say Going or
-- Interested. Who you are on an attendee list is private unless you choose
-- to show it ("Default: Private attendance").
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'in-person';
ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE event_rsvps ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'going';
ALTER TABLE event_rsvps ADD COLUMN IF NOT EXISTS visible INTEGER DEFAULT 0;
CREATE TABLE IF NOT EXISTS event_reports (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at BIGINT,
  PRIMARY KEY (event_id, user_id)
);

-- Jobs & Services (Nuel's notes, Nov 9 and 12): a listing is a Job ("I
-- need someone") or a Service ("I can do this for you"), and is Paid work,
-- Volunteering, Free help or a Skill exchange; work is Local, Remote or
-- Hybrid. Payments stay between the two people at launch.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'job';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS opportunity TEXT DEFAULT 'paid';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS arrangement TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS exchange TEXT DEFAULT '';

-- Referrals raise your citizen level (Nuel, Nov 12: "the more people they
-- refer the bar increases to a new status"). Age is asked before anything
-- else; the minimum is 16 for now (Nuel, Nov 10).
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT;
CREATE INDEX IF NOT EXISTS users_referred_by ON users (referred_by);

-- Nov 12 plan (PLAN-NOTES-AND-GLOBAL.md). Security: attempt limits, email
-- confirmation codes, blocking. Accounts that existed before email codes
-- (and Google/Apple ones, whose provider confirmed the email) count as
-- confirmed; a new account has a code waiting until it's typed in.
CREATE TABLE IF NOT EXISTS rate_hits (key TEXT NOT NULL, at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS rate_hits_key_at ON rate_hits (key, at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_code_expires BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_code_tries INTEGER DEFAULT 0;
UPDATE users SET email_confirmed_at = COALESCE(created_at, 0) WHERE email_confirmed_at IS NULL AND email_code IS NULL;
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at BIGINT,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Outside Nigeria: a country on accounts and on what they create, a time
-- zone on events and a currency on paid jobs and services.
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'NG';
ALTER TABLE events ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'NG';
ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Africa/Lagos';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'NG';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'NG';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN';

-- Events note: co-hosts and moderators, invite-only events (rsvp status
-- 'requested' until a host approves, 'invited' when a host asks someone),
-- announcements, and an Event Circle group chat.
ALTER TABLE events ADD COLUMN IF NOT EXISTS invite_only INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at BIGINT;
CREATE TABLE IF NOT EXISTS event_hosts (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'cohost',
  added_at BIGINT,
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS event_announcements (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS event_announcements_event ON event_announcements (event_id, created_at);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS event_id TEXT;

-- Jobs & Services note: the poster shortlists and hires, an agreement is
-- written down, the job moves Open → Worker selected → In progress →
-- Completed, both sides review each other, and either can raise a dispute.
-- Services can be paused.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status_at BIGINT;
CREATE TABLE IF NOT EXISTS job_agreements (
  job_id TEXT PRIMARY KEY,
  poster_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  price TEXT DEFAULT '',
  terms TEXT DEFAULT '',
  created_at BIGINT,
  accepted_at BIGINT
);
CREATE TABLE IF NOT EXISTS job_reviews (
  job_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  body TEXT DEFAULT '',
  created_at BIGINT,
  PRIMARY KEY (job_id, from_id)
);
CREATE INDEX IF NOT EXISTS job_reviews_to ON job_reviews (to_id);
CREATE TABLE IF NOT EXISTS job_disputes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  created_at BIGINT
);
-- ID checks reviewed by a person (server/id-checks.js). The photos and
-- the typed name are wiped the moment a check is decided.
CREATE TABLE IF NOT EXISTS id_checks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  legal_name TEXT,
  document TEXT,
  selfie TEXT,
  status TEXT DEFAULT 'pending',
  reason TEXT DEFAULT '',
  reviewer_id TEXT,
  reviewed_at BIGINT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS id_checks_user ON id_checks (user_id, created_at);
-- Services (server/services.js): proof-of-work photos and availability.
-- Usernames must be unique, whatever the capitals. Until now they were made
-- from the first name alone, so duplicates exist. In each group the account
-- that is really in use keeps the name (admin, finished onboarding, most
-- communities and posts, seen most recently, then the oldest); the others get
-- a short suffix. Then the rule is enforced.
UPDATE users u SET handle = LEFT(u.handle, 15) || '_' || RIGHT(u.id, 4)
  FROM (
    SELECT x.id, ROW_NUMBER() OVER (
      PARTITION BY LOWER(x.handle)
      ORDER BY COALESCE(x.is_admin, 0) DESC, COALESCE(x.onboarded, 0) DESC,
        (SELECT COUNT(*) FROM memberships m WHERE m.user_id = x.id) + (SELECT COUNT(*) FROM posts p WHERE p.author_id = x.id) DESC,
        COALESCE(x.last_seen_at, 0) DESC, COALESCE(x.created_at, 0), x.id) AS rn
    FROM users x WHERE x.handle IS NOT NULL
  ) r
  WHERE u.id = r.id AND r.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_unique ON users (LOWER(handle)) WHERE handle IS NOT NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT '';
-- A business belongs to a country, not just a city, so its page doesn't say
-- "Nigeria" for everyone. Existing ones are the owner's country.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS country TEXT;
-- "Other" businesses can name their own category (Nuel, Nov 28).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS category_other TEXT;
-- The example adverts named Nigerian districts; they now read the same anywhere.
UPDATE ads SET tagline = 'Northern fabrics, tailored to order' WHERE business_name = 'Arewa Threads' AND tagline = 'Northern fabrics, tailored in Abuja';
UPDATE ads SET tagline = 'Gyms, classes and coaching' WHERE business_name = 'Capital Fitness' AND tagline = 'Gyms in Wuse and Garki';
UPDATE ads SET tagline = 'The best suya, grilled fresh' WHERE business_name = 'Garden City Grills' AND tagline LIKE 'Port Harcourt%';
UPDATE ads SET tagline = 'Spices, ground fresh' WHERE business_name = 'Kano Spice House' AND tagline = 'Spices from Kurmi market';
UPDATE businesses b SET country = COALESCE((SELECT u.country FROM users u WHERE u.id = b.owner_id), 'NG') WHERE b.country IS NULL;
-- What kind of profile someone chose in onboarding (Nuel, Oct 14 + Nov 18).
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_type TEXT DEFAULT 'individual';
-- Collecting funds for an event (Nuel, Nov 21: "we can collect funds for events").
-- The host turns it on; people pay through Paystack straight to the host's bank
-- account (the same subaccount job payments use). VOIDAJ never holds the money.
ALTER TABLE events ADD COLUMN IF NOT EXISTS fund_open INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS fund_goal BIGINT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS fund_note TEXT DEFAULT '';
-- Where the venue is, looked up once (server/geocode.js), for the map.
ALTER TABLE events ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS geo_q TEXT;
CREATE TABLE IF NOT EXISTS event_contributions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  payer_id TEXT NOT NULL,
  payee_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  fee BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  reference TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  created_at BIGINT,
  paid_at BIGINT
);
CREATE INDEX IF NOT EXISTS event_contributions_event ON event_contributions (event_id, status);
-- A sign-up waiting for its emailed code. The account is only made once the
-- code is confirmed (Nuel, Nov 21: "email confirmation before any account creation").
CREATE TABLE IF NOT EXISTS pending_signups (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  birth_date TEXT,
  country TEXT,
  ref TEXT,
  code_hash TEXT,
  code_expires BIGINT,
  tries INTEGER DEFAULT 0,
  created_at BIGINT
);
-- Posts a member has chosen not to see (Nuel, Nov 22: post actions like hide and delete).
CREATE TABLE IF NOT EXISTS hidden_posts (
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at BIGINT,
  PRIMARY KEY (user_id, post_id)
);
-- Gender, optional, and whether it shows on the profile (Nuel, Nov 21).
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_public INTEGER DEFAULT 0;
CREATE TABLE IF NOT EXISTS service_photos (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  src TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS service_photos_job ON service_photos (job_id, position);
-- Until now the badge was self-assigned. Accounts that already have it keep
-- it (David, Nov 19: the ten live members stay verified). New badges only come
-- from an approved ID check; an admin can still remove one in Admin > ID checks.
-- Quick Job payments with Paystack (server/payments.js). VOIDAJ takes no cut
-- and never holds the money: the worker has a Paystack subaccount, and the
-- poster's saved card is charged straight to it when the job is done.
CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id TEXT PRIMARY KEY,
  subaccount_code TEXT NOT NULL,
  bank_code TEXT,
  bank_name TEXT,
  account_name TEXT,
  last4 TEXT,
  created_at BIGINT
);
CREATE TABLE IF NOT EXISTS payment_cards (
  user_id TEXT PRIMARY KEY,
  authorization_code TEXT NOT NULL,
  email TEXT NOT NULL,
  brand TEXT,
  last4 TEXT,
  exp TEXT,
  bank TEXT,
  created_at BIGINT
);
CREATE TABLE IF NOT EXISTS job_payments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  payer_id TEXT NOT NULL,
  payee_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  fee BIGINT NOT NULL,
  currency TEXT NOT NULL,
  reference TEXT UNIQUE,
  status TEXT DEFAULT 'awaiting',
  failure TEXT DEFAULT '',
  created_at BIGINT,
  paid_at BIGINT
);
CREATE INDEX IF NOT EXISTS job_payments_job ON job_payments (job_id, created_at);
-- Card checks (a small charge that is refunded) the server has started,
-- so a returning reference can be tied to the person who started it.
CREATE TABLE IF NOT EXISTS payment_setups (
  reference TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  job_id TEXT,
  created_at BIGINT,
  done_at BIGINT
);
ALTER TABLE job_agreements ADD COLUMN IF NOT EXISTS amount BIGINT;
ALTER TABLE job_agreements ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE job_agreements ADD COLUMN IF NOT EXISTS fee BIGINT;
-- Keeping both sides honest on paid jobs (server/job-safety.js).
-- A payment row is one charge: the job itself, a part paid up front, or a
-- cancellation fee. Failed charges are retried by themselves (Uber-style),
-- and the poster is reminded before an automatic charge.
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'job';
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS next_try_at BIGINT;
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS reminded INTEGER DEFAULT 0;
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS was_due INTEGER DEFAULT 0;
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS how TEXT DEFAULT '';
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS evidence TEXT;
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS chargeback_at BIGINT;
ALTER TABLE job_payments ADD COLUMN IF NOT EXISTS chargeback_status TEXT;
-- An agreement can include a part paid when the work starts, and a count
-- of "please fix this" rounds the poster has asked for.
ALTER TABLE job_agreements ADD COLUMN IF NOT EXISTS upfront BIGINT;
ALTER TABLE job_agreements ADD COLUMN IF NOT EXISTS change_rounds INTEGER DEFAULT 0;
-- A fingerprint of the card (Paystack's signature), to spot one card on
-- several accounts, and a keyed hash of the payout account number.
ALTER TABLE payment_cards ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE payout_accounts ADD COLUMN IF NOT EXISTS account_hash TEXT;
-- Changing where you get paid needs a code from your email and only takes
-- effect 24 hours later; until then payments go to the old account and
-- the change can be cancelled.
CREATE TABLE IF NOT EXISTS payout_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT,
  account_name TEXT,
  last4 TEXT,
  account_number TEXT,
  account_hash TEXT,
  subaccount_code TEXT,
  code_hash TEXT,
  code_expires BIGINT,
  tries INTEGER DEFAULT 0,
  confirmed_at BIGINT,
  effective_at BIGINT,
  applied_at BIGINT,
  cancelled_at BIGINT,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS payout_changes_user ON payout_changes (user_id, created_at);
-- Everything that happens on a job, with who did it and from where: the
-- record the team uses for disputes and to answer a bank chargeback.
CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  at BIGINT
);
CREATE INDEX IF NOT EXISTS job_events_job ON job_events (job_id, at);
-- Photos of the finished work, and evidence attached to a problem report.
-- Kept in the database and shown only to the two people and the team.
CREATE TABLE IF NOT EXISTS job_photos (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  dispute_id TEXT,
  src TEXT NOT NULL,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS job_photos_job ON job_photos (job_id, created_at);
-- A new price either side proposes once work is agreed; the other accepts.
CREATE TABLE IF NOT EXISTS job_price_changes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  by_id TEXT NOT NULL,
  price TEXT,
  amount BIGINT NOT NULL,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at BIGINT,
  answered_at BIGINT
);
CREATE INDEX IF NOT EXISTS job_price_changes_job ON job_price_changes (job_id, created_at);
-- No-shows: the poster says the worker never came. Counts on the worker's
-- record unless the team overturns it.
CREATE TABLE IF NOT EXISTS job_no_shows (
  job_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  overturned INTEGER DEFAULT 0,
  created_at BIGINT
);
-- Problem reports: what kind, the other side's answer, and how it ended.
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS responded_at BIGINT;
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS paid_amount BIGINT;
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS unfounded INTEGER DEFAULT 0;
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS resolved_at BIGINT;
ALTER TABLE job_disputes ADD COLUMN IF NOT EXISTS resolver_id TEXT;
-- Things the team should look at: the same card or bank on two accounts,
-- two accounts on one connection, a chargeback.
CREATE TABLE IF NOT EXISTS risk_flags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  other_id TEXT,
  job_id TEXT,
  kind TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at BIGINT,
  cleared_at BIGINT,
  cleared_by TEXT
);
CREATE INDEX IF NOT EXISTS risk_flags_open ON risk_flags (cleared_at, created_at);
`

// ── Roles ────────────────────────────────────────────────────────────
// Owner, admin and moderator are a community's staff: all three can
// moderate. Rank decides who can change whose role.
export const ROLE_RANK = { member: 0, moderator: 1, admin: 2, owner: 3 }
export const STAFF_ROLES = ['owner', 'admin', 'moderator']
export const STAFF_SQL = "('owner', 'admin', 'moderator')"
export const isStaff = (role) => STAFF_ROLES.includes(role)

// Run once per cold start, and only once even if several requests race to
// be first — every caller awaits the same promise.
//
// On Vercel several copies of the server start at once, and each used to
// run the whole SCHEMA at the same moment. Once SCHEMA had UPDATEs and
// ALTERs in it the copies locked each other out ("deadlock detected") and
// every request failed (Oct 28). So now:
//   1. SCHEMA's fingerprint is stored in schema_meta. If the database is
//      already on this version, a cold start skips SCHEMA entirely.
//   2. Otherwise one copy at a time applies it, inside a transaction that
//      holds an advisory lock; the others wait, see the new version, and skip.
const SCHEMA_VERSION = crypto.createHash('sha256').update(SCHEMA).digest('hex').slice(0, 16)
const SCHEMA_LOCK = 7104201
let ready = null
export function init() {
  if (!ready) {
    ready = applySchema().catch((e) => {
      ready = null // let the next request retry
      throw e
    })
  }
  return ready
}

async function applySchema() {
  const client = await pool.connect()
  const current = async () =>
    (await client.query('SELECT version FROM schema_meta WHERE id = 1')).rows[0]?.version
  try {
    try {
      await client.query('CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY, version TEXT, applied_at BIGINT)')
    } catch (e) {
      // Two copies creating it at the same instant: the other one won.
      if (e.code !== '23505' && e.code !== '42P07') throw e
    }
    if ((await current()) === SCHEMA_VERSION) return
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK])
    if ((await current()) !== SCHEMA_VERSION) {
      await client.query(SCHEMA)
      await client.query(`INSERT INTO schema_meta (id, version, applied_at) VALUES (1, $1, $2)
        ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = EXCLUDED.applied_at`, [SCHEMA_VERSION, Date.now()])
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

// Run several writes as one unit on a single connection, so a failure
// half-way leaves nothing behind (used by the seeder).
export async function transaction(fn) {
  const client = await pool.connect()
  const runner = {
    get: async (sql, ...a) => (await client.query(toPg(sql), a)).rows[0],
    all: async (sql, ...a) => (await client.query(toPg(sql), a)).rows,
    run: async (sql, ...a) => ({ changes: (await client.query(toPg(sql), a)).rowCount }),
  }
  try {
    await client.query('BEGIN')
    const out = await fn(runner)
    await client.query('COMMIT')
    return out
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

const json = (v, fallback = []) => { try { return JSON.parse(v) } catch { return fallback } }

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`
  const w = Math.floor(d / 7); if (w < 5) return `${w}w`
  return `${Math.floor(d / 30)}mo`
}

// ── User serialization ───────────────────────────────────────────────
// What location a member has agreed to show others.
export function visibleLocation(row) {
  const privacy = row.privacy || 'city-only'
  if (privacy === 'hidden') return { city: null, area: null }
  if (privacy === 'city-only') return { city: row.city, area: null }
  return { city: row.city, area: row.area } // 'exact', and retired 'neighborhood'
}

// Someone who did anything in the last few minutes counts as active.
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000
export const isActive = (row) => !!row?.last_seen_at && Date.now() - row.last_seen_at < ACTIVE_WINDOW_MS

// ── Citizen levels and badges ────────────────────────────────────────
// Everyone starts as a New Citizen of VOIDAJ (Nuel, Oct 29: "when this
// goes what comes next?"). Points come from taking part; each level is a
// step up the city. The default title follows the level; a title someone
// wrote themselves is left alone.
export const DEFAULT_TITLE = 'New citizen of VOIDAJ'
export const LEVELS = [
  { level: 0, name: 'New Citizen', at: 0, blurb: 'Just arrived in the city' },
  { level: 1, name: 'Resident', at: 25, blurb: 'Settling in and taking part' },
  { level: 2, name: 'Neighbour', at: 80, blurb: 'Known on the block' },
  { level: 3, name: 'Local Voice', at: 200, blurb: 'People listen when you post' },
  { level: 4, name: 'Community Pillar', at: 450, blurb: 'Holds communities together' },
  { level: 5, name: 'City Icon', at: 900, blurb: 'A face of VOIDAJ' },
]
export const levelTitle = (n) => `${LEVELS[Math.min(Math.max(n || 0, 0), LEVELS.length - 1)].name} of VOIDAJ`

// City Icon used to be the end of the road: the bar filled and stayed full
// for good. Past it the ladder keeps going in numbered tiers, so there is
// always a next step to climb.
const PRESTIGE_STEP = 600
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
function roman(n) {
  let out = ''
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v }
  return out
}

// A tier at or beyond the last named level: City Icon, City Icon II, …
function prestige(tier) {
  const top = LEVELS[LEVELS.length - 1]
  return {
    ...top,
    level: top.level + tier,
    tier: tier + 1,
    at: top.at + tier * PRESTIGE_STEP,
    name: tier === 0 ? top.name : `${top.name} ${roman(tier + 1)}`,
    blurb: tier === 0 ? top.blurb : `A face of VOIDAJ, ${roman(tier + 1)} times over`,
  }
}

// Where a points total sits on the ladder, and what comes next. `next` is
// never null now, so the progress bar always has something to fill toward.
export function ladderFor(points) {
  const top = LEVELS[LEVELS.length - 1]
  if (points < top.at) {
    const level = [...LEVELS].reverse().find((l) => points >= l.at)
    const next = LEVELS[level.level + 1]
    return { level: { ...level, tier: 1 }, next: next.level === top.level ? prestige(0) : { ...next, tier: 1 } }
  }
  const tier = Math.floor((points - top.at) / PRESTIGE_STEP)
  return { level: prestige(tier), next: prestige(tier + 1) }
}

// What each kind of taking part is worth. `verified` is deliberately absent
// while the badge is self-assigned — it was worth 20 points, which anyone
// could help themselves to (see server/verification.js).
const POINTS = { referrals: 10, posts: 5, takes: 2, sparksGiven: 1, sparksGot: 1, looms: 3, communities: 3, communitiesBuilt: 25, eventsHosted: 12, jobsDone: 10, jobsPosted: 4, followers: 1,
  ...(VERIFICATION_IS_REAL ? { verified: 20 } : {}) }

// Badges anyone can earn, and how.
export const ORIGIN_LIMIT = 1000
export const BADGES = [
  // Nuel, Nov 28: "The Origin, Founding 1,000", for the first 1,000 people
  // to join. Demo (seed) accounts never count towards the 1,000.
  { id: 'origin', name: 'The Origin', style: 'origin', how: 'One of the first 1,000 members of VOIDAJ', test: (s) => s.memberNo > 0 && s.memberNo <= ORIGIN_LIMIT },
  { id: 'early-explorer', name: 'Early Explorer', style: 'green', how: 'Joined VOIDAJ in its first year', test: (s) => s.joinedYear <= 2026 },
  // Only a badge once it means something; a self-assigned one claiming
  // "Had your ID checked" would be a false statement on a profile.
  ...(VERIFICATION_IS_REAL ? [{ id: 'verified', name: 'Verified', style: 'blue', how: 'Had your ID checked', test: (s) => s.verified }] : []),
  { id: 'first-post', name: 'First Words', style: 'teal', how: 'Shared your first post', test: (s) => s.posts >= 1 },
  { id: 'top-contributor', name: 'Top Contributor', style: 'silver', how: 'Shared 10 or more posts', test: (s) => s.posts >= 10 },
  { id: 'thinker', name: 'Hot Take', style: 'orange', how: 'Shared 10 or more takes', test: (s) => s.takes >= 10 },
  { id: 'supporter', name: 'Supporter', style: 'red', how: 'Sparked 20 or more posts', test: (s) => s.sparksGiven >= 20 },
  { id: 'connector', name: 'Connector', style: 'violet', how: 'Joined 3 or more communities', test: (s) => s.communities >= 3 },
  { id: 'community-builder', name: 'Community Builder', style: 'gold', how: 'Started a community on VOIDAJ', test: (s) => s.communitiesBuilt >= 1 },
  { id: 'event-host', name: 'Event Host', style: 'red', how: 'Hosted an event', test: (s) => s.eventsHosted >= 1 },
  { id: 'weaver', name: 'Weaver', style: 'violet', how: 'Loomed 5 posts across VOIDAJ', test: (s) => s.looms >= 5 },
  { id: 'trusted-hand', name: 'Trusted Hand', style: 'orange', how: 'Got hired for a quick job', test: (s) => s.jobsDone >= 1 },
  { id: 'well-known', name: 'Well Known', style: 'gold', how: 'Reached 25 followers', test: (s) => s.followers >= 25 },
  { id: 'recruiter', name: 'Recruiter', style: 'teal', how: 'Brought a friend to VOIDAJ', test: (s) => s.referrals >= 1 },
  { id: 'ambassador', name: 'Ambassador', style: 'gold', how: 'Brought 10 people to VOIDAJ', test: (s) => s.referrals >= 10 },
]

export async function journey(row) {
  const id = row.id
  const n = (sql, ...a) => q.get(sql, ...a).then((r) => r?.n ?? 0)
  const [posts, takes, sparksGiven, sparksGot, looms, communities, communitiesBuilt, eventsHosted, jobsDone, jobsPosted, followers, referrals, custom] = await Promise.all([
    n('SELECT COUNT(*)::int AS n FROM posts WHERE author_id = ? AND hidden = 0 AND loom_of IS NULL', id),
    n('SELECT COUNT(*)::int AS n FROM comments WHERE author_id = ? AND hidden = 0', id),
    n('SELECT COUNT(*)::int AS n FROM post_sparks WHERE user_id = ?', id),
    n('SELECT COUNT(*)::int AS n FROM post_sparks s JOIN posts p ON p.id = s.post_id WHERE p.author_id = ? AND s.user_id <> ?', id, id),
    n('SELECT COUNT(*)::int AS n FROM posts WHERE author_id = ? AND loom_of IS NOT NULL', id),
    n('SELECT COUNT(*)::int AS n FROM memberships WHERE user_id = ?', id),
    n("SELECT COUNT(*)::int AS n FROM memberships WHERE user_id = ? AND role = 'owner'", id),
    n('SELECT COUNT(*)::int AS n FROM events WHERE creator_id = ?', id),
    n("SELECT COUNT(*)::int AS n FROM job_interests WHERE user_id = ? AND status = 'hired'", id),
    n('SELECT COUNT(*)::int AS n FROM jobs WHERE poster_id = ?', id),
    n('SELECT COUNT(*)::int AS n FROM follows WHERE followee_id = ?', id),
    n('SELECT COUNT(*)::int AS n FROM users WHERE referred_by = ? AND deleted_at IS NULL', id),
    q.all('SELECT * FROM custom_badges WHERE owner_id = ? ORDER BY created_at DESC', id),
  ])
  // Your place in the queue of real members, counting deleted accounts too,
  // so a number is never handed out twice.
  const memberNo = row.is_seed ? 0 : await n(
    'SELECT COUNT(*)::int AS n FROM users u, (SELECT created_at, id FROM users WHERE id = ?) me WHERE COALESCE(u.is_seed, 0) = 0 AND (u.created_at < me.created_at OR (u.created_at = me.created_at AND u.id <= me.id))', id)
  const stats = { posts, takes, sparksGiven, sparksGot, looms, communities, communitiesBuilt, eventsHosted, jobsDone, jobsPosted, followers, referrals,
    verified: !!row.id_verified, memberNo, joinedYear: new Date(row.created_at || Date.now()).getFullYear() }
  const points = Object.entries(POINTS).reduce((sum, [k, w]) => sum + (k === 'verified' ? (stats.verified ? w : 0) : (stats[k] || 0) * w), 0)
  const { level, next } = ladderFor(points)
  if ((row.citizen_level ?? 0) !== level.level) {
    await q.run('UPDATE users SET citizen_level = ? WHERE id = ?', level.level, id)
  }
  const hidden = new Set(json(row.hidden_badges))
  const earned = BADGES.filter((b) => b.test(stats)).map(({ test, ...b }) => ({ ...b, earned: true, hidden: hidden.has(b.id),
    ...(b.id === 'origin' ? { how: `Founding member #${memberNo} of the first ${ORIGIN_LIMIT.toLocaleString('en')}` } : {}) }))
  return {
    points, level: { ...level, title: levelTitle(level.level) }, next,
    toNext: Math.max(0, next.at - points),
    progress: Math.min(100, Math.round(((points - level.at) / (next.at - level.at)) * 100)),
    levels: LEVELS, stats,
    badges: earned,
    custom: custom.map((c) => ({ id: c.id, name: c.name, style: c.style, image: c.image || '', hidden: !!c.hidden, custom: true, how: 'Made by you' })),
    catalog: BADGES.map(({ test, ...b }) => ({ ...b, earned: earned.some((e) => e.id === b.id) })),
  }
}

// Pure — no database access — so it stays synchronous.
export function publicUser(row) {
  if (!row) return null
  return {
    active: isActive(row), lastSeenAt: row.last_seen_at ?? null,
    id: row.id, name: row.name, handle: row.handle,
    // Built-in sample accounts, so their pages can ask search engines not to list them.
    ...(row.is_seed ? { sample: true } : {}),
    title: row.title === DEFAULT_TITLE && row.citizen_level ? levelTitle(row.citizen_level) : row.title,
    citizenLevel: row.citizen_level ?? 0,
    ...visibleLocation(row), color: row.color, bio: row.bio,
    interests: json(row.interests), goals: json(row.goals), skills: json(row.skills),
    portfolio: json(row.portfolio),
    socials: json(row.socials),
    photo: row.photo || '', cover: row.cover || '',
    // Only shown when the owner chose to show it.
    gender: row.gender_public ? (row.gender || '') : '',
    idVerified: !!row.id_verified,
    // Country follows the same "hidden" location setting as city.
    country: row.privacy === 'hidden' ? null : (row.country || 'NG'),
  }
}

// Preferences a member can change in Settings. Stored values are merged
// over these, so a new preference needs no migration.
export const DEFAULT_SETTINGS = {
  messages: 'everyone', // who can message you: 'everyone' | 'connections' | 'nobody'
  // When true you are left out of the Find people directory on Quick Jobs and
  // your work skills stay yours alone. Job history has always been private.
  workPrivate: false,
  notify: { messages: true, jobs: true, community: true, events: true, push: true },
  reduceMotion: false,
  largeText: false,
  language: 'en',
  theme: 'dark', // 'system' | 'light' | 'dark' — dark by default, like the mockups
}
export function readSettings(row) {
  const s = json(row?.settings, {})
  return { ...DEFAULT_SETTINGS, ...s, notify: { ...DEFAULT_SETTINGS.notify, ...(s.notify || {}) } }
}

const AGE_ASKED_FROM = Date.UTC(2026, 10, 19, 16, 0, 0)
const num = (v) => Number(v) || 0

// The full "me" object the frontend keeps as the current user.
export async function selfUser(row) {
  if (!row) return null
  const [communities, connections, following] = await Promise.all([
    q.all('SELECT community_id AS id, role FROM memberships WHERE user_id = ?', row.id),
    q.all('SELECT other_id FROM connections WHERE user_id = ?', row.id),
    q.all('SELECT followee_id FROM follows WHERE follower_id = ?', row.id),
  ])
  return {
    ...publicUser(row),
    city: row.city, area: row.area,
    privacy: row.privacy === 'neighborhood' ? 'exact' : row.privacy,
    onboarded: !!row.onboarded,
    communities: communities.map((c) => c.id),
    // Every community you're staff in (owner, admin or moderator).
    moderatorOf: communities.filter((c) => isStaff(c.role)).map((c) => c.id),
    roles: Object.fromEntries(communities.map((c) => [c.id, c.role])),
    connections: connections.map((r) => r.other_id),
    following: following.map((r) => r.followee_id),
    jobSkills: json(row.job_skills),
    // Private to the member themselves — never in publicUser.
    email: row.email, phone: row.phone || '',
    settings: readSettings(row),
    createdAt: row.created_at, profileType: row.profile_type || 'individual',
    gender: row.gender || '', genderPublic: !!row.gender_public,
    isAdmin: !!row.is_admin,
    hasPassword: !!row.password_hash,
    linked: { google: !!row.google_sub, apple: !!row.apple_sub },
    // Asked once, when an account is made (Google and Apple sign-ups don't
    // give a date of birth up front). Accounts that existed before this
    // went live on 19 Nov 2026 are never asked at sign-in, and neither are
    // sample accounts.
    needsAge: !row.birth_date && !row.is_seed && num(row.created_at) >= AGE_ASKED_FROM,
    country: row.country || 'NG',
    features: featuresFor(row.country || 'NG'),
    emailConfirmed: !!row.email_confirmed_at || !!row.is_seed,
  }
}

export const getUserById = (id) => q.get('SELECT * FROM users WHERE id = ?', id)
export const getUserByEmail = (email) => q.get('SELECT * FROM users WHERE email = ?', String(email).toLowerCase())

// ── Post / comment serialization with live scores ────────────────────
async function myVote(viewerId, type, id) {
  if (!viewerId) return 0
  const row = await q.get('SELECT value FROM votes WHERE user_id = ? AND target_type = ? AND target_id = ?', viewerId, type, id)
  return row?.value ?? 0
}

const scoreOf = async (type, id) =>
  (await q.get('SELECT COALESCE(SUM(value),0) AS s FROM votes WHERE target_type = ? AND target_id = ?', type, id)).s

export const SPARK_KINDS = ['spark', 'insight', 'support', 'fire', 'relate']

// The Sparks on a post: how many of each kind, and which one is yours.
// base_score keeps the demo posts' starting numbers.
async function sparksFor(row, viewerId) {
  const [rows, mine] = await Promise.all([
    q.all('SELECT kind, COUNT(*)::int AS n FROM post_sparks WHERE post_id = ? GROUP BY kind', row.id),
    viewerId ? q.get('SELECT kind FROM post_sparks WHERE post_id = ? AND user_id = ?', row.id, viewerId) : null,
  ])
  const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.n]))
  const total = Math.max(0, (row.base_score || 0) + rows.reduce((n, r) => n + r.n, 0))
  return { total, byKind, mine: mine?.kind || null }
}

export async function serializePost(row, viewerId, { nested = false } = {}) {
  const [authorRow, countRow, score, mine, sparks, loomRow, original] = await Promise.all([
    getUserById(row.author_id),
    q.get('SELECT COUNT(*) AS n FROM comments WHERE post_id = ? AND hidden = 0', row.id),
    scoreOf('post', row.id),
    myVote(viewerId, 'post', row.id),
    sparksFor(row, viewerId),
    q.get('SELECT COUNT(*)::int AS n FROM posts WHERE loom_of = ? AND hidden = 0', row.id),
    // A Loom carries the post it spreads (one level deep).
    row.loom_of && !nested ? q.get('SELECT * FROM posts WHERE id = ?', row.loom_of) : null,
  ])
  const author = publicUser(authorRow) || { id: row.author_id, name: 'Unknown', color: '#888' }
  const community = row.community_id ? await q.get('SELECT id, name, accent, cover FROM communities WHERE id = ?', row.community_id) : null
  return {
    id: row.id, communityId: row.community_id, title: row.title, body: row.body,
    audience: row.audience || 'community', city: row.city || '',
    community: community ? { id: community.id, name: community.name, accent: community.accent, cover: community.cover || '' } : null,
    media: json(row.media), pinned: !!row.pinned, hidden: !!row.hidden, author,
    score: row.base_score + score,
    myVote: mine,
    commentCount: countRow.n, createdAt: row.created_at, ago: timeAgo(row.created_at),
    sparks, loomCount: loomRow.n,
    loomOf: original && !original.hidden ? await serializePost(original, viewerId, { nested: true }) : row.loom_of ? { missing: true } : null,
  }
}

export async function serializeComment(row, viewerId) {
  const [authorRow, score, mine] = await Promise.all([
    getUserById(row.author_id),
    scoreOf('comment', row.id),
    myVote(viewerId, 'comment', row.id),
  ])
  const author = publicUser(authorRow) || { id: row.author_id, name: 'Unknown', color: '#888' }
  return {
    id: row.id, postId: row.post_id, parentId: row.parent_id, body: row.body,
    hidden: !!row.hidden, author,
    score: row.base_score + score,
    myVote: mine,
    createdAt: row.created_at, ago: timeAgo(row.created_at), replies: [],
  }
}

// Build a threaded comment tree, each level sorted best-voted first.
export async function threadForPost(postId, viewerId) {
  const rows = await q.all('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC', postId)
  const serialized = await Promise.all(rows.map((r) => serializeComment(r, viewerId)))
  const nodes = new Map()
  rows.forEach((r, i) => nodes.set(r.id, serialized[i]))
  const roots = []
  rows.forEach((r) => {
    const node = nodes.get(r.id)
    if (r.parent_id && nodes.has(r.parent_id)) nodes.get(r.parent_id).replies.push(node)
    else roots.push(node)
  })
  const sortRec = (list) => {
    list.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
    list.forEach((n) => sortRec(n.replies))
  }
  sortRec(roots)
  return roots
}

export async function serializeCommunity(row, viewerId) {
  const [membership, agg, liveRow, mine] = await Promise.all([
    viewerId
      ? q.get('SELECT role FROM memberships WHERE user_id = ? AND community_id = ?', viewerId, row.id)
      : Promise.resolve(null),
    q.get('SELECT COUNT(*) AS n, COALESCE(AVG(stars),0) AS avg FROM ratings WHERE community_id = ?', row.id),
    q.get('SELECT COUNT(*) AS n FROM live_streams WHERE community_id = ? AND ended_at IS NULL', row.id),
    viewerId
      ? q.get('SELECT stars, review FROM ratings WHERE user_id = ? AND community_id = ?', viewerId, row.id)
      : Promise.resolve(null),
  ])
  return {
    expiresAt: row.expires_at == null ? null : Number(row.expires_at), ended: row.expires_at != null && Number(row.expires_at) <= Date.now(),
    id: row.id, name: row.name, tagline: row.tagline, description: row.description,
    scope: row.scope, city: row.city, accent: row.accent, icon: row.icon, cover: row.cover || '',
    tags: json(row.tags), rules: json(row.rules), modRules: json(row.mod_rules), memberCount: row.member_count,
    category: row.category || null, country: row.country || 'NG',
    createdBy: row.created_by ?? null,
    trending: !!row.trending,
    joined: !!membership, role: membership?.role ?? null,
    rating: { avg: Math.round(agg.avg * 10) / 10, count: agg.n, mine: mine?.stars ?? 0 },
    live: liveRow.n > 0,
  }
}

// ── Jobs ─────────────────────────────────────────────────────────────
export async function serializeJob(row, viewerId) {
  const isPoster = viewerId && viewerId === row.poster_id
  const [posterRow, countRow, offerRow, mineRow, offers] = await Promise.all([
    getUserById(row.poster_id),
    q.get('SELECT COUNT(*) AS n FROM job_interests WHERE job_id = ?', row.id),
    q.get("SELECT COUNT(*) AS n FROM job_interests WHERE job_id = ? AND offer <> ''", row.id),
    viewerId
      ? q.get('SELECT offer, offer_note FROM job_interests WHERE job_id = ? AND user_id = ?', row.id, viewerId)
      : Promise.resolve(null),
    // The poster sees who offered and for how much.
    isPoster
      ? q.all(`SELECT u.*, ji.offer, ji.offer_note, ji.created_at AS offered_at FROM job_interests ji JOIN users u ON u.id = ji.user_id
          WHERE ji.job_id = ? ORDER BY ji.created_at DESC`, row.id)
      : Promise.resolve(null),
  ])
  const poster = publicUser(posterRow) || { id: row.poster_id, name: 'Unknown', color: '#888' }
  return {
    id: row.id, title: row.title, category: row.category, description: row.description,
    area: row.area, city: row.city, budget: row.budget, verifiedOnly: !!row.verified_only,
    verified: !!row.verified || !!posterRow?.id_verified,
    timing: row.timing || 'Flexible', remote: !!row.remote, openToOffers: row.open_to_offers !== 0,
    kind: row.kind === 'service' ? 'service' : 'job', opportunity: row.opportunity || 'paid',
    arrangement: row.arrangement || (row.remote ? 'remote' : 'local'), exchange: row.exchange || '',
    country: row.country || 'NG', currency: row.currency || 'NGN', workerId: row.worker_id || null, statusAt: row.status_at || row.created_at,
    status: row.status, poster, interested: countRow.n, offerCount: offerRow.n,
    iInterested: !!mineRow, myOffer: mineRow?.offer || '', myOfferNote: mineRow?.offer_note || '',
    offers: offers ? offers.map((o) => ({ user: publicUser(o), offer: o.offer || '', note: o.offer_note || '', ago: timeAgo(o.offered_at) })) : undefined,
    createdAt: row.created_at, ago: timeAgo(row.created_at),
  }
}

// ── Chats (group chats, distinct from public Communities) ─────────────
export async function serializeChat(row, viewerId) {
  const [countRow, memberRow, last] = await Promise.all([
    q.get('SELECT COUNT(*) AS n FROM chat_members WHERE chat_id = ?', row.id),
    viewerId
      ? q.get('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?', row.id, viewerId)
      : Promise.resolve(null),
    q.get('SELECT body, media, created_at FROM chat_messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1', row.id),
  ])
  return {
    id: row.id, name: row.name, description: row.description, communityId: row.community_id, eventId: row.event_id || null,
    accent: row.accent, memberCount: countRow.n, joined: !!memberRow, createdAt: row.created_at,
    lastMessage: last ? (last.body || mediaLabel(last.media)) : null, lastAt: last?.created_at ?? row.created_at,
  }
}

export async function serializeChatMessage(row) {
  const author = publicUser(await getUserById(row.sender_id)) || { id: row.sender_id, name: 'Unknown', color: '#888' }
  return { id: row.id, chatId: row.chat_id, body: row.body, media: json(row.media), author, createdAt: row.created_at, ago: timeAgo(row.created_at) }
}

// Pure — no database access.
export function serializeDm(row) {
  return {
    id: row.id, fromId: row.from_id, toId: row.to_id, body: row.body, media: json(row.media),
    context: row.context ? json(row.context, null) : null,
    createdAt: row.created_at, ago: timeAgo(row.created_at), read: !!row.read,
  }
}

// What an inbox shows for a message that is only an attachment.
export function mediaLabel(media) {
  const list = json(media)
  if (!list.length) return ''
  const kinds = new Set(list.map((m) => m.kind))
  if (kinds.has('audio')) return 'Voice message'
  if (kinds.has('video')) return 'Video'
  return list.length > 1 ? `${list.length} photos` : 'Photo'
}

// ── Ads ──────────────────────────────────────────────────────────────
// Pure — no database access.
export function serializeEvent(row) {
  return {
    id: row.id, communityId: row.community_id, creatorId: row.creator_id,
    title: row.title, date: row.date, time: row.time, venue: row.venue,
    description: row.description, attending: row.attending, cover: row.cover || '',
    audience: row.audience || 'community', city: row.city || '',
    category: row.category || null, format: row.format || 'in-person', capacity: row.capacity ?? null,
    country: row.country || 'NG', timezone: row.timezone || 'Africa/Lagos', inviteOnly: !!row.invite_only,
    updatedAt: row.updated_at || null,
    lat: row.lat ?? null, lon: row.lon ?? null,
    expiresAt: row.expires_at == null ? null : Number(row.expires_at), ended: row.expires_at != null && Number(row.expires_at) <= Date.now(),
  }
}

export function serializeAd(row) {
  return {
    id: row.id, businessName: row.business_name, tagline: row.tagline,
    ctaLabel: row.cta_label, accent: row.accent, emoji: row.emoji,
    city: row.city || 'Lagos', reach: row.reach || 'local',
    logo: row.logo || '', cover: row.cover || '', link: row.link || '', status: row.status || 'live',
    active: !!row.active, ownerId: row.owner_id, createdAt: row.created_at,
  }
}

// ── Live streams ─────────────────────────────────────────────────────
export async function serializeLive(row) {
  const [hostRow, community] = await Promise.all([
    getUserById(row.host_id),
    q.get('SELECT id, name, accent FROM communities WHERE id = ?', row.community_id),
  ])
  return {
    id: row.id, title: row.title,
    host: publicUser(hostRow) || { id: row.host_id, name: 'Unknown', color: '#888' },
    community,
    startedAt: row.started_at, viewerCount: row.viewer_count,
  }
}

export const parseJson = json
export default q

// ── How long something stays up ──────────────────────────────────────
// Nuel, Nov 21: "People can choose how long they want a community or event
// before it goes down." Communities run from the day they start; an event
// stays up for the chosen time after its date. No choice means no end.
const DAY = 24 * 60 * 60 * 1000
export const KEEP_UP = { '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
export function expiryFor(choice, fromMs = Date.now()) {
  const days = KEEP_UP[choice]
  return days ? fromMs + days * DAY : null
}
