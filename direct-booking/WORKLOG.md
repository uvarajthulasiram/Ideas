# Work log

One entry per session. Uvaraj copies these into the work log in the planning doc.

## 2026-10-29 · Phase 1 (Scaffold) · about 0.5 h

**Done**

- Branch `direct-booking` from `main`.
- npm workspaces: `packages/core`, `sites`, `apps/api`, `apps/web`. Exact pinned versions, all at least two weeks old: next 16.4.1, react and react-dom 19.2.9, typescript 6.0.3, wrangler 4.151.0, zod 4.6.7, vitest 4.1.11, @cloudflare/vitest-plugin 1.4.2, @types/react 19.2.18, @types/react-dom 19.2.7, @types/node 22.20.5.
- `packages/core`: site config schema (`defineSite`, which validates at import so a bad config fails the build), site-level policies that a property can override, date helpers (exclusive check-out, DST-safe, timezone-aware "today"), money helpers (integer minor units, exact percentages rounded half up, formatting by currency and locale). 30 unit tests.
- `sites/nest-retreat/site.ts` with Driftwood & Fog tokens from the mockup and 20 `TODO(host)` placeholders (`npm run todos`). `cloudflare.json` holds the per-site Worker name and D1 database.
- `scripts/select-site.mjs`: `SITE_ID` generates `sites/selected.ts` and `apps/api/wrangler.jsonc`, so adding a host never touches `apps/`.
- Worker: D1 migration `0001_initial.sql` (all five tables from the plan, with CHECK constraints), `/api/health`, stub cron handler with the three schedules. Runs under `wrangler dev` with local D1. 3 tests in workerd.
- Site: Next.js static export with brand tokens as CSS variables, a home page with the marked story slot, and one static `/stay/<slug>/` page per property.

**Decisions made this session (with Uvaraj)**

- Added @types/react, @types/react-dom and @types/node (approved).
- Used @cloudflare/vitest-plugin instead of @cloudflare/vitest-pool-workers, which is deprecated and renamed (approved).
- Stayed on vitest 4.1.11: vitest 5 needs `vite` as a separately listed dependency, which isn't approved.
- Worker dev port 8788, because something else on this Mac already listens on 8787.
- Added a `view_token` column to `bookings` for `GET /api/booking/<id>?t=<token>`.

**Open**

