# Launch runbook (Phase 8)

For each host site. Uvaraj does the account steps; nothing here is run by Claude unless asked. Commands assume `cd direct-booking` and `SITE_ID=<site>` (here `nest-retreat`), with Wrangler logged in to **the host's** Cloudflare account.

Start and finish with the gate. It must pass before anything goes live:

```sh
SITE_ID=nest-retreat npm run launch-check
```

## 1. Content and config (with the host)

- [ ] Answer every `TODO(host)` (`npm run todos` lists them): times, max guests, cleaning fee, minimum nights, house rules, FAQ answers, Allie's picks, Wi-Fi speed.
- [ ] Tax lines and rates confirmed by the accountant, each with its `source`.
- [ ] Payment rule, cancellation tiers and direct discount decided by the host.
- [ ] Policy pages approved: remove the `<!-- draft ... -->` first line of each.
- [ ] STR registration number confirmed, and whether it must show (it shows on the property page and footer when set).
- [ ] Full-size photos: `node scripts/make-photos.mjs <dir> nest-retreat`, then add alt text in `site.ts`.

## 2. Domain and email

- [ ] Buy the domain on Cloudflare; set `domain` in `site.ts`.
- [ ] `npx wrangler email sending enable <domain>`; set `emailFrom` (e.g. `bookings@<domain>`), `contact.email` and `host.alertEmail` in `site.ts`.

## 3. Database and Worker

```sh
npx wrangler d1 create nest-retreat            # copy the id into sites/nest-retreat/cloudflare.json
SITE_ID=nest-retreat npm run site
cd apps/api && npx wrangler d1 migrations apply DB --remote
```

- [ ] `cloudflare.json` routes: `<domain>/api/*` and `<domain>/ical/*` (zone `<domain>`), so the API shares the site's origin.
- [ ] `cloudflare.json` vars: `TURNSTILE_HOSTNAMES=<domain>`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (step 5).
- [ ] Secrets (each prompts; never paste them into chat or files):

```sh
npx wrangler secret put STRIPE_SECRET_KEY        # live key only at launch
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # from the webhook endpoint in step 4
npx wrangler secret put ICAL_EXPORT_TOKEN        # long random string, e.g. openssl rand -base64 32
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put PRICELABS_API_KEY
```

Never set `PAYMENTS`, `PRICE_SOURCE` or `SITE_ORIGIN` in production. (Fake payments and fixture prices only work for a localhost `SITE_ORIGIN` anyway.)

The Worker refuses `sk_live_` keys until `stripePayments` in `apps/api/src/payments.ts` is changed at launch. That guard is deliberate: removing it is the last code change before going live.

## 4. Stripe (host's account)

- [ ] Webhook endpoint `https://<domain>/api/stripe/webhook` with events `checkout.session.completed` and `checkout.session.expired`; its signing secret goes to `STRIPE_WEBHOOK_SECRET`.
- [ ] Card payments on; statement descriptor set to the site name.

## 5. Turnstile and Access

- [ ] Turnstile widget for `<domain>` (managed mode, action `checkout`): site key in `apps/web/.env.production` as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, secret via `wrangler secret put TURNSTILE_SECRET`.
- [ ] Cloudflare Access application covering `<domain>/admin*` and `<domain>/api/admin/*`, allowing the host's email; its team domain and AUD tag go into `cloudflare.json` vars.

## 6. PriceLabs

- [ ] Endpoint and auth details from Uvaraj's other project; implement `pricelabsPriceSource` in `apps/api/src/prices.ts` (the only stub left), with a test against a saved response.
- [ ] `pricelabsListingId` in `site.ts`.

## 7. Calendars

- [ ] Airbnb and VRBO export URLs into `icalImports` in `site.ts`; save scrubbed copies as fixtures in `packages/core/fixtures/ical/` and run the tests.
- [ ] Our export URL into Airbnb and VRBO ("import calendar"):

```sh
read -rs ICAL_EXPORT_TOKEN; export ICAL_EXPORT_TOKEN
SITE_ID=nest-retreat ORIGIN=https://<domain> node scripts/ical-urls.mjs
```

## 8. Deploy

```sh
SITE_ID=nest-retreat npm run launch-check
cd apps/api && npx wrangler deploy
cd ../web && SITE_ID=nest-retreat npm run build && npx wrangler pages deploy out --project-name nest-retreat
```

- [ ] Pages custom domain `<domain>`; remove `robots: noindex` in `apps/web/app/layout.tsx` when ready to be found.

## 9. Prove it on the live site

- [ ] `https://<domain>/api/health` lists the tables and the site id.
- [ ] Admin → Sync now: calendars and prices both `ok`.
- [ ] A real booking with a real card for a cheap night, then cancel it from admin with a full refund. Check both emails, the host alert's first line, and that the dates blocked on Airbnb and VRBO after their next refresh.
- [ ] `node scripts/e2e-booking.mjs https://<domain>` is for local only (fake payments); use the manual booking above for live.
