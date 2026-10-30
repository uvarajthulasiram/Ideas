import { env } from "cloudflare:workers";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { site } from "@direct-booking/sites/selected";
import { createHold, getBooking } from "../src/bookings";
import { HOLD_SECONDS } from "../src/checkout";
import { realDeps } from "../src/deps";
import { handle } from "../src/index";
import { refreshRates, fixturePriceSource } from "../src/prices";
import { stripePayments, type PaymentEvent } from "../src/payments";
import { fakeStripe, testDeps } from "./helpers";

const property = site.properties[0]!;
const NOW = "2026-11-01T18:00:00Z";
type Deps = ReturnType<typeof testDeps>;

const call = (deps: Deps, path: string, init?: RequestInit) =>
  handle(new Request(`http://api.test${path}`, init), env, deps).catch((e: unknown) => e as { status: number; code: string; details?: unknown });

async function quoteTotal(deps: Deps, checkIn: string, checkOut: string) {
  const res = await call(deps, "/api/quote", { method: "POST", body: JSON.stringify({ property: property.id, checkIn, checkOut, guests: 2 }) });
  // Dates that can't be quoted: let /api/checkout report why.
  if (!(res instanceof Response)) return { total: 0, dueNow: 0, dueLater: 0 };
  return (await res.json<{ quote: { total: number; dueNow: number; dueLater: number } }>()).quote;
}

async function setup(now = NOW) {
  const deps = testDeps({ now });
  await refreshRates(env.DB, property, site.currency, fixturePriceSource, deps);
  return deps;
}

const guest = { name: "Sam Rivera", email: "sam@example.com", phone: "+1 206 555 0100", note: "Arriving late", agreed: true, turnstileToken: "ok-token" };

async function startCheckout(deps: Deps, checkIn = "2027-01-08", checkOut = "2027-01-11", overrides: Record<string, unknown> = {}) {
  const q = await quoteTotal(deps, checkIn, checkOut);
  const body = { property: property.slug, checkIn, checkOut, guests: 2, ...guest, expectedTotal: q.total, ...overrides };
  return call(deps, "/api/checkout", { method: "POST", body: JSON.stringify(body), headers: { "cf-connecting-ip": "203.0.113.9" } });
}

function completed(bookingId: string, sessionId: string, amount: number): PaymentEvent {
  return {
    id: `evt_${crypto.randomUUID()}`,
    type: "checkout.session.completed",
    session: { id: sessionId, bookingId, paymentStatus: "paid", amountTotal: amount, paymentIntentId: `pi_${bookingId}`, customerId: "cus_1" },
  };
}

const webhook = (deps: Deps, event: PaymentEvent, signature = "valid") =>
  call(deps, "/api/stripe/webhook", { method: "POST", body: JSON.stringify(event), headers: { "stripe-signature": signature } });

