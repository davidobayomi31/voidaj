// ── Terms, in public ─────────────────────────────────────────────────
// The same rules members see in Settings → Terms, on a page that doesn't
// need an account. Google and Apple both ask for a reachable terms URL
// before they will let anyone sign in with them, and a page behind
// /auth is no use to them or to someone deciding whether to join.
import { Link } from 'react-router-dom'
import { CHARTER } from '../data/seed.js'
import { PAYMENT_NOTE } from './Jobs.jsx'
import { MIN_AGE } from '../age.js'
import { CONTACT_EMAIL } from '../contact.js'
import { VERIFICATION_IS_REAL } from '../verification.js'
import { LegalPage, Section } from '../components/LegalPage.jsx'

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="16 November 2026">
      <p>
        These terms cover VOIDAJ — the website at voidaj.com and everything on it.
        By creating an account or using VOIDAJ you agree to them. They are written
        in plain language on purpose: if something here is unclear, ask us rather
        than guess.
      </p>

      <Section title={`You must be ${MIN_AGE} or older`}>
        <p>
          You need to be at least <strong>{MIN_AGE} years old</strong> to create a VOIDAJ
          account. We ask for your date of birth when you join and check it. If we
          find out an account belongs to someone under {MIN_AGE}, we may close it.
        </p>
      </Section>

      <Section title="The VOIDAJ Charter">
        <p>These apply in every community, in every city, to everyone:</p>
        <ol className="legal-charter">{CHARTER.map((c) => <li key={c}>{c}</li>)}</ol>
      </Section>

      <Section title="What you post">
        <p>
          What you write stays yours. By posting it on VOIDAJ you let us show it to
          other people here, which is the point of the place. You are responsible for
          what you post, and you should only post things you have the right to share.
        </p>
        <p>
          <strong>Assume what you post is public.</strong> Anyone can read the feed,
          profiles, posts, events and jobs without an account. Private messages and
          group chats are the exception — those need you to be signed in, and only the
          people in the conversation can read them. What we collect and who can see it
          is set out in the <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </Section>

      <Section title="What isn't allowed">
        <p>Don't use VOIDAJ to:</p>
        <ul>
          <li>harass, threaten, bully or impersonate anyone</li>
          <li>post content that is illegal where you are, or that encourages harm</li>
          <li>share someone else's private information without their permission</li>
          <li>scam people, advertise work that doesn't exist, or ask for money up front</li>
          <li>break into, overload or scrape the service</li>
        </ul>
        <p>
          You can report anything that breaks these rules from the post, profile or
          event itself. We may remove content or close accounts that do.
        </p>
      </Section>

      <Section title="Communities are run by their members">
        <p>
          Anyone can start a community, and whoever starts it moderates it along with
          the moderators they appoint. They set their own tone within the Charter — the
          Charter applies everywhere and a community cannot opt out of it. If a
          community's owner leaves, it passes to the longest-standing member with the
          most responsibility, so a community is not lost when one person goes.
        </p>
      </Section>

      <Section title="Quick Jobs, and money">
        <p>{PAYMENT_NOTE}</p>
        <p>
          VOIDAJ is where people find each other. The arrangement — what the work is,
          what it pays, and when — is between the two of you. We are not a party to it,
          we do not employ anyone, and we cannot recover money for you if something
          goes wrong.
        </p>
      </Section>

      {!VERIFICATION_IS_REAL && (
        <Section title="The “ID verified” badge is a prototype">
          <p>
            VOIDAJ shows a verification flow, but <strong>it is not a real identity
            check</strong>. It does not look anything up, and nobody at VOIDAJ has
            confirmed who that person is. It gives no priority on jobs and means nothing
            about whether someone can be trusted. Treat everyone here as unverified and
            take the care you would with any stranger. Never send anyone your NIN,
            passport number or bank details through VOIDAJ.
          </p>
        </Section>
      )}

      <Section title="Ending your account">
        <p>
          You can delete your account at any time from Settings → Data. Your profile,
          private messages, memberships and sign-in history go. What you wrote in public
          threads stays, credited to “Former member”, so other people's conversations
          still make sense — the <Link to="/privacy">Privacy Policy</Link> explains
          exactly what is removed and what remains.
        </p>
        <p>
          We may suspend or close an account that breaks these terms, and we will say
          why unless we are not allowed to.
        </p>
      </Section>

      <Section title="What we don't promise">
        <p>
          VOIDAJ is offered as it is. We work to keep it running and accurate, but we
          don't guarantee it will always be available, free of mistakes, or that
          anything you find here — a job, a person, a community — will work out. We are
          not responsible for what other members post or do.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms as VOIDAJ grows. If we change something that
          matters, we'll say so in the app rather than quietly editing this page. The
          date at the top tells you when it last changed.
        </p>
      </Section>

      <Section title="Getting in touch">
        <p>
          Questions about these terms, or anything else, go to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  )
}
