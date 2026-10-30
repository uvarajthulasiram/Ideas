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
