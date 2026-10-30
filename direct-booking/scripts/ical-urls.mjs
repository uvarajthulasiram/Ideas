#!/usr/bin/env node
// Prints each property's iCal export URL, to paste into Airbnb and VRBO
// ("Import calendar"). The token is derived from the ICAL_EXPORT_TOKEN secret
// exactly as the Worker does (apps/api/src/calendars.ts, exportToken).
//
//   read -rs ICAL_EXPORT_TOKEN; export ICAL_EXPORT_TOKEN
//   SITE_ID=nest-retreat ORIGIN=https://<domain> node scripts/ical-urls.mjs

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { SITE_ID, ORIGIN, ICAL_EXPORT_TOKEN } = process.env;
if (!SITE_ID || !ORIGIN || !ICAL_EXPORT_TOKEN) {
  console.error("Set SITE_ID, ORIGIN and ICAL_EXPORT_TOKEN (see the comment at the top of this file).");
  process.exit(1);
}
const siteTs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "sites", SITE_ID, "site.ts"), "utf8");
// Property ids are the `id:` values inside `properties: [...]`.
const ids = [...siteTs.slice(siteTs.indexOf("properties:")).matchAll(/^\s{6}id: "([a-z0-9-]+)"/gm)].map((m) => m[1]);
for (const id of ids) {
  const token = createHmac("sha256", ICAL_EXPORT_TOKEN).update(`ical-export:${id}`).digest("base64url").slice(0, 32);
  console.log(`${id}: ${ORIGIN.replace(/\/$/, "")}/ical/${id}/${token}.ics`);
}
