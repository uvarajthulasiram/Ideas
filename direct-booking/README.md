# Direct booking engine

One codebase for short-term rental direct booking sites. Each host is a folder in `sites/`; `SITE_ID` picks which one a build is for. Decisions, data model, API and phases: [PLAN.md](PLAN.md). Session log: [WORKLOG.md](WORKLOG.md).

```
apps/web        Next.js static export (Cloudflare Pages)
apps/api        Cloudflare Worker + D1 (migrations in apps/api/migrations)
packages/core   config schema, date and money helpers
sites/<id>      site.ts (config), cloudflare.json (Worker name, D1), content/, photos/
scripts/        select-site.mjs
```

## Run locally

Needs Node 22+.

```sh
cd direct-booking
npm install
SITE_ID=nest-retreat npm run site   # once; later commands reuse it (set SITE_ID again to switch)

npm run db:migrate:local            # apply D1 migrations to the local database
npm run dev:api                     # Worker on http://localhost:8788  (try /api/health)
npm run dev:web                     # site on http://localhost:3000

npm test                            # core unit tests + Worker tests (in workerd, fresh D1)
npm run typecheck
npm run build:web                   # static export in apps/web/out
npm run todos                       # every placeholder still waiting for the host
```

`npm run site` writes two gitignored files: `sites/selected.ts` (which site both apps import) and `apps/api/wrangler.jsonc` (from `apps/api/wrangler.base.json` + `sites/<id>/cloudflare.json`). The apps' dev, build, test and typecheck scripts rerun it, so edit those two sources, never the generated files.

Worker secrets go in `apps/api/.dev.vars` (copy `.dev.vars.example`; test-mode values only).

## Adding a host

Copy `sites/nest-retreat/` to `sites/<new-id>/`, edit `site.ts` and `cloudflare.json`, then `SITE_ID=<new-id> npm run site`. Nothing in `apps/` or `packages/` changes.

## Notes

- npm 10.9 crashes (`Cannot read properties of null (reading 'edgesOut')`) when it builds the lockfile from scratch, on an optional peer chain under vite. With the committed `package-lock.json`, a normal `npm install` works. If you ever regenerate the lockfile: `npm install --legacy-peer-deps`, then `npm install`.
