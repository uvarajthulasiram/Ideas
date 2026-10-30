#!/usr/bin/env node
// Full-page screenshots of the running site at phone and desktop widths.
//   node scripts/screens.mjs <out-dir> [base-url] [path ...]
// Default base http://localhost:3000, default paths: / and every /stay/<slug>/.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const [outDir, base = "http://localhost:3000", ...paths] = process.argv.slice(2);
if (!outDir) {
  console.error("Usage: node scripts/screens.mjs <out-dir> [base-url] [path ...]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const sizes = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch();
const errors = [];
for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  page.on("console", (m) => m.type() === "error" && errors.push(`${size.name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${size.name}: ${e.message}`));
  for (const path of paths.length ? paths : ["/", "/stay/the-nest/"]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    const file = join(outDir, `${size.name}${path.replace(/[^a-z0-9]+/gi, "_")}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(`${file}${scrollWidth > size.width ? `  (horizontal overflow: ${scrollWidth}px)` : ""}`);
  }
  await page.close();
}
await browser.close();
if (errors.length) console.log("Console errors:\n" + errors.join("\n"));
