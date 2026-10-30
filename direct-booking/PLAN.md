# Direct booking engine: build plan

Status as of 2026-10-29. Owner: Uvaraj. First site: The Nest Retreat (Allie, West Seattle). Second site: Uvaraj's 4 Calgary homes, built from the same code once The Nest Retreat is live.

Planning doc (goals, launch checklist, risks, work log): https://claude.ai/artifact/URDh8LyZKs8CHcKs17MZiH
Design reference: the static mockup in `../nest-retreat/` (home, property, booking pages; "Driftwood & Fog" tokens in the `:root` of `index.html`).

## Decisions already made

Don't reopen these.

| Topic | Decision |
|---|---|
| Brand | "The Nest Retreat" |
| Hosting | Cloudflare: Pages for the site, a Worker for the API, D1 for data, Cron Triggers for jobs. Domain bought on Cloudflare later (Allie has none yet). |
| Stack | Next.js (App Router, `output: 'export'`), React, TypeScript for the site. TypeScript Worker for the API. npm workspaces. |
| Repo | Build here in `Ideas/direct-booking/`. It moves to its own repo once the template takes shape, so keep it self-contained (no imports from outside this folder). |
| Calendars | iCal both ways with Airbnb, VRBO and any other channel. |
| Prices | Nightly rates and minimum stays from the PriceLabs API. Uvaraj has used it before: ask him for the endpoint and auth details rather than guessing. |
| Payments | Stripe Checkout, in the host's own Stripe account. |
| Direct price vs Airbnb | Decided by each host at launch. Build it as a config setting (percentage discount, default 0). |
| Home page story | Later, with the `scroll-story-site` skill. Not part of this plan. Leave a clearly marked slot for it on the home page. |

## Template rule

Nothing about The Nest Retreat lives in `apps/`. Everything specific to a host lives in `sites/<site-id>/`. Adding Uvaraj's site must mean adding `sites/<his-site>/` and nothing else. Design for:

- one site with many properties (Uvaraj has 4),
- any currency (USD for Seattle, CAD for Calgary),
- per-property tax lines, fees, policies, calendars, timezone and check-in times.

## Layout

```
direct-booking/
  PLAN.md
  package.json              npm workspaces
  apps/
    web/                    Next.js static export (reads sites/<SITE_ID> at build time)
    api/                    Cloudflare Worker (reads the same config, bundled at build)
      migrations/           D1 SQL migrations
  packages/
    core/                   shared types, config schema, date and money helpers, quote maths
  sites/
    nest-retreat/
      site.ts               brand, domain, currency, contact, policies, properties
      content/              story, guide, FAQ, policy pages (Markdown)
      photos/               web-sized images (generated from ../nest-retreat/photos)
```

`SITE_ID` (env var) chooses the site at build time for both apps.

## Config (`sites/<id>/site.ts`, validated with a schema in `packages/core`)

Site: name, domain, currency, locale, timezone, host name and alert email, brand tokens, direct discount %, payment rule (full payment if arrival within N days, else deposit % now and balance N days before arrival), cancellation tiers (days before arrival → refund %), check-in and check-out times.

Property: id, name, slug, max guests, bedrooms, baths, cleaning fee, tax lines (label + rate, each with a `source` note; placeholders until Allie's accountant confirms), min and max nights fallback, iCal import URLs (by channel), PriceLabs listing id, photo list.

Secrets never go in config: Stripe keys, webhook secret, PriceLabs API key, iCal export token, Turnstile secret live in Worker secrets (`.dev.vars` locally, gitignored).

All money in integer minor units (cents). All stay dates as `YYYY-MM-DD` in the property's timezone; check-out date is exclusive.

## Data (D1)

| Table | Holds |
|---|---|
| `blocked_dates` | Nights blocked by an imported calendar: property, channel, event uid, start, end, last seen run |
| `bookings` | Direct bookings: id, property, check-in, check-out, guests, status (`hold`, `confirmed`, `cancelled`, `expired`), hold expiry, guest name, email, phone, quote snapshot (JSON, minor units), currency, amount paid, balance due date, Stripe session, payment intent and customer ids |
| `nightly_rates` | PriceLabs copy: property, date, price, min stay, fetched at |
| `sync_runs` | One row per import or price fetch: kind, property, started, finished, ok, error, counts |
| `manual_blocks` | Dates the host blocks directly (optional, admin) |

## API (Worker)

| Route | Does |
|---|---|
| `GET /api/availability?property&from&to` | Unavailable nights and min stay per night (from imported blocks, bookings in `hold`/`confirmed`, manual blocks) |
| `POST /api/quote` | Validates dates and guests, returns line items (nights × rate, cleaning, discount, taxes), total, and what is charged today vs later. The only place prices are computed. |
| `POST /api/checkout` | Verifies Turnstile, re-fetches the property's iCal feeds, re-quotes, creates a `hold` row (overlap check and insert in one D1 batch so two guests can't hold the same nights), creates a Stripe Checkout Session, returns its URL |
| `POST /api/stripe/webhook` | Verifies the signature (Workers-compatible async verification). `checkout.session.completed` → `confirmed`, send emails. `checkout.session.expired` → `expired`. Idempotent. |
| `GET /ical/<property>/<token>.ics` | Export feed for Airbnb, VRBO and others: confirmed direct bookings, live holds and manual blocks only. Never re-export imported blocks (that creates loops between channels). |
| `GET /api/booking/<id>?t=<token>` | Confirmation page data |

