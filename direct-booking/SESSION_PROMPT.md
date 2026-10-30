Paste this into a new Claude Code session opened in /Users/uvarajthulasiram/Documents/Ideas.

---

We're building a reusable direct booking engine for short-term rentals. The first site is The Nest Retreat (my partner Allie's cottage in West Seattle); my own site for 4 Calgary homes comes next from the same code.

Read `direct-booking/PLAN.md` first, all of it. It records the decisions already made (Cloudflare Pages + Worker + D1, Next.js static export, iCal sync, PriceLabs, Stripe Checkout), the layout, the data model, the API, the phases and the working rules. Don't reopen those decisions; if something in the plan looks wrong, tell me and wait.

Also look at `nest-retreat/` (the static mockup we're turning into the real site) and `nest-retreat/photos/` (Allie's real photos).

Then:

1. Create a branch `direct-booking` from `main`.
2. Do Phase 1 (Scaffold) as the plan describes. Use placeholder values marked `TODO(host)` for anything in the "Inputs needed" list.
3. Stop at the end of Phase 1. Show me how to run the Worker and the site locally, what's placeholder, and add the session to `direct-booking/WORKLOG.md`.

Ask me before adding any dependency the plan hasn't approved. Don't deploy, buy anything or use live keys.
