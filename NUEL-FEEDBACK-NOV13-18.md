# Nuel's feedback, Nov 13 – 18

From the WhatsApp chat with Nuel, Friday Nov 13 to Wednesday Nov 18. Most of it came as screenshots of voidaj.com with a line under each, sent Nov 13 at about 9:30 PM and again on Nov 18 at 11:04 AM. He also said he'd sent a "new feature… about editing" over iMessage on Nov 18. That one hasn't been read yet.

## To build

| # | Nuel said | Screen | What it means |
|---|---|---|---|
| 1 | "Area code number, time options" | Edit business (phone, website, opening hours) | Phone gets a country-code picker. Opening hours become day/time pickers, not free text ("every day"). |
| 2 | "Can you give this a new design look" / "Same with this" | Edit business form; a Service card ("sweet sensation pineapples ₦1,000", Promote / Delete) | Restyle the business edit form and the service listing card. |
| 3 | "Can we remove that now" / "You can remove that now" | A post with the up/down vote arrows circled | Take the vote arrows off posts (Sparks, Takes, Looms stay). |
| 4 | "I want this redesigned also with new prompt questions" | Onboarding: "Good to meet you… what would you like to do today?" with chips (Meet people, Join communities, …) | Redesign the onboarding chat and write new questions. Ties in with the 6-step onboarding in DO-LATER.md and the AI Identity Builder. |
| 5 | "Can you please redesign this area to look more soft and interactive" / "Make this float just as the navigation… if you're redesigning it or still want it there" | Right-hand ads panel (baro Welding, pine ridge, AfroRoam Travel, CodeBridge Africa, "Your business here / Post advert") | Ads panel floats like the left sidebar, with separate soft cards for each ad. |
| 6 | "Can you make this just the same way the navigation area is and separate each from another" | Same ads panel | Same as 5. |
| 7 | "Please redesign to look more card looking" (Nov 13) and "New id design thanks" (Nov 18) | VOIDAJ ID page | The ID should look more like a physical card. |
| 8 | "My businesses" (Nov 13); "How can we navigate with my-jobs, my business from quick jobs and businesses" (Nov 18) | Profile menu (My Profile, VOIDAJ ID, My Communities, My Jobs, Businesses, My Stash…) and Quick Jobs | Rename "Businesses" in the menu to "My businesses". Put clear My Jobs / My Business links on the Quick Jobs and Businesses pages. |
| 9 | "You can start working on services it's just a page people say what they can do with proof of service done their Availability and stuff like that" | Add to VOIDAJ, where "Service" says *coming soon* | A Services page: what I can do, proof of past work (photos and reviews), and availability. Take the "coming soon" label off. |
| 10 | "Give us something cool here I know you can do it" | Add to VOIDAJ (Post, Event, Job, Community, Business, Service) | Redesign the Add Hub page. |
| 11 | "Messages shouldn't be there… limit the notifications to likes, looms, takes, follow, connection, jobs" | Notifications, with tabs All / Messages / Jobs / People / Posts | Take chat messages out of Notifications (Chat shows them). Keep likes/sparks, looms, takes, follows, connections and jobs. |
| 12 | "Yeah I'll like this more defining" | Community page (Global community, discussions) | He likes where it is going. Make the sections more distinct. |
| 13 | "Anytime I say VOIDAJ.com there should be limited things that show… this should only be for people who have visited and created a page already" | voidaj.com home ("A new space for people, communities & opportunities", with the full feed beside it) | Signed-out visitors see a short landing page. The full feed is for members. |
| 14 | "Remember that some places may need a back tab to return" | — | Already in from Nov 11. Check the new pages have it. |

## Questions and decisions

- **Points and badges for growth** (Nov 18): "talk to me how we use the points system… so we can use that to gain users". He wants a talk about using points and badges to bring in users. Referrals already give 15 points.
- **Business emails** (Nov 18): "@voidaj.com" addresses. Same as the contact address. voidaj.com has no email set up yet.
- **"When will I be able to access the backend?"** (Nov 18): he means "my dashboard" and app analytics. The Admin page (members, sign-up numbers, ID checks, disputes) is the start of that. David said he'd send it on Nov 19.
- **Apple developer account** (Nov 13–18): Sign in with Apple needed a paid Apple Developer account. Nuel sent the money and the account cost 119. Apple sign-in is now live.
- **Promo videos / graphics** (Nov 15): Nuel asked about graphic design for promo material. David said the site should be ready to start posting promo videos by Nov 27.
- **Meeting**: planned for "next weekend" (around Nov 21–22).
- **Role** (Nov 18): Nuel asked David to lead a department.

## Done on localhost (Nov 18)

| # | What changed |
|---|---|
| 1 | Business phone has a country-code picker (saved as +234…). Opening hours are day buttons, presets (Every day, Mon–Fri, Mon–Sat, Weekends), open/close times and a 24-hours tick. Older hand-typed hours stay editable as text. `src/components/ContactPickers.jsx` |
| 2 | Business edit form is split into sections (About, Where, Cover photo, Contact, Opening hours) with a live preview at the top and a save bar that stays in view. An opened listing (e.g. a Service) has a photo or placeholder, the price next to the title, location as a chip, views and enquiries as tiles, and round buttons. |
| 3 | Up/down vote arrows are gone from posts and takes. |
| 4 | Onboarding is six steps, one question each: why you're here, profile type, city and area plus who sees it, interests (tap or type), how you'll take part (with job categories if you offer skills), and who can message you. Everything is saved to the profile (new `profile_type` column). The finish button goes to Quick Jobs, Businesses, Events or Home depending on the first reason picked. |
| 5, 6 | Ads panel floats like the left menu, and each ad is its own soft card with a hover lift and a glow in its own colour. |
| 7 | VOIDAJ ID looks like a physical card: card proportions, a gold chip, QR, member number, city, "since" year, Verified badge and a slow sheen. |
| 8 | Menu: My Jobs → Quick Jobs › My jobs (new tab), My Businesses → Businesses › My businesses (new tab, with Edit and Promote), plus My Services. Each of these pages links to the other two. |
| 9 | **Services page** (`/services`): what you do, category, price (paid, free or skill swap), in person or online, area, availability (same day/time picker), and up to 6 photos of past work. Each card shows the provider's rating and how many jobs they've completed on VOIDAJ. The detail view has a photo gallery, reviews from Quick Jobs, and Contact. Owners can edit, pause or delete. A service is still a Quick Jobs listing, so hiring and reviews work as before. Add Hub's Service opens it. `server/services.js`, `src/pages/Services.jsx` |
| 10 | Add to VOIDAJ is a grid of glowing tiles, with Post and Event large. |
| 11 | Notifications no longer show messages. They show sparks, looms and takes on your posts, new followers, new connections, and jobs. |
| 13 | Signed-out visitors on voidaj.com see the hero, then what VOIDAJ is, what you can do, four communities, why it's safe, and a sign-up button. No feed and no ads. |

Not changed: 12 (he likes the community page as it is) and 14 (back buttons are already on every page).