Cron Triggers:

- every 15 minutes: import every iCal URL, upsert `blocked_dates`, remove events no longer present, expire stale holds.
- daily: fetch 365 days of PriceLabs rates per property.
- daily: charge balances that are due (saved card, off-session). On failure, email the guest a payment link and alert the host.

Facts to respect:

- Stripe Checkout Sessions expire no sooner than 30 minutes, so holds last 30 minutes, matching `expires_at`.
- Airbnb and VRBO refresh imported calendars only every few hours. The host alert ("block these dates on Airbnb and VRBO now") is the real double-booking guard. Make it the first line of the host email.
- Imported iCal events use all-day `DATE` values with an exclusive `DTEND`. Test against real Airbnb and VRBO samples (ask Uvaraj for feed URLs or files; save scrubbed fixtures).
- If PriceLabs fails, keep serving the last stored rates and log the failure. A date with no rate can't be booked.

## Emails

Use Cloudflare's email sending (load the `cloudflare-email-service` skill). Three messages: guest confirmation (dates, address shared later, amounts, cancellation terms), host alert, balance-payment failure. Plain, short HTML plus text.

## Site (Next.js)

Port the mockup's design (tokens, fonts, layout) into components. Pages:

- `/` home: hero, story slot (placeholder until the story phase), highlights, FAQ, book button
- `/stay/<property>` property page: photos, details, availability calendar, live quote, Book button
- `/book/<property>` guest details and summary, then redirect to Stripe
- `/booking/confirmed` and `/booking/cancelled`
- `/house-rules`, `/cancellation`, `/terms`, `/privacy`

The booking widget calls the Worker. It shows only what `/api/quote` returns; no prices or fees typed into the site. Real photos: generate web sizes (AVIF/WebP, 3 widths) from `../nest-retreat/photos/` into `sites/nest-retreat/photos/`. The originals are only 1126×749; ask Uvaraj for full-size originals from Allie for the hero.

Accessibility: keyboard-usable date picker, visible focus, labels on every field, reduced-motion respected. Phone first (375px wide).

## Phases

Each phase ends with tests passing, a short demo note, and a commit. Stop and check in with Uvaraj at the end of each phase.

| # | Phase | Done when |
|---|---|---|
| 1 | Scaffold | Workspaces, `packages/core` with config schema and helpers, `sites/nest-retreat/site.ts` with placeholders marked `TODO(host)`, Worker runs under `wrangler dev` with local D1 and migrations, Next.js builds a static export, both read `SITE_ID`. |
| 2 | Calendars | iCal import (cron + on demand) and export feed, with unit tests on parsing, overlap and timezone edge cases, and fixture feeds. |
| 3 | Pricing and quote | PriceLabs daily fetch into `nightly_rates` (stub client with fixture data until the key is provided), `/api/availability`, `/api/quote` with unit tests (min stay, discount, taxes, rounding, deposit split). |
| 4 | Booking UI | Home and property pages ported from the mockup with real photos, availability calendar, live quote, guest details form. |
| 5 | Checkout | Holds, Turnstile (`turnstile-spin` skill), Stripe Checkout in test mode, webhook, confirmation page, emails. Tested end to end with the Stripe CLI forwarding webhooks. |
| 6 | Deposit, balance, cancellation | Saved card for balance, daily balance charge, cancellation with refund per policy tier (admin route behind Cloudflare Access), freeing the dates. |
| 7 | Policies | Drafts of house rules, cancellation, booking terms and privacy pages from Allie's Airbnb listing rules (ask Uvaraj for them). Allie decides; every figure in a policy comes from config. |
| 8 | Launch prep | Runs the "Before we launch" checklist in the planning doc: domain, live Stripe keys, real iCal URLs added to Airbnb and VRBO, PriceLabs key, licence number on the site if Seattle requires it, accountant-confirmed taxes, fake booking + refund on the live site. Uvaraj does the account steps; Claude does not deploy without being asked. |

## Inputs needed from Uvaraj and Allie

- [ ] Airbnb and VRBO iCal export URLs for The Nest Retreat
- [ ] PriceLabs listing id, API key, and the endpoint details from Uvaraj's other project
- [ ] Stripe account (test keys now, live keys at launch), in Allie's name
- [ ] Domain, bought on Cloudflare
- [ ] Host alert email address
- [ ] Tax lines and rates confirmed by Allie's accountant
- [ ] Seattle STR licence number, if it must show on the site
- [ ] Airbnb listing text and house rules, max guests, cleaning fee, check-in/out times
- [ ] Full-size photos, and any of the exterior, street and beach

## Working rules

- Work on a branch (`direct-booking`), never on `main`. Small commits. Push or open PRs only when asked.
- New dependencies already approved: next, react, react-dom, typescript, wrangler, stripe, a schema library (zod), an iCal parser if a small maintained one exists (else write a minimal parser with tests), vitest with the Cloudflare Workers pool. Ask before anything else. Pin exact versions at least two weeks old.
- Never deploy, buy, or touch live keys unless asked in the session.
- Stripe test mode only until Phase 8.
- Copy: no em dashes, US spelling for The Nest Retreat. Guest-facing copy never asks Airbnb or VRBO guests to book direct.
- Log each session: date, phase, what was done, hours, what you'd do differently. Uvaraj copies these into the work log in the planning doc. Keep them in `direct-booking/WORKLOG.md`.
