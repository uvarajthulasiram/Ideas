#!/usr/bin/env node
// Checks the home page story film in a real browser (Phase 7 of the scroll-story skill,
// adapted for the autoplay film):
//   - autoplays when scrolled into view, the page keeps scrolling, it pauses when out of view
//   - reduced motion: no autoplay, a play button and pictures instead
//   - no single-frame jumps: canvas change between 0.1 s steps never spikes above its neighbors
//   - where the story starts and how long the page is, on phones
//   node scripts/check-story.mjs [site-url] [screenshot-dir]

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:8791", shots] = process.argv.slice(2);
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) fails.push(msg); };

for (const [w, h] of [[390, 844], [375, 667], [1280, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const geo = await page.evaluate(() => ({ story: document.getElementById("story").getBoundingClientRect().top + scrollY, page: document.documentElement.scrollHeight, ih: innerHeight }));
  console.log(`${w}×${h}: story starts at ${(geo.story / geo.ih).toFixed(2)} screens; page is ${(geo.page / geo.ih).toFixed(1)} screens`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w}×${h}: no horizontal scroll`);

  const label = () => page.evaluate(() => document.querySelector(".film-play").getAttribute("aria-label"));
  check((await label()) === "Play the story", `${w}×${h}: not playing before it is on screen`);
  await page.evaluate(() => document.querySelector(".film-stage").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1500);
  check((await label()) === "Pause the story", `${w}×${h}: autoplays once on screen`);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, h * 1.5); await page.waitForTimeout(900);
  check((await page.evaluate(() => scrollY)) > y0 + h, `${w}×${h}: the page scrolls past the film`);
  check((await label()) === "Play the story", `${w}×${h}: pauses when scrolled away`);

  if (w === 390) {
    // Frame continuity: render every 0.1 s and compare consecutive frames.
    await page.evaluate(() => document.querySelector(".film-stage").scrollIntoView({ block: "center" }));
    const res = await page.evaluate(async () => {
      const f = window.__film, c = document.querySelector(".film-canvas"), g = c.getContext("2d", { willReadFrequently: true }), total = f.timeline.reduce((a, s) => a + s[2], 0), out = [];
      let prev = null;
      for (let T = 0; T <= total; T += 0.1) { f.debugSeek(T); const d = g.getImageData(0, 0, c.width, c.height).data; if (prev) { let s = 0; for (let k = 0; k < d.length; k += 32) s += Math.abs(d[k] - prev[k]) + Math.abs(d[k + 1] - prev[k + 1]) + Math.abs(d[k + 2] - prev[k + 2]); out.push([T, s / (d.length / 32) / 3]); } prev = d.slice(); }
      return { out, timeline: f.timeline };
    });
    const jumps = res.out.filter(([, d], i, a) => d > 8 && d > 3 * Math.max(a[i - 1]?.[1] ?? 0, a[i + 1]?.[1] ?? 0, 2));
    check(jumps.length === 0, `no single-frame jumps in ${res.out.length} steps${jumps.length ? `: ${JSON.stringify(jumps.map(([T, d]) => [+T.toFixed(1), +d.toFixed(1)]))}` : ""}`);
    if (shots) for (const [id, s, d] of res.timeline) { await page.evaluate((T) => window.__film.debugSeek(T), s + d * 0.6); await page.locator(".film-stage").screenshot({ path: join(shots, `${id}.png`) }); }
  }
  check(errors.length === 0, `${w}×${h}: no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
  await page.close();
}

// Reduced motion: no autoplay; play button and pictures offered.
const rm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
await rm.goto(base + "/", { waitUntil: "networkidle" });
await rm.evaluate(() => document.querySelector(".film-stage").scrollIntoView({ block: "center" }));
await rm.waitForTimeout(1200);
check(await rm.evaluate(() => !document.querySelector(".film-start").hidden), "reduced motion: shows the play and pictures choice");
check((await rm.evaluate(() => document.querySelector(".film-play").getAttribute("aria-label"))) === "Play the story", "reduced motion: does not autoplay");
await rm.getByRole("button", { name: "Show as pictures" }).first().click();
await rm.waitForTimeout(600);
check((await rm.locator(".film-stills li").count()) === 9, "pictures: one still per chapter, with captions");
await rm.close();
await browser.close();

if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log("\nStory checks passed.");
