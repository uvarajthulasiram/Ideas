#!/usr/bin/env node
// Launch gate (PLAN.md, Phase 8): fails while anything placeholder would reach production.
//   SITE_ID=nest-retreat node scripts/launch-check.mjs
// It reads files only. Secrets set with `wrangler secret put` are checked by the
// steps in LAUNCH.md, not here.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const siteId = process.env.SITE_ID;
if (!siteId) {
  console.error("Set SITE_ID, e.g. SITE_ID=nest-retreat node scripts/launch-check.mjs");
  process.exit(1);
}
const siteDir = join(root, "sites", siteId);
const read = (p) => readFileSync(join(siteDir, p), "utf8");
const fails = [];
const fail = (msg) => fails.push(msg);

// 1. Every TODO(host) answered.
for (const file of ["site.ts", "cloudflare.json", ...readdirSync(join(siteDir, "content")).map((f) => `content/${f}`)]) {
  read(file)
    .split("\n")
    .forEach((line, i) => line.includes("TODO(host)") && fail(`${file}:${i + 1}: TODO(host) ${line.trim().slice(0, 90)}`));
}

// 2. No placeholder values in config.
const siteTs = read("site.ts");
if (/domain:\s*null/.test(siteTs)) fail("site.ts: domain is null");
if (/@example\.com/.test(siteTs)) fail("site.ts: an example.com email address is still set");
if (/pricelabsListingId:\s*null/.test(siteTs)) fail("site.ts: no PriceLabs listing id");
if (/icalImports:\s*\[\s*(\/\/[^\n]*\n\s*)*\]/.test(siteTs)) fail("site.ts: no iCal import URLs");
if (/ratePercent:\s*0\b/.test(siteTs)) fail("site.ts: a tax line has a 0% placeholder rate");
if (/cleaningFee:\s*0\b(?![^\n]*\/\/ none)/.test(siteTs)) fail("site.ts: cleaning fee is 0 (if there really is none, mark it `cleaningFee: 0, // none`)");
const cf = JSON.parse(read("cloudflare.json"));
if (/^0{8}-/.test(cf.d1?.databaseId ?? "")) fail("cloudflare.json: D1 database id is the all-zero placeholder");
for (const [name, value] of Object.entries(cf.vars ?? {})) if (!String(value).trim()) fail(`cloudflare.json: vars.${name} is empty`);
if (/localhost|127\.0\.0\.1/.test(cf.vars?.TURNSTILE_HOSTNAMES ?? "")) fail("cloudflare.json: TURNSTILE_HOSTNAMES must not include localhost in production");
if (!cf.routes?.length) fail("cloudflare.json: no routes (the Worker must serve /api/* and /ical/* on the site's domain)");

// 3. Policy pages approved.
for (const page of ["house-rules", "cancellation", "terms", "privacy"]) {
  if (existsSync(join(siteDir, "content", `${page}.md`)) && read(`content/${page}.md`).trimStart().startsWith("<!-- draft")) fail(`content/${page}.md: still marked draft`);
}

// 4. Production build environment.
const envProd = join(root, "apps/web/.env.production");
const prod = existsSync(envProd) ? readFileSync(envProd, "utf8") : "";
if (!/NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x\w+/.test(prod)) fail("apps/web/.env.production: real NEXT_PUBLIC_TURNSTILE_SITE_KEY (0x...) not set");
if (/NEXT_PUBLIC_API_BASE=\S/.test(prod)) fail("apps/web/.env.production: NEXT_PUBLIC_API_BASE should be empty (same origin)");

if (fails.length) {
  console.error(`Not ready to launch ${siteId}: ${fails.length} item(s)\n\n${fails.map((f) => `- ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${siteId}: launch check passed. Continue with LAUNCH.md.`);