describe("POST /api/checkout", () => {
  it("re-quotes, holds the dates and returns a Stripe Checkout URL for the deposit", async () => {
    const deps = await setup();
    const res = (await startCheckout(deps)) as Response;
    expect(res.status).toBe(200);
    const { url, bookingId } = await res.json<{ url: string; bookingId: string }>();
    expect(url).toBe("https://checkout.stripe.test/1");

    const row = (await getBooking(env.DB, bookingId))!;
    expect(row).toMatchObject({ status: "hold", guest_name: "Sam Rivera", guest_note: "Arriving late", stripe_session_id: "cs_test_1", currency: "USD" });
    expect(row.hold_expires_at).toBe(Date.parse(NOW) / 1000 + HOLD_SECONDS);

    const input = deps.payments.checkouts[0]!;
    const quote = JSON.parse(row.quote);
    expect(quote.dueLater).toBeGreaterThan(0); // more than 30 days out: deposit
    expect(input).toMatchObject({ bookingId, amount: quote.dueNow, currency: "USD", saveCard: true, customerEmail: "sam@example.com", expiresAt: row.hold_expires_at });
    expect(input.description).toMatch(/^Deposit: The Nest Retreat, Jan 8/);
    expect(input.successUrl).toBe(`http://localhost:3000/booking/confirmed/?id=${bookingId}&t=${row.view_token}`);
    expect(input.expiresAt - Date.parse(NOW) / 1000).toBeGreaterThanOrEqual(30 * 60);
  });

  it("charges in full, without saving the card, for arrivals within the full-payment window", async () => {
    const deps = await setup();
    await startCheckout(deps, "2026-11-20", "2026-11-23");
    expect(deps.payments.checkouts[0]).toMatchObject({ saveCard: false });
    expect(deps.payments.checkouts[0]!.description).not.toMatch(/Deposit/);
  });

  it("refuses a request that fails Turnstile, before touching anything", async () => {
    const deps = await setup();
    expect(await startCheckout(deps, undefined, undefined, { turnstileToken: "forged" })).toMatchObject({ status: 403, code: "verification_failed" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings").first()).toEqual({ n: 0 });
  });

  it("validates guest details", async () => {
    const deps = await setup();
    const r = (await startCheckout(deps, undefined, undefined, { email: "nope", agreed: false })) as { status: number; details: Record<string, unknown> };
    expect(r.status).toBe(400);
    expect(Object.keys(r.details)).toEqual(expect.arrayContaining(["email", "agreed"]));
  });

  it("stops when the price changed since the guest saw it", async () => {
    const deps = await setup();
    const r = await startCheckout(deps, undefined, undefined, { expectedTotal: 1 });
    expect(r).toMatchObject({ status: 409, code: "price_changed" });
    expect(deps.payments.checkouts).toHaveLength(0);
  });

  it("lets only one guest hold the same nights", async () => {
    const deps = await setup();
    expect(((await startCheckout(deps)) as Response).status).toBe(200);
    expect(await startCheckout(deps, "2027-01-10", "2027-01-13")).toMatchObject({ status: 409, code: "unavailable" });
    // Back-to-back is fine.
    expect(((await startCheckout(deps, "2027-01-11", "2027-01-13")) as Response).status).toBe(200);
  });

  it("makes the overlap check and the insert one statement", async () => {
    const deps = await setup();
    const q = await quoteTotal(deps, "2027-02-01", "2027-02-04");
    const input = { property, quote: { ...q, checkIn: "2027-02-01", checkOut: "2027-02-04", guests: 2, currency: "USD", balanceDueDate: null } as never, guest: { ...guest }, now: new Date(NOW), holdSeconds: HOLD_SECONDS };
    const [a, b] = await Promise.all([createHold(env.DB, input), createHold(env.DB, input)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("frees the dates if Stripe can't create the session", async () => {
    const deps = await setup();
    deps.payments.failCheckout = true;
    expect(await startCheckout(deps)).toMatchObject({ status: 502, code: "payment_unavailable" });
    const row = await env.DB.prepare("SELECT status FROM bookings").first();
    expect(row).toEqual({ status: "expired" });
    deps.payments.failCheckout = false;
    expect(((await startCheckout(deps)) as Response).status).toBe(200);
  });
});

async function heldBooking(deps: Deps, checkIn = "2027-01-08", checkOut = "2027-01-11") {
  const res = (await startCheckout(deps, checkIn, checkOut)) as Response;
  const { bookingId } = await res.json<{ bookingId: string }>();
  const row = (await getBooking(env.DB, bookingId))!;
  return { id: bookingId, session: row.stripe_session_id!, dueNow: JSON.parse(row.quote).dueNow as number, token: row.view_token };
}

describe("POST /api/stripe/webhook", () => {
  it("confirms on payment and sends the host alert, then the guest confirmation", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    const res = (await webhook(deps, completed(b.id, b.session, b.dueNow))) as Response;
    expect(await res.json()).toEqual({ received: true, outcome: "confirmed" });

    const row = (await getBooking(env.DB, b.id))!;
    expect(row).toMatchObject({ status: "confirmed", amount_paid: b.dueNow, stripe_payment_intent_id: `pi_${b.id}`, stripe_customer_id: "cus_1", hold_expires_at: null });
    expect(deps.sent.map((e) => e.to)).toEqual([site.host.alertEmail, "sam@example.com"]);
    const [host, guestMail] = deps.sent;
    expect(host!.text.split("\n")[0]).toBe("Block these dates on Airbnb and VRBO now: Friday, January 8, 2027 to Monday, January 11, 2027 (The Nest Retreat).");
    expect(host!.text).toContain("Arriving late");
    expect(guestMail!.subject).toBe("Your stay at The Nest Retreat is confirmed");
    expect(guestMail!.text).toContain("Balance, charged");
    expect(guestMail!.text).toContain("Cancellation: A full refund");
    expect(guestMail!.html).toContain("<table");
    for (const e of deps.sent) expect(e.text + e.html).not.toMatch(/—/); // no em dashes
  });

  it("is idempotent: a repeated event sends nothing twice", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    const event = completed(b.id, b.session, b.dueNow);
    await webhook(deps, event);
    const again = (await webhook(deps, event)) as Response;
    expect(await again.json()).toMatchObject({ outcome: "already" });
    expect(deps.sent).toHaveLength(2);
  });

  it("retries only the email that failed", async () => {
    let failGuest = true;
    const deps = testDeps({ now: NOW, failEmail: (e) => failGuest && e.to === "sam@example.com" });
    await refreshRates(env.DB, property, site.currency, fixturePriceSource, deps);
    const b = await heldBooking(deps);
    const event = completed(b.id, b.session, b.dueNow);

    // The failed email makes the webhook fail, so Stripe retries it.
    await expect(handle(new Request("http://api.test/api/stripe/webhook", { method: "POST", body: JSON.stringify(event), headers: { "stripe-signature": "valid" } }), env, deps)).rejects.toThrow();
    expect(deps.sent.map((e) => e.to)).toEqual([site.host.alertEmail]);
    expect((await getBooking(env.DB, b.id))!.status).toBe("confirmed");

    failGuest = false;
    await webhook(deps, event);
    expect(deps.sent.map((e) => e.to)).toEqual([site.host.alertEmail, "sam@example.com"]);
  });

  it("rejects a bad signature", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    expect(await webhook(deps, completed(b.id, b.session, 1), "forged")).toMatchObject({ status: 400 });
    expect((await getBooking(env.DB, b.id))!.status).toBe("hold");
  });

  it("ignores events for another session or unknown bookings", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    expect(await ((await webhook(deps, completed(b.id, "cs_other", 1))) as Response).json()).toMatchObject({ outcome: "ignored" });
    expect(await ((await webhook(deps, completed("bk_missing", "cs_x", 1))) as Response).json()).toMatchObject({ outcome: "ignored" });
    expect(await ((await webhook(deps, { id: "evt", type: "invoice.paid" })) as Response).json()).toMatchObject({ outcome: "ignored" });
  });

  it("frees the dates when Checkout expires unpaid", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    await webhook(deps, { id: "evt", type: "checkout.session.expired", session: { id: b.session, bookingId: b.id, paymentStatus: "unpaid", amountTotal: 0, paymentIntentId: null, customerId: null } });
    expect((await getBooking(env.DB, b.id))!.status).toBe("expired");
    expect(((await startCheckout(deps)) as Response).status).toBe(200);
  });

  it("accepts a late payment when the dates are still free", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    deps.setNow("2026-11-01T18:40:00Z");
    await env.DB.prepare("UPDATE bookings SET status = 'expired' WHERE id = ?").bind(b.id).run();
    expect(await ((await webhook(deps, completed(b.id, b.session, b.dueNow))) as Response).json()).toMatchObject({ outcome: "confirmed" });
  });

  it("refunds a late payment in full when the dates were taken meanwhile", async () => {
    const deps = await setup();
    const late = await heldBooking(deps);
    deps.setNow("2026-11-01T18:40:00Z");
    await env.DB.prepare("UPDATE bookings SET status = 'expired' WHERE id = ?").bind(late.id).run();
    const other = await heldBooking(deps, "2027-01-09", "2027-01-12");
    await webhook(deps, completed(other.id, other.session, other.dueNow));
    deps.sent.length = 0;

    const event = completed(late.id, late.session, late.dueNow);
    expect(await ((await webhook(deps, event)) as Response).json()).toMatchObject({ outcome: "refunded" });
    expect((await getBooking(env.DB, late.id))!).toMatchObject({ status: "cancelled", amount_paid: late.dueNow });
    expect(deps.payments.refunds).toEqual([{ paymentIntentId: `pi_${late.id}`, amount: late.dueNow, key: `late-refund-${late.id}` }]);
    expect(deps.sent.map((e) => e.subject)).toEqual([expect.stringMatching(/^Refunded a late payment/), expect.stringMatching(/has been refunded$/)]);

    // A retry reuses the same refund key and sends nothing new.
    await webhook(deps, event);
    expect(new Set(deps.payments.refunds.map((r) => r.key)).size).toBe(1);
    expect(deps.sent).toHaveLength(2);
  });

  it("verifies real Stripe signatures inside workerd", async () => {
    const secret = "whsec_test_secret";
    const payments = stripePayments("sk_test_dummy", secret);
    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", object: "checkout.session", metadata: { bookingId: "bk_1" }, client_reference_id: "bk_1", payment_status: "paid", amount_total: 32350, payment_intent: "pi_1", customer: "cus_1" } },
    });
    const header = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, cryptoProvider: Stripe.createSubtleCryptoProvider() });
    expect(await payments.parseWebhook(payload, header)).toEqual({
      id: "evt_1",
      type: "checkout.session.completed",
      session: { id: "cs_1", bookingId: "bk_1", paymentStatus: "paid", amountTotal: 32350, paymentIntentId: "pi_1", customerId: "cus_1" },
    });
    await expect(payments.parseWebhook(payload, header.replace(/v1=[0-9a-f]/, "v1=0"))).rejects.toThrow();
    expect(() => stripePayments("sk_live_123", secret)).toThrow(/Live Stripe key refused/);
  });
});

