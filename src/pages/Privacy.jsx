// ── Privacy policy, in public ────────────────────────────────────────
// Written from what the code actually does, not from a template. Every
// claim here was checked against the schema in server/db.js and the routes
// in server/index.js — if you change how data is handled, change this page
// in the same commit. Saying something here that the code doesn't do is
// worse than saying nothing.
import { Link } from 'react-router-dom'
import { MIN_AGE } from '../age.js'
import { CONTACT_EMAIL } from '../contact.js'
import { LegalPage, Section } from '../components/LegalPage.jsx'

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="16 November 2026">
      <p>
        This explains what VOIDAJ collects, who can see it, who else it reaches, and
        what you can do about it. It describes how the service actually behaves today,
        including the parts that are less tidy than we'd like.
      </p>

      <Section title="What we collect">
        <p>When you create an account:</p>
        <ul>
          <li><strong>Your email address</strong> — to sign you in and send confirmation codes.</li>
          <li><strong>Your name</strong> and the <strong>@handle</strong> you pick. Both are public.</li>
          <li>
            <strong>Your date of birth</strong> — used only to check you are {MIN_AGE} or older.
            Nothing else reads it and it is never shown to anyone.
          </li>
          <li><strong>Your city</strong>, and optionally your area, country and phone number.</li>
          <li><strong>Your password</strong>, stored only as a bcrypt hash. We cannot read it, and nor can anyone who obtains the database.</li>
        </ul>
        <p>As you use VOIDAJ, we store what you make: posts, comments, private messages, group chat messages, jobs and applications, events and RSVPs, communities you join, people you follow or connect with, photos you upload, and your settings.</p>
        <p>
          We also record each sign-in with the time, your IP address and your browser's
          user-agent, so you can see where you're signed in and sign other devices out.
          Those records are deleted after 90 days.
        </p>
        <p>
          <strong>If you ask to be ID verified</strong>, you send us a photo of an official
          ID (NIN slip, passport, driver's licence or voter's card), a selfie holding it,
          and your name as it appears on it. A person on the VOIDAJ team compares them by
          eye. Nothing is sent to any other company. <strong>The moment the check is
          decided, both photos and the typed name are deleted</strong>; we keep only the
          kind of ID, the date, and whether it passed (or why not). We never ask for your
          ID number. Verification is optional, and you can ask us to remove the badge.
        </p>
      </Section>

      <Section title="Who can see what">
        <p>
          <strong>Most of VOIDAJ is public.</strong> Anyone — including people without an
          account — can read the feed, profiles, posts and their comments, communities,
          events, jobs and the directory of people offering work. Treat anything you post
          as readable by anyone.
        </p>
        <p><strong>Only you and the people involved</strong> can see private messages, group chats, your notifications, your job applications and the offers you make, and your own data export.</p>
        <p><strong>Only you</strong> can see your email address, phone number, date of birth and sign-in history. Administrators of VOIDAJ can also see your email, phone and city in order to run the service.</p>
      </Section>

      <Section title="Your location">
        <p>
          You choose what other people see, in Settings → Privacy. The default is
          <strong> city only</strong>:
        </p>
        <ul>
          <li><strong>Show my area</strong> — your city and your area appear on your profile.</li>
          <li><strong>City only</strong> — your city appears; your area is withheld.</li>
          <li><strong>Hidden</strong> — neither appears, and your country is withheld too.</li>
        </ul>
        <p>
          <strong>Be aware of what this setting does not cover.</strong> It controls your
          profile, not the things you post. A post or a status carries the city it was
          posted in. A job or a business listing shows the area you entered on it, and an
          event shows its venue — to everyone, whatever your profile setting says. If you
          don't want a place associated with you, don't put it in the content.
        </p>
        <p>VOIDAJ never asks your browser or phone for your location. Everything above comes from what you typed.</p>
      </Section>

      <Section title="Who else your data reaches">
        <p>We don't sell your data and we never will. These are the companies involved in running VOIDAJ, and what each one gets:</p>
        <ul>
          <li><strong>Vercel</strong> — hosts the site. Sees the usual request information, including your IP address.</li>
          <li><strong>Supabase</strong> — hosts the database, so everything above is stored there, and holds uploaded images.</li>
          <li><strong>Resend</strong> — sends confirmation emails. Receives your email address, your first name and the code. We send no marketing email of any kind.</li>
          <li><strong>Google or Apple</strong> — only if you choose to sign in with them. They tell us an account identifier, your email and your name (and Google, a profile photo). We don't send them anything about what you do on VOIDAJ.</li>
          <li><strong>Google Fonts</strong> and <strong>OpenFreeMap</strong> — serve the typeface and the map tiles on My City. Like anything your browser loads, they see your IP address.</li>
        </ul>
        <p>
          <strong>There is no analytics or tracking on VOIDAJ.</strong> No Google Analytics,
          no advertising pixels, no session recording, no third-party trackers of any kind.
          We don't follow you around the internet and we don't build a profile of you.
        </p>
        <p>
          VOIDAJ has an AI companion feature. <strong>It is switched off</strong>, and no
          content is being sent to any AI provider. If we turn it on, we will say so here
          first and explain what it sends.
        </p>
      </Section>

      <Section title="Photos and uploads">
        <p>
          Images you upload — profile photos, covers, event and community pictures,
          business logos, listing photos — are stored in public cloud storage. The web
          address of each is a long random string that isn't published or guessable, but
          it is <strong>not password-protected</strong>: anyone who has the link can open
          the image, and that stays true even after you delete the post or your account.
          Please don't upload anything you would be upset to see outside VOIDAJ.
        </p>
      </Section>

      <Section title="Cookies">
        <p>VOIDAJ sets two cookies, both necessary to sign you in. There are no advertising or tracking cookies, which is why there is no cookie banner.</p>
        <ul>
          <li><strong>is_token</strong> — keeps you signed in for 30 days. Not readable by scripts.</li>
          <li><strong>vj_oauth_state</strong> — a ten-minute security check during Google or Apple sign-in, deleted as soon as you come back.</li>
        </ul>
        <p>Your browser also stores small preferences locally: your light or dark theme, whether you closed the adverts panel, and — briefly, while you sign up — the date of birth and invite code you entered, which are cleared once your account exists.</p>
      </Section>

      <Section title="What you can do">
        <ul>
          <li><strong>See and change it</strong> — your profile and settings are editable at any time.</li>
          <li><strong>Control who sees you</strong> — Settings → Privacy sets your location visibility and who may message you. Settings → Profile can keep you out of the people-for-hire directory.</li>
          <li><strong>Take a copy</strong> — Settings → Data gives you everything we hold, as a file.</li>
          <li><strong>Block someone</strong> — from their profile. They can't message you and you won't see their posts.</li>
          <li><strong>Delete your account</strong> — Settings → Data.</li>
        </ul>
      </Section>

      <Section title="What deleting your account actually does">
        <p>We'd rather tell you precisely than say “we delete everything”, because we don't.</p>
        <p><strong>Removed completely:</strong> your email, password, any linked Google or Apple account, your name, handle, biography, phone number, date of birth, location, photos, interests, skills, settings, and your private messages — including the copy held by the person you were talking to. Your memberships, connections, votes and sign-in history go too.</p>
        <p><strong>Kept:</strong> your posts and comments, which stay in the threads they belong to, credited to “Former member” and no longer linked to you. This is so other people's conversations don't fall apart. Communities you owned pass to another member rather than closing.</p>
        <p><strong>Also kept:</strong> images you uploaded remain in storage and reachable by their direct link, as described above.</p>
        <p>If you want a post or comment removed as well, delete it before you delete your account, or write to us and we'll do it.</p>
      </Section>

      <Section title="How your data is protected">
        <p>Passwords are hashed with bcrypt and never stored in a readable form. Sign-in cookies can't be read by scripts in your browser. Traffic to the site and to the database is encrypted. Confirmation codes are stored only as a hash and expire after 30 minutes.</p>
        <p>No service can promise it will never be breached. If something happens that affects you, we will tell you rather than hope you don't notice.</p>
      </Section>

      <Section title={`Under ${MIN_AGE}s`}>
        <p>VOIDAJ is not for people under {MIN_AGE}. We ask for a date of birth at sign-up and refuse accounts below that age. If you believe someone under {MIN_AGE} has an account, tell us and we will close it.</p>
      </Section>

      <Section title="Changes to this policy">
        <p>If we change how we handle your data, we will update this page and say so in the app. The date at the top shows when it last changed.</p>
      </Section>

      <Section title="Asking us anything">
        <p>
          To see what we hold, correct it, delete it, or complain, write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we'll reply.
        </p>
        <p>The rules for using VOIDAJ are in the <Link to="/terms">Terms of use</Link>.</p>
      </Section>
    </LegalPage>
  )
}
