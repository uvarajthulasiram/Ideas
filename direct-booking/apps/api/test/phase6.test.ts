import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { site } from "@direct-booking/sites/selected";
import { clearAccessCache, requireAdmin } from "../src/access";
import { getBooking } from "../src/bookings";
import { handle, runCron, CRONS } from "../src/index";
import { fixturePriceSource, refreshRates } from "../src/prices";
import type { PaymentEvent } from "../src/payments";
import { testDeps } from "./helpers";

const property = site.properties[0]!;
const NOW = "2026-11-01T18:00:00Z";
type Deps = ReturnType<typeof testDeps>;

const call = (deps: Deps, path: string, init?: RequestInit) =>
  handle(new Request(`http://api.test${path}`, init), env, deps).catch((e: unknown) => e as { status: number; code: string });

/** A confirmed booking with a deposit paid, via the real checkout and webhook routes. */
async function confirmedBooking(deps: Deps, checkIn = "2027-01-08", checkOut = "2027-01-11") {
  await refreshRates(env.DB, property, site.currency, fixturePriceSource, deps);
  const q = await ((await call(deps, "/api/quote", { method: "POST", body: JSON.stringify({ property: property.id, checkIn, checkOut, guests: 2 }) })) as Response).json<{
    quote: { total: number };
  }>();
  const res = (await call(deps, "/api/checkout", {
    method: "POST",
    body: JSON.stringify({ property: property.id, checkIn, checkOut, guests: 2, name: "Sam Rivera", email: "sam@example.com", phone: "+1 206 555 0100", agreed: true, turnstileToken: "ok-token", expectedTotal: q.quote.total }),
  })) as Response;
  const { bookingId } = await res.json<{ bookingId: string }>();
  const row = (await getBooking(env.DB, bookingId))!;
  const dueNow = JSON.parse(row.quote).dueNow as number;
  const event: PaymentEvent = {
    id: "evt_1",
    type: "checkout.session.completed",
    session: { id: row.stripe_session_id!, kind: "booking", bookingId, paymentStatus: "paid", amountTotal: dueNow, paymentIntentId: `pi_dep_${bookingId}`, customerId: "cus_1" },
  };
  await call(deps, "/api/stripe/webhook", { method: "POST", body: JSON.stringify(event), headers: { "stripe-signature": "valid" } });
  deps.sent.length = 0;
  return { id: bookingId, total: q.quote.total, dueNow, balance: q.quote.total - dueNow, token: row.view_token };
}

describe("balance charges", () => {
  it("charges the saved card on the due date, once", async () => {
    const deps = testDeps({ now: NOW });
    const b = await confirmedBooking(deps); // arrival Jan 8, balance due Dec 9
    expect((await getBooking(env.DB, b.id))!.balance_due_date).toBe("2026-12-09");

    deps.setNow("2026-12-08T17:00:00Z");
    await runCron(CRONS.balances, env, deps);
    expect(deps.payments.charges).toHaveLength(0);

    deps.setNow("2026-12-09T17:00:00Z");
    await runCron(CRONS.balances, env, deps);
    expect(deps.payments.charges).toEqual([
      expect.objectContaining({ customerId: "cus_1", depositPaymentIntentId: `pi_dep_${b.id}`, amount: b.balance, currency: "USD", idempotencyKey: `balance-${b.id}` }),
    ]);
    expect(await getBooking(env.DB, b.id)).toMatchObject({ amount_paid: b.total, balance_status: "paid", balance_payment_intent_id: `pi_balance-${b.id}` });

    await runCron(CRONS.balances, env, deps);
    expect(deps.payments.charges).toHaveLength(1);
  });

  it("on a decline, emails the guest a 24-hour payment link and alerts the host", async () => {
    const deps = testDeps({ now: NOW });
    const b = await confirmedBooking(deps);
    deps.payments.declineCharges = "Your card was declined.";
    deps.setNow("2026-12-09T17:00:00Z");
    await runCron(CRONS.balances, env, deps);

    const row = (await getBooking(env.DB, b.id))!;
    expect(row).toMatchObject({ balance_status: "failed", balance_error: "Your card was declined.", amount_paid: b.dueNow });
    const link = deps.payments.checkouts.at(-1)!;
    expect(link).toMatchObject({ bookingId: b.id, amount: b.balance, saveCard: false, metadata: expect.objectContaining({ kind: "balance" }) });
    expect(link.expiresAt - Date.parse("2026-12-09T17:00:00Z") / 1000).toBeLessThanOrEqual(24 * 3600);
    expect(deps.sent.map((e) => [e.to, e.subject])).toEqual([
      ["sam@example.com", "Action needed: balance for your stay at The Nest Retreat"],
      [site.host.alertEmail, expect.stringMatching(/^Balance payment failed/)],
    ]);
    expect(deps.sent[0]!.text).toContain(`https://checkout.stripe.test/${deps.payments.checkouts.length}`);

    // The next day's run doesn't charge again; the host decides.
    deps.setNow("2026-12-10T17:00:00Z");
    await runCron(CRONS.balances, env, deps);
    expect(deps.payments.charges).toHaveLength(1);

    // The guest pays through the link.
    const event: PaymentEvent = {
      id: "evt_bal",
      type: "checkout.session.completed",
      session: { id: row.balance_session_id!, kind: "balance", bookingId: b.id, paymentStatus: "paid", amountTotal: b.balance, paymentIntentId: "pi_link", customerId: null },
    };
    const res = (await call(deps, "/api/stripe/webhook", { method: "POST", body: JSON.stringify(event), headers: { "stripe-signature": "valid" } })) as Response;
    expect(await res.json()).toMatchObject({ outcome: "balance_paid" });
    expect(await getBooking(env.DB, b.id)).toMatchObject({ amount_paid: b.total, balance_status: "paid", balance_payment_intent_id: "pi_link" });
    // Replayed: counted once.
    await call(deps, "/api/stripe/webhook", { method: "POST", body: JSON.stringify(event), headers: { "stripe-signature": "valid" } });
    expect((await getBooking(env.DB, b.id))!.amount_paid).toBe(b.total);
  });

  it("retries a charge left pending by a crashed run, with the same idempotency key", async () => {
    const deps = testDeps({ now: NOW });
    const b = await confirmedBooking(deps);
    await env.DB.prepare("UPDATE bookings SET balance_status = 'pending', balance_attempted_at = ? WHERE id = ?")
      .bind(Date.parse("2026-12-09T10:00:00Z") / 1000, b.id)
      .run();
    deps.setNow("2026-12-09T10:30:00Z");
    await runCron(CRONS.balances, env, deps);
    expect(deps.payments.charges).toHaveLength(0); // still fresh
    deps.setNow("2026-12-09T17:00:00Z");
    await runCron(CRONS.balances, env, deps);
    expect(deps.payments.charges.map((c) => c.idempotencyKey)).toEqual([`balance-${b.id}`]);
  });

  it("never charges a cancelled booking or one paid in full", async () => {
    const deps = testDeps({ now: NOW });
    const b = await confirmedBooking(deps);
    await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(b.id).run();
    const full = await confirmedBooking(deps, "2026-11-20", "2026-11-23"); // within 30 days: paid in full
    expect((await getBooking(env.DB, full.id))!.balance_due_date).toBeNull();
    deps.setNow("2027-01-07T17:00:00Z");
    await runCron(CRONS.balances, env, deps);
    expect(deps.payments.charges).toHaveLength(0);
  });
});