describe("booking page routes", () => {
  it("shows a booking only with its token, without contact details or Stripe ids", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    const res = (await call(deps, `/api/booking/${b.id}?t=${b.token}`)) as Response;
    const { booking } = await res.json<{ booking: Record<string, unknown> }>();
    expect(booking).toMatchObject({ id: b.id, status: "hold", checkIn: "2027-01-08", guestName: "Sam Rivera" });
    expect(JSON.stringify(booking)).not.toMatch(/sam@example\.com|555|cs_test|view_token/);
    expect(await call(deps, `/api/booking/${b.id}?t=wrong`)).toMatchObject({ status: 404 });
    expect(await call(deps, `/api/booking/${b.id}`)).toMatchObject({ status: 404 });
  });

  it("releases a hold when the guest leaves Checkout, expiring the Stripe session", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    const res = (await call(deps, `/api/booking/${b.id}/release?t=${b.token}`, { method: "POST" })) as Response;
    expect(await res.json()).toEqual({ released: true });
    expect(deps.payments.expired).toEqual([b.session]);
    expect((await getBooking(env.DB, b.id))!).toMatchObject({ status: "expired", status_note: "released by guest" });
  });

  it("does not release a paid booking", async () => {
    const deps = await setup();
    const b = await heldBooking(deps);
    await webhook(deps, completed(b.id, b.session, b.dueNow));
    const res = (await call(deps, `/api/booking/${b.id}/release?t=${b.token}`, { method: "POST" })) as Response;
    expect(await res.json()).toEqual({ released: false });
    expect((await getBooking(env.DB, b.id))!.status).toBe("confirmed");
  });
});

describe("development shortcuts", () => {
  it("uses fake payments and fixture prices only for a localhost site", () => {
    expect(realDeps({ ...env, PAYMENTS: "fake", PRICE_SOURCE: "fixture", SITE_ORIGIN: "http://localhost:3000" }).payments.name).toBe("fake");
    const prod = realDeps({ ...env, PAYMENTS: "fake", PRICE_SOURCE: "fixture", SITE_ORIGIN: "https://thenestretreat.example" });
    expect(prod.payments.name).toBe("stripe");
    expect(prod.prices.name).toBe("pricelabs");
  });

  it("serves the test checkout page only with fake payments", async () => {
    const deps = await setup();
    expect(await call(deps, "/api/dev/checkout/fake_cs_bk_1?amount=100")).toMatchObject({ status: 404 });
    const fake = testDeps({ now: NOW, payments: { ...fakeStripe(), name: "fake" } as never });
    const page = (await call(fake, "/api/dev/checkout/fake_cs_bk_1?amount=12345&currency=USD&what=Test")) as Response;
    expect(await page.text()).toContain("$123.45");
  });
});
