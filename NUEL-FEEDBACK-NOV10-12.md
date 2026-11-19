# Nuel's feedback, Nov 10 – 12

From the WhatsApp chat with Nuel after the Nov 8 – 10 round (see NUEL-FEEDBACK-NOV8-10.md), and the five notes he shared in iMessage: **Event idea** and **Quick jobs idea** (Nov 9), **Communities** (Nov 11, "Forgot to send this"), and **VOIDAJ — Jobs & Services Development Requirements** and **Questions to ask** (Nov 12, "Just incase you want to merge it"). The layout was left as it was; these are added features and small pieces.

## Done on localhost

| # | Nuel said | What changed |
|---|---|---|
| 1 | Nov 12: "I want to categorize events and also communities", with his list of 16 and a mockup, then "not this tho it's just like small tabs saying what this category of event falls under" | One shared list of 16 categories (`src/categories.js`, `server/categories.js`). Every event and community card shows a small category tab. Events and Communities have a row of category chips to filter by. Creating an event or a community now asks for a category. Older items and the demo data get one worked out from their tags. |
| 2 | Nov 12: "create something whereby people can refer other people to join and that increases their status… the more people they refer the bar increases to a new status" | **Invite friends** card on My Badges, with your own link and Share. Each person who joins from it adds 15 points to your citizen-level bar (New Citizen → Resident → Neighbour → …). New badges: **Recruiter** (1 friend) and **Ambassador** (10). |
| 3 | Nov 11, on the Events back button: "I like this but not every one got it or how do people go back?" | Every page except Home has a Back button at the top. It goes to the page you came from, or to where the page belongs (an event goes to Events, a community to Communities). |
| 4 | Nov 11, on the ads panel: "Can this float also I want it to be that it can be removed if we wanted to without causing any difference" | The ads panel now floats as a card beside the page and has a × to close it. Closed, the page uses the full width and a small **Ads** button in the corner brings it back. This device remembers the choice. |
| 5 | Nov 11: "Changing mobile navigation Home — my city — HuB(with a plus sign) — chat — profile" | The phone's bottom bar is now Home · My City · (+) Hub · Chat · Profile. Communities moved out of it, but you can still reach it from Home and the menu. |
| 6 | Nov 10: "Ask about age before anything", "Our limit is 16 for now" | Creating an account asks for your date of birth first. Everything else stays disabled until you enter it, and anyone under 16 is turned away; the server checks this too. Google/Apple accounts and older accounts get the same question before they can carry on. |
| 7 | Nov 10: "Then purple chats just the way whatsapp is green" | Your own messages in Chat are purple. |
| 8 | Events note (Nov 9) | **Going** and **Interested**. Events can be **In person / Online / Hybrid** and have a **capacity**. When an event is full, new people go on a **waitlist** and move up when a place opens. Attendance is **private by default**: you choose "Show me on the attendee list", and others only see the count. Also new: **Add to calendar** (a file any calendar app opens) and **Report this event**. The Interested star sits on the photo, so the card layout is unchanged. |
| 9 | Jobs & Services note and Quick Jobs note (Nov 9, 12); "Questions to ask": "Job and Service two options within the same Quick Jobs system" | Quick Jobs takes **Jobs and Services**. The post form starts with **Post a job (I need help)** or **Offer a service (I can help)**. Every listing is **Paid work, Volunteering, Free help or Skill exchange**. A skill exchange has to say what it wants in return, and unpaid listings say so. Work is **Local, Remote or Hybrid**. The list has **All · Jobs · Services** and filters for Hybrid, Volunteering, Free help and Skill exchange. Paid listings carry the payment notice Nuel wrote: VOIDAJ doesn't hold or guarantee payment, plus a scam warning. Buttons change to Volunteer / Offer help / Propose an exchange / Contact provider. |
| 10 | "Questions to ask": Hub (+) should include Service | Add Hub has a live **Service** row ("Offer your skills"), which opens the form already set to Service. |

## Questions to answer Nuel

- **Mobile nav conflict.** His Events and Quick Jobs notes say the bar "remains Home | Chat | Add Hub | Community | Profile". His WhatsApp message (Nov 11, later than the notes) says Home · My City · Hub · Chat · Profile. The WhatsApp version is what's built.
- **Purple chats vs. "purple only for the name and logo"** (Nov 10, earlier the same day). Sent messages are purple because he asked for that specifically. Confirm that's the one exception.
- **"White glassy and dark glassy"** (Nov 10). The panels already use frosted glass in both themes. Ask if he wants more of it.
- **Referral points.** 15 points per friend is a first guess. He can set the number.
- **"When can we have our email names"** (Nov 11): email addresses at voidaj.com. That's a domain/email-provider decision, not code.
- **"Do we need extra security measures to prevent hack"** (Nov 11). Worth a proper reply: rate limits, 2-step sign-in, admin audit.
- **Legal stage** (Nov 11): terms and conditions, age limiting (16+ is now in), permissions, data management, privacy and security, cookies. He suggested this as the next stage.

## Not done here (from the notes, later phases or bigger pieces)

- Events: multi-step create form, saved drafts, co-host and moderator roles, Event Circle, event announcements, organiser insights, invite-only events, map pins for events, a page for organisers to see registrations.
- Jobs & Services: shortlist / hire / agreement records, job statuses (Worker Selected → In Progress → Completed), two-way reviews after a job, disputes, pausing a service.
- Communities note: separate Chat and Members tabs, and a Moderate dashboard laid out as the note describes. Much of this already exists in the community page and Moderation.
- Invite links only credit the inviter when the new person signs up with email, or with Google/Apple on the same device they opened the link on.
