#!/usr/bin/env node
// End-to-end booking in a real browser against the local stack:
//   npm run dev:api   (PAYMENTS=fake, PRICE_SOURCE=fixture in apps/api/.dev.vars)
//   npm run dev:web
//   node scripts/e2e-booking.mjs [site-url] [screenshot-dir]
// Picks dates with the keyboard, reads the live quote, fills guest details,
// passes Turnstile (test key), pays on the test checkout and checks the
// confirmation page. Exits non-zero on the first failure.

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:3000", shots] = process.argv.slice(2);
if (shots) mkdirSync(shots, { recursive: true });
const snap = async (page, name) => shots && page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
const step = (msg) => console.log(`✓ ${msg}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

try {
  // 1. Property page; pick dates with the keyboard only.
  await page.goto(`${base}/stay/the-nest/`, { waitUntil: "networkidle" });
  await page.getByText("Choose check-in").waitFor();
  const next = page.getByRole("button", { name: "Next month" });
  for (let i = 0; i < 3; i++) await next.click();
  // Focus the month's tabbable day, then move with arrows: Enter picks.
  await page.locator(".day[tabindex='0']").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  const checkIn = await page.evaluate(() => document.activeElement?.getAttribute("data-date"));
  await page.keyboard.press("Enter");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  const checkOut = await page.evaluate(() => document.activeElement?.getAttribute("data-date"));
  await page.keyboard.press("Enter");
  assert.ok(checkIn && checkOut && checkOut > checkIn, `picked ${checkIn} to ${checkOut}`);
  step(`picked ${checkIn} to ${checkOut} with the keyboard`);

  const total = page.locator(".lines__total dd").first();
  await total.waitFor();
  const shownTotal = await total.textContent();
  assert.match(shownTotal ?? "", /^\$[\d,]+\.\d{2}$/);
  step(`live quote total ${shownTotal}`);
  await snap(page, "1-property");

  // 2. Guest details.
  await page.getByRole("link", { name: "Reserve" }).click();
  await page.waitForURL(/\/book\/the-nest\//);
  await page.locator(".lines__total dd").first().waitFor();
  assert.equal(await page.locator(".lines__total dd").first().textContent(), shownTotal, "booking page shows the same total");

  // Empty submit shows field errors and focuses the first one.
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "f-name");
  step("empty form: errors shown, focus on the first field");

  await page.getByLabel("Full name").fill("Test Guest");
  await page.getByLabel("Email").fill("guest@example.com");
  await page.getByLabel("Mobile phone").fill("+1 206 555 0199");
  await page.getByLabel("A note for your host (optional)").fill("End-to-end test booking");
  await page.getByRole("checkbox").check();
  // Turnstile's test key passes on its own; wait for its token.
  await page.waitForFunction(() => document.querySelector("[name='cf-turnstile-response']")?.value, null, { timeout: 30_000 });
  step("Turnstile token received (test key)");
  await snap(page, "2-details");
  await page.getByRole("button", { name: "Continue to secure payment" }).click();

  // 3. Test checkout (PAYMENTS=fake), then the confirmation page.
  await page.waitForURL(/\/api\/dev\/checkout\//, { timeout: 30_000 });
  await page.getByText("Test checkout.").waitFor();
  step("hold created; on the test checkout page");
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL(/\/booking\/confirmed\//);
  await page.getByRole("heading", { name: /You're booked, Test/ }).waitFor({ timeout: 30_000 });
  step("confirmation page shows the booking");
  await snap(page, "3-confirmed");

  // 4. The nights are now taken.
  await page.goto(`${base}/stay/the-nest/?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`, { waitUntil: "networkidle" });
  await page.getByText(/already booked/).waitFor();
  step("the same dates now show as booked");

  assert.deepEqual(errors, [], "no page errors");
  console.log("\nEnd-to-end booking passed.");
} catch (e) {
  await snap(page, "failure");
  console.error(`✗ ${e.message}`);
  if (errors.length) console.error("Page errors:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
