#!/usr/bin/env node
// Copy rules from PLAN.md, checked on the source and the built site:
//   no em dashes; guest copy never asks Airbnb or VRBO guests to book direct;
//   the built pages make no requests to third-party font or analytics hosts.
// Usage: node scripts/check-copy.mjs   (run after `npm run build:web`)

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["sites", "apps/web/app", "apps/web/components", "apps/api/src"];
const TEXT = /\.(ts|tsx|md|css|html|json)$/;
const problems = [];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

function check(path, text, built) {
  const rel = relative(root, path);
  text.split("\n").forEach((line, i) => {
    if (line.includes("—")) problems.push(`${rel}:${i + 1}: em dash`);
    if (/book(ing)? direct(ly)?\b/i.test(line) && /airbnb|vrbo/i.test(line)) problems.push(`${rel}:${i + 1}: asks channel guests to book direct?`);
  });
  if (built && /fonts\.(googleapis|gstatic)\.com|googletagmanager|google-analytics/.test(text)) problems.push(`${rel}: third-party request in built page`);
}

for (const dir of SOURCE_DIRS) {
  for (const path of walk(join(root, dir))) if (TEXT.test(path)) check(path, readFileSync(path, "utf8"), false);
}
const out = join(root, "apps/web/out");
if (existsSync(out)) {
  for (const path of walk(out)) if (path.endsWith(".html")) check(path, readFileSync(path, "utf8"), true);
} else {
  console.log("(apps/web/out not built; checked sources only)");
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Copy check passed.");