- `npm audit` lists 8 findings, all in dev tooling or unused code: undici (wrangler/miniflare), @vitest/mocker, an older zod bundled inside the vitest plugin, and sharp (Next's image optimizer, not used by a static export). Nothing ships to guests. Review again before launch.
- npm 10.9 bug when building the lockfile from scratch. Workaround in README.
- `nest-retreat/photos/` (Allie's originals) is still untracked in git and left as is. Web sizes come in Phase 4.

**Would do differently**

- Check the pool package's npm deprecation notice before the first install, not after.

## 2026-10-29 to 2026-10-30 · Phases 2 to 8 and the story storyboard · about 3 h

Uvaraj asked for every phase in one go, with stubs for missing inputs, and was away for most of it ("go with your recommendations"). Each phase was committed separately on `direct-booking`.

**Done**

- **Phase 2, calendars:** a small RFC 5545 parser and writer in core (line folding, DATE and UTC times mapped to the property's timezone, exclusive end, cancelled events skipped) with synthetic Airbnb and VRBO fixtures. Import every 15 minutes; a failed feed keeps its blocks. Per-property tokened export feed of direct bookings, live holds and manual blocks only.
- **Phase 3, pricing:** `quoteStay()` in core is the only price maths (nightly rates, direct discount, cleaning, tax lines, deposit split, dated cancellation tiers). Daily rates fetch with a fixture source; PriceLabs is a stub that refuses to run until its details are known. `/api/availability`, `/api/quote`.
- **Phase 4, booking UI:** the mockup ported into typed site content (`sites/nest-retreat/content`) with `{{placeholders}}` filled from config; Allie's photos as AVIF/WebP at three widths; a keyboard date-range calendar; a live quote. Client code never imports the site config (the private alert email stays out of the browser).
- **Phase 5, checkout:** Turnstile (Cloudflare's test keys), a calendar refresh, a re-quote, an atomic hold (overlap check inside the INSERT), and Stripe Checkout in test mode (live keys refused). The webhook is idempotent: host alert first, then guest confirmation, and a retry sends only what failed. A late payment after the hold expired, with the dates taken, is refunded automatically. Guest pages for details, confirmation and cancellation. `PAYMENTS=fake` gives a local test checkout (localhost only). `scripts/e2e-booking.mjs` books end to end in a browser: passed.
- **Phase 6, deposit, balance, cancellation:** daily off-session balance charge (claimed, with idempotency keys); on a decline, a 24-hour payment link to the guest and an alert to the host. Admin API behind Cloudflare Access (JWT checked in the Worker) with cancellation and refund per tier (balance payment refunded first), manual blocks and sync now, plus a small `/admin` page.
- **Phase 7, policies:** drafts of the house rules, cancellation, terms and privacy pages, every figure from config, with a visible draft notice and `TODO(host)` for Allie's decisions. Fonts are now self-hosted (OFL), so pages make no third-party requests. `check:copy` enforces the copy rules.
- **Phase 8, launch prep:** `launch-check` (fails on 40 open items today), a `LAUNCH.md` runbook, and an `ical-urls` helper. No deploys, purchases or live keys.
- **Story (scroll-story-site skill):** interview done; `sites/nest-retreat/brand.json` written; contrast checked (every pair the site uses passes AA). Three concepts and a sketch storyboard published: https://claude.ai/artifact/3L1ZAs6KPJcjo4vUhkVR6k. **Stopped at the skill's storyboard gate for approval.**
- Tests: 64 core, 58 Worker, 5 web; typecheck clean.

**Decisions (approved, or "go with your recommendations")**

- New dependencies: stripe 23.0.0, gsap 3.15.0 (approved, not installed until the story build), playwright 1.64.1 (dev). Images use macOS `sips` and `cwebp`, so no image package was added.
- The story text's "like TV being tucked into a nest" was corrected to "like being tucked into a nest" (approved).
- Site copy is typed content rather than one Markdown file per section (FAQ and policies are Markdown), so a new host can reorder sections without touching `apps/`.
- Added beyond the plan's three emails: a guest cancellation notice and the late-payment refund notices.
- Same-day bookings are refused (check-in must be after today, in the property's timezone).
- Cards only at Checkout (holds and off-session balances need instant card payments).
- The "A day at the Nest" timeline photos were dropped (uneven layout); the guestbook section stays out until there are real notes.

**Open (needs Uvaraj or Allie)**

- Storyboard marks or "go with your picks".
- Everything `npm run todos` and `npm run launch-check` list, notably PriceLabs endpoint details, iCal feeds, Stripe test keys, the domain, taxes and house rules.
- `npm audit`: dev-tool findings only, as before.

**Would do differently**

- Write the copy check and launch gate first; both caught real issues once they existed.
- Set the browser screenshot check up at the start of the UI phase, not after the first build.

## 2026-10-30 · Story film built into the site · about 1.5 h

**Done**

- Storyboard approved; prototype 1 (scroll-scrubbed) rejected by Uvaraj and Allie: on a phone the page seemed stuck while scrolling. Prototype 2, an autoplay film with richer art (contrast, foregrounds, an arrival shot with a keypad close-up, a dollhouse cutaway, an aerial map, a real beach, the fire pit at night), approved.
- Built into the site: `packages/film` (generic canvas helpers), `sites/nest-retreat/story/` (the Nest's nine shots and captions), the player (`apps/web/lib/film-player.ts`, `components/StoryFilm.tsx`). The story entry point (`@direct-booking/sites/story`) never includes the site config.
- It plays when 55% on screen, pauses when scrolled away or the tab hides, has pause and chapter controls under the picture, "Show as pictures", "Skip the story", and a transcript without JavaScript. Reduced motion: no autoplay.
- Page pass: "A day at the Nest" and the closing section removed; hero 4:3 on phones; Allie's full text in a "The story in Allie's words" panel; `#check` anchor for the finale's "Check your dates".
- `scripts/check-story.mjs`: autoplay, scrolling past, pausing, reduced motion, pictures, no horizontal scroll, and frame continuity (649 steps, no jumps) at 390 × 844, 375 × 667 and 1280 × 900. All pass. Home page: 8.6 phone screens.

**Decisions**

- Autoplay film instead of the skill's scroll-scrubbed default (Uvaraj and Allie).
- GSAP not added: nothing scroll-driven remains.

**Open**

- Allie to confirm the exterior colors, the downstairs layout and the keypad shown in the film.
- The story starts 1.36 screens down on a 390 px phone (hero, search bar). Less important now the film autoplays in place; revisit after phone feedback.

**Would do differently**

- Prototype the playback model (scroll or autoplay) with the host on a real phone before polishing scenes.