describe("cancellation (admin)", () => {
  const cancel = (deps: Deps, id: string, body: object = {}) =>
    call(deps, `/api/admin/bookings/${id}/cancel`, { method: "POST", body: JSON.stringify(body) });

  it("refunds by the policy tier for today, frees the dates and tells the guest", async () => {
    const deps = testDeps({ now: NOW });
    const b = await confirmedBooking(deps); // 68 days out: 100% tier
    const list = await ((await call(deps, "/api/admin/bookings")) as Response).json<{ bookings: { id: string; policyRefundToday: { percent: number; amount: number } }[] }>();
    expect(list.bookings.find((x) => x.id === b.id)!.policyRefundToday).toEqual({ percent: 100, amount: b.dueNow });

    const res = (await cancel(deps, b.id, { note: "guest asked" })) as Response;
    expect(await res.json()).toEqual({ cancelled: true, refund: b.dueNow, policy: { percent: 100, amount: b.dueNow } });
    expect(deps.payments.refunds).toEqual([{ paymentIntentId: `pi_dep_${b.id}`, amount: b.dueNow, key: `cancel-${b.id}-pi_dep_${b.id}` }]);
    expect(await getBooking(env.DB, b.id)).toMatchObject({ status: "cancelled", refunded_amount: b.dueNow, status_note: "cancelled by dev@localhost: guest asked" });
    expect(deps.sent.map((e) => e.subject)).toEqual(["Your stay at The Nest Retreat has been cancelled"]);

    const avail = await ((await call(deps, `/api/availability?property=${property.id}&from=2027-01-08&to=2027-01-11`)) as Response).json<{ nights: { available: boolean }[] }>();
    expect(avail.nights.every((n) => n.available)).toBe(true);
    expect(await cancel(deps, b.id)).toMatchObject({ status: 409, code: "not_confirmed" });
  });

  it("applies the 50% tier, and refunds the balance payment before the deposit", async () => {
    const deps = testDeps({ now: NOW });
    const b = await confirmedBooking(deps);
    deps.setNow("2026-12-09T17:00:00Z");
    await runCron(CRONS.balances, env, deps); // balance paid
    deps.setNow("2026-12-20T18:00:00Z"); // 19 days before arrival: 50%
    const res = (await cancel(deps, b.id)) as Response;
    const half = Math.round(b.total / 2);
    expect(await res.json()).toMatchObject({ refund: half, policy: { percent: 50 } });
    const fromBalance = Math.min(half, b.balance);
    expect(deps.payments.refunds.map((r) => [r.paymentIntentId, r.amount])).toEqual(
      [[`pi_balance-${b.id}`, fromBalance], [`pi_dep_${b.id}`, half - fromBalance]].filter(([, a]) => (a as number) > 0),
    );
  });

  it("lets the host override the refund, never above what was paid", async () => {
    const deps = testDeps({ now: NOW });
    const b = await confirmedBooking(deps);
    deps.setNow("2027-01-07T18:00:00Z"); // 0% tier
    expect(await cancel(deps, b.id, { refundAmount: b.dueNow + 1 })).toMatchObject({ status: 400, code: "refund_too_large" });
    const res = (await cancel(deps, b.id, { refundAmount: 5000 })) as Response;
    expect(await res.json()).toMatchObject({ refund: 5000, policy: { percent: 0, amount: 0 } });
  });
});

