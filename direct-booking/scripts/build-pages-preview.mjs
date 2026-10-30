#!/usr/bin/env node
// Builds a static preview of the site for GitHub Pages: served from a subfolder
// (base path), with booking shown as "not connected yet" (there is no Worker there).
//
//   SITE_ID=nest-retreat node scripts/build-pages-preview.mjs <out-dir> <base-path>
//   SITE_ID=nest-retreat node scripts/build-pages-preview.mjs ../nest-retreat-site /Ideas/nest-retreat-site
//
// The repo serving Pages needs a .nojekyll file at its root, or GitHub drops the _next folder.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [outArg, basePath] = process.argv.slice(2);
if (!outArg || !basePath?.startsWith("/")) {
  console.error("Usage: node scripts/build-pages-preview.mjs <out-dir> <base-path starting with />");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(outArg);
const MARKER = ".pages-preview";
if (existsSync(outDir) && !existsSync(join(outDir, MARKER))) {
  console.error(`${outDir} exists and wasn't made by this script; not overwriting it.`);
  process.exit(1);
}

execFileSync("npm", ["run", "build", "-w", "@direct-booking/web"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NEXT_BASE_PATH: basePath, NEXT_PUBLIC_BOOKING_PREVIEW: "1" },
});

rmSync(outDir, { recursive: true, force: true });
cpSync(join(root, "apps/web/out"), outDir, { recursive: true });
writeFileSync(
  join(outDir, MARKER),
  `Static preview built by direct-booking/scripts/build-pages-preview.mjs (base path ${basePath}). Booking is not connected. Rebuild instead of editing.\n`,
);
console.log(`Preview written to ${outDir}`);
