// ── Terms, in public ─────────────────────────────────────────────────
// Nuel's "VOIDAJ — Terms and Conditions of Use" (shared Nov 28), all 18
// sections as he wrote them, with VOIDAJ's own rules folded into the
// matching sections: the minimum age (2), the Charter as our Community
// Guidelines (4), what "Verified" means (7), Quick Jobs and money (9),
// and what deleting an account removes (15). The same page is reachable
// without an account: Google and Apple ask for a public terms URL before
// they let anyone sign in with them.
import { Link } from 'react-router-dom'
import { CHARTER } from '../data/seed.js'
import { PAYMENT_NOTE } from './Jobs.jsx'
import { MIN_AGE } from '../age.js'
import { CONTACT_EMAIL } from '../contact.js'
import { VERIFICATION_IS_REAL } from '../verification.js'
import { LegalPage, Section } from '../components/LegalPage.jsx'

export const TERMS_EFFECTIVE = '28 November 2026'
const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>

export default function Terms() {
  return (
    <LegalPage title="Terms and Conditions of Use" updated={TERMS_EFFECTIVE}>
      <p className="legal-meta">
        <strong>Effective date:</strong> {TERMS_EFFECTIVE}<br />
        <strong>Platform:</strong> VOIDAJ<br />
        <strong>Legal operator:</strong> VOIDAJ<br />
        <strong>Contact:</strong> <Mail /><br />
        <strong>Governing law:</strong> Nigeria, subject to applicable mandatory laws and users' legal rights.
      </p>

      <Section title="1. Acceptance of these Terms">
        <p>By creating an account or using VOIDAJ, you agree to these Terms and Conditions and the applicable Community Guidelines (the <a href="#charter">VOIDAJ Charter</a>). Please read them before accepting.</p>
        <p>VOIDAJ's <Link to="/privacy">Privacy Policy</Link> explains how personal information is collected, used, stored and protected. Where consent is required, it will be obtained separately and appropriately.</p>
        <p>If you do not agree to these Terms, you must not create or continue using an account.</p>
      </Section>

      <Section title="2. Eligibility and Account Responsibility">
        <p>You must satisfy VOIDAJ's minimum age requirements and any applicable legal requirements to use the platform. You need to be at least <strong>{MIN_AGE} years old</strong> to create a VOIDAJ account. We ask for your date of birth when you join and check it, and we may close an account we find belongs to someone under {MIN_AGE}.</p>
        <p>You agree to provide accurate information, maintain reasonable account security, protect your login credentials and notify VOIDAJ if you suspect unauthorized access.</p>
        <p>You must not impersonate another person, create deceptive identities or misrepresent your qualifications, affiliation or authority.</p>
      </Section>

      <Section title="3. Purpose of VOIDAJ">
        <p>VOIDAJ provides a digital platform for people to connect, communicate, share content, discover interests, participate in communities and events, and find relevant services and opportunities.</p>
        <p>Features may include profiles, posts, messaging, Maps, Explore, My City, Events, Communities, Hubs, Quick Jobs and digital identity or card features.</p>
        <p>Features may change or expand over time, subject to applicable law and these Terms.</p>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree to use VOIDAJ lawfully and respectfully.</p>
        <p>You must not use the platform to:</p>
        <ul>
          <li>Harass, threaten, stalk, exploit or intimidate others.</li>
          <li>Publish fraudulent, deceptive or deliberately misleading information.</li>
          <li>Impersonate people or falsely claim verification.</li>
          <li>Distribute malware, conduct phishing or attempt unauthorized access.</li>
          <li>Promote illegal activities, prohibited goods or services.</li>
          <li>Share another person's private information without lawful authority.</li>
          <li>Spam users, manipulate engagement or abuse reporting systems.</li>
          <li>Infringe intellectual property or violate another person's legal rights.</li>
          <li>Circumvent platform security, moderation or access restrictions.</li>
        </ul>
        <p>VOIDAJ may investigate suspected violations and take proportionate action.</p>
        <h3 id="charter">Community Guidelines: the VOIDAJ Charter</h3>
        <p>These apply in every community, in every city, to everyone. A community sets its own tone within them but cannot opt out of them:</p>
        <ol className="legal-charter">{CHARTER.map((c) => <li key={c}>{c}</li>)}</ol>
      </Section>

      <Section title="5. User Content and Intellectual Property">
        <p>You retain ownership of content you create, subject to the rights of others.</p>
        <p>By uploading or publishing content, you grant VOIDAJ a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, display and distribute that content as reasonably necessary to operate, maintain, secure and promote the platform and the features you choose to use.</p>
        <p>This licence is subject to applicable law, your privacy choices and any additional permissions required for particular uses. It does not transfer ownership of your content to VOIDAJ.</p>
        <p>You are responsible for ensuring that you have the rights and permissions necessary to publish your content.</p>
        <p><strong>Assume what you post is public.</strong> Anyone can read the feed, profiles, posts, events and jobs without an account. Private messages and group chats can only be read by the people in the conversation.</p>
      </Section>

      <Section title="6. Privacy and Personal Information">
        <p>VOIDAJ will handle personal information in accordance with its <Link to="/privacy">Privacy Policy</Link> and applicable data protection law.</p>
        <p>Users must respect the privacy of others. You must not collect, sell, disclose or misuse personal information obtained through VOIDAJ without an appropriate lawful basis.</p>
        <p>Location access, contact access, sensitive information and other optional permissions will be handled according to the relevant feature, applicable law and required consent.</p>
      </Section>

      <Section title="7. Verification and Trust">
        <p>VOIDAJ may offer identity, profile, service or other verification processes.</p>
        <p>Verification indicates only the checks expressly described by VOIDAJ. It does not guarantee that a person is trustworthy, qualified, safe, financially reliable or certain to fulfil an agreement.</p>
        <p>Users must not falsify verification documents, misuse verification badges or claim checks they have not completed.</p>
        {VERIFICATION_IS_REAL && (
          <p><strong>What the “Verified” badge means today:</strong> someone on the VOIDAJ team has looked at a photo of that person's official ID and a selfie, and they matched. It confirms a real person with that name is behind the account. It is not a background check, and you should never send money or bank details to someone just because they are verified. Sending a fake or someone else's ID gets your account closed.</p>
        )}
        <p>Badges you earn or create on VOIDAJ are not verification and never claim that any check took place.</p>
      </Section>

      <Section title="8. Messaging, Connections and Consent">
        <p>Users must respect other people's boundaries and communication preferences.</p>
        <p>Unwanted harassment, repeated abusive contact, threats, impersonation and unauthorized sharing of private conversations may result in restrictions or account action.</p>
        <p>Users may block or report other accounts where those features are available.</p>
      </Section>

      <Section title="9. Services, Jobs, Listings and Opportunities">
        <p>Users who publish job offers, service listings, advertisements or other opportunities must provide accurate information and comply with applicable law.</p>
        <p>Users must independently assess qualifications, prices, terms, safety and the reliability of other parties before entering an agreement.</p>
        <p>Unless expressly stated otherwise, VOIDAJ facilitates discovery and connections but does not itself employ, supervise or guarantee the performance of users offering services or opportunities.</p>
        <p>Any payment, booking, refund or transaction-specific terms must be disclosed where applicable.</p>
        <p><strong>Quick Jobs and money:</strong> {PAYMENT_NOTE}</p>
      </Section>

      <Section title="10. Events, Communities and Hubs">
        <p>Users organizing events, communities or Hubs are responsible for the accuracy of their information, the lawful nature of their activities and any responsibilities applicable to their role.</p>
        <p>Organizers must not use VOIDAJ to facilitate unlawful activities, abuse participants or misrepresent their authority.</p>
        <p>Additional rules may apply to particular events, communities and features.</p>
        <p>Whoever starts a community moderates it along with the moderators they appoint. If a community's owner leaves, it passes to the longest-standing member with the most responsibility, so a community is not lost when one person goes.</p>
      </Section>

      <Section title="11. Maps, Recommendations and Location">
        <p>VOIDAJ may use information you provide, your selected preferences and permitted activity data to recommend people, places, events, services and opportunities.</p>
        <p>Recommendations are not guarantees of relevance, availability, quality, safety or suitability.</p>
        <p>Users control optional location permissions through the available platform and device settings. Location sharing and visibility must be explained in the Privacy Policy and relevant feature settings.</p>
      </Section>

      <Section title="12. Advertising and Commercial Activity">
        <p>VOIDAJ may display advertising, sponsored content or promotional listings. Such content should be identified appropriately.</p>
        <p>Users must not engage in deceptive advertising, undisclosed commercial practices where disclosure is required, or unlawful promotional activities.</p>
        <p>Any fees, paid features, payment arrangements and applicable cancellation or refund terms will be disclosed before users commit to them.</p>
      </Section>

      <Section title="13. Moderation, Reports and Enforcement">
        <p>Users may report content or behaviour that violates these Terms.</p>
        <p>VOIDAJ may review reports, remove or restrict content, limit features, suspend accounts or terminate access when reasonably necessary to enforce its rules, protect users, maintain security or comply with law.</p>
        <p>Where appropriate, users will receive notice and an opportunity to appeal. Immediate restrictions may be necessary in urgent safety or security situations.</p>
        <p>VOIDAJ will handle reports and enforcement in accordance with applicable law and its published policies.</p>
      </Section>

      <Section title="14. Platform Availability and Third Parties">
        <p>VOIDAJ will make reasonable efforts to maintain a secure and reliable service but cannot guarantee uninterrupted access or error-free operation.</p>
        <p>The platform may link to third-party websites, services or payment providers. Their services may be governed by separate terms and privacy policies.</p>
        <p>Nothing in these Terms excludes rights or liabilities that cannot lawfully be excluded.</p>
      </Section>

      <Section title="15. Account Suspension, Closure and Termination">
        <p>You may stop using VOIDAJ and request account closure through the available process: Settings → Data → Delete account.</p>
        <p>VOIDAJ may restrict or terminate accounts for serious or repeated violations, fraud, security threats or other lawful reasons.</p>
        <p>Account closure and content deletion will be handled according to the <Link to="/privacy">Privacy Policy</Link>, applicable retention requirements and any necessary preservation of records required by law. Your profile, private messages, memberships and sign-in history are removed; what you wrote in public threads stays, credited to “Former member”, so other people's conversations still make sense.</p>
      </Section>

      <Section title="16. Changes to the Platform or These Terms">
        <p>VOIDAJ may update its features and these Terms as the platform develops.</p>
        <p>Material changes will be communicated appropriately, with a new effective date and renewed acceptance where required by law or the nature of the change.</p>
        <p>Continued use will not override any requirement to obtain express agreement.</p>
      </Section>

      <Section title="17. Complaints and Disputes">
        <p>Users should contact VOIDAJ through its published support channel (<Mail />) to report complaints, safety concerns or disputes.</p>
        <p>These Terms are governed by Nigerian law, subject to applicable mandatory legal protections and any valid dispute-resolution requirements.</p>
        <p>Nothing in these Terms removes a user's statutory rights or access to a competent regulator or court.</p>
      </Section>

      <Section title="18. Contact and Final Provisions">
        <p>Questions about these Terms can be sent to <Mail />.</p>
        <p>If any provision is found unenforceable, the remaining provisions will continue to apply to the extent permitted by law.</p>
        <p>These Terms, together with the applicable policies and feature-specific agreements, govern the use of VOIDAJ.</p>
      </Section>

      <Section title="User Acceptance">
        <p>By selecting “I Agree and Create Account,” I confirm that I have read and agree to the VOIDAJ Terms and Conditions and Community Guidelines, and have been given access to the Privacy Policy.</p>
        <p>I understand that separate consent may be requested for optional data processing or features where required.</p>
      </Section>
    </LegalPage>
  )
}