describe("manual blocks and sync (admin)", () => {
  it("blocks dates for guests and the export feed, and unblocks them", async () => {
    const deps = testDeps({ now: NOW });
    await refreshRates(env.DB, property, site.currency, fixturePriceSource, deps);
    const add = (await call(deps, "/api/admin/blocks", { method: "POST", body: JSON.stringify({ property: property.id, start: "2026-12-24", end: "2026-12-26", note: "family" }) })) as Response;
    expect(add.status).toBe(201);
    const { id } = await add.json<{ id: number }>();
    const quote = { method: "POST", body: JSON.stringify({ property: property.id, checkIn: "2026-12-23", checkOut: "2026-12-26", guests: 2 }) };
    expect(await call(deps, "/api/quote", quote)).toMatchObject({ status: 422, code: "unavailable" });
    expect(((await call(deps, `/api/admin/blocks/${id}`, { method: "DELETE" })) as Response).status).toBe(200);
    expect(((await call(deps, "/api/quote", quote)) as Response).status).toBe(200);
    expect(await call(deps, "/api/admin/blocks", { method: "POST", body: JSON.stringify({ property: property.id, start: "2026-12-26", end: "2026-12-24" }) })).toMatchObject({ status: 400 });
  });

  it("syncs calendars and rates on demand and lists the runs", async () => {
    const deps = testDeps({ now: NOW });
    const res = (await call(deps, "/api/admin/sync", { method: "POST" })) as Response;
    const body = await res.json<{ results: { rates: { ok: boolean; stored: number } }[] }>();
    expect(body.results[0]!.rates).toMatchObject({ ok: true, stored: 365 });
    const runs = await ((await call(deps, "/api/admin/sync-runs")) as Response).json<{ runs: { kind: string }[] }>();
    expect(runs.runs.map((r) => r.kind).sort()).toEqual(["ical_import", "price_fetch"]);
  });
});

describe("Cloudflare Access", () => {
  const TEAM = "nest.cloudflareaccess.com";
  const AUD = "aud-tag-123";
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  async function keys() {
    const pair = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
    return { pair, jwk: { ...jwk, kid: "k1", alg: "RS256" } };
  }

  async function jwt(pair: CryptoKeyPair, payload: object, kid = "k1") {
    const head = `${enc({ alg: "RS256", kid })}.${enc(payload)}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(head));
    return `${head}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  }

  it("accepts a valid Access JWT and rejects tampered, expired, wrong-audience or missing ones", async () => {
    clearAccessCache();
    const { pair, jwk } = await keys();
    const certs = () => Response.json({ keys: [jwk] });
    const deps = testDeps({ now: NOW, responses: { [`https://${TEAM}/cdn-cgi/access/certs`]: certs } });
    const e = { ...env, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, SITE_ORIGIN: "https://thenest.example" };
    const now = Date.parse(NOW) / 1000;
    const good = { aud: [AUD], iss: `https://${TEAM}`, exp: now + 600, iat: now, email: "allie@example.com" };
    const req = (token?: string) => new Request("http://api.test/api/admin/bookings", { headers: token ? { "cf-access-jwt-assertion": token } : {} });
    const check = (token?: string) => requireAdmin(req(token), e, deps.fetch, new Date(NOW));

    expect(await check(await jwt(pair, good))).toBe("allie@example.com");
    for (const bad of [
      undefined,
      "not.a.jwt",
      await jwt(pair, { ...good, aud: ["other"] }),
      await jwt(pair, { ...good, exp: now - 1 }),
      await jwt(pair, { ...good, iss: "https://evil.cloudflareaccess.com" }),
      await jwt(pair, good, "unknown-kid"),
      (await jwt(pair, good)).replace(/\.[^.]+$/, ".AAAA"),
    ]) {
      await expect(check(bad)).rejects.toMatchObject({ status: 403 });
    }
    // A different signer with the same kid fails the signature check.
    const other = await keys();
    await expect(check(await jwt(other.pair, good))).rejects.toMatchObject({ status: 403 });
  });

  it("allows admin routes without Access only for a localhost site", async () => {
    const deps = testDeps({ now: NOW });
    expect(await requireAdmin(new Request("http://x"), env, deps.fetch, new Date(NOW))).toBe("dev@localhost");
    await expect(requireAdmin(new Request("http://x"), { ...env, SITE_ORIGIN: "https://thenest.example" }, deps.fetch, new Date(NOW))).rejects.toMatchObject({ status: 403 });
  });
});
