import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { site } from "@direct-booking/sites/selected";
import { handle, runCron, CRONS } from "../src/index";
import { fixturePriceSource, pricelabsPriceSource, refreshRates, type PriceSource } from "../src/prices";
import { testDeps } from "./helpers";

const property = site.properties[0]!;
const NOW = "2026-11-01T18:00:00Z"; // 11:00 on 2026-11-01 in Seattle

async function seedRates(deps = testDeps({ now: NOW })) {
  const result = await refreshRates(env.DB, property, site.currency, fixturePriceSource, deps);
  expect(result.ok).toBe(true);
  return result;
}

const call = (deps: ReturnType<typeof testDeps>, path: string, init?: RequestInit) =>
  handle(new Request(`http://api.test${path}`, init), env, deps).catch((e: unknown) => e as { status: number; code: string; details?: unknown });

const postQuote = (deps: ReturnType<typeof testDeps>, body: unknown) =>
  call(deps, "/api/quote", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("refreshRates", () => {
  it("stores 365 days of rates in minor units, starting today in the property's timezone", async () => {
    const result = await seedRates();
    expect(result.stored).toBe(365);
    const first = await env.DB.prepare("SELECT date, price, min_stay FROM nightly_rates ORDER BY date LIMIT 1").first();
    expect(first).toEqual({ date: "2026-11-01", price: 18900, min_stay: null }); // a Sunday
    const fri = await env.DB.prepare("SELECT price FROM nightly_rates WHERE date = '2026-11-06'").first();
    expect(fri).toEqual({ price: 22900 });
    const run = await env.DB.prepare("SELECT kind, ok, counts FROM sync_runs WHERE id = ?").bind(result.runId).first();
    expect(run).toEqual({ kind: "price_fetch", ok: 1, counts: '{"stored":365,"source":"fixture"}' });
  });

  it("keeps the last stored rates when the source fails, and logs it", async () => {
    await seedRates();
    const broken: PriceSource = { name: "fixture", fetchRates: async () => Promise.reject(new Error("timeout")) };
    const result = await refreshRates(env.DB, property, site.currency, broken, testDeps({ now: NOW }));
    expect(result).toMatchObject({ ok: false, error: "timeout" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM nightly_rates").first()).toEqual({ n: 365 });
    expect(await env.DB.prepare("SELECT ok, error FROM sync_runs WHERE id = ?").bind(result.runId).first()).toEqual({ ok: 0, error: "timeout" });
  });

  it("rejects bad data as a whole instead of storing part of it", async () => {
    await seedRates();
    const bad: PriceSource = {
      name: "fixture",
      fetchRates: async () => [
        { date: "2026-11-02", price: 1, minStay: null },
        { date: "2026-11-03", price: Number.NaN, minStay: null },
      ],
    };
    const result = await refreshRates(env.DB, property, site.currency, bad, testDeps({ now: NOW }));
    expect(result.ok).toBe(false);
    expect(await env.DB.prepare("SELECT price FROM nightly_rates WHERE date = '2026-11-02'").first()).toEqual({ price: 18900 });
  });

  it("refuses PriceLabs until it is configured (TODO(host))", async () => {
    const result = await refreshRates(env.DB, property, site.currency, pricelabsPriceSource("key"), testDeps({ now: NOW }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/listing id|not implemented/);
  });

  it("drops past nights on the next fetch", async () => {
    await seedRates();
    await seedRates(testDeps({ now: "2026-11-05T18:00:00Z" }));
    const first = await env.DB.prepare("SELECT MIN(date) AS d FROM nightly_rates").first();
    expect(first).toEqual({ d: "2026-11-05" });
  });

  it("runs from the daily cron", async () => {
    await runCron(CRONS.prices, env, testDeps({ now: NOW }));
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM nightly_rates").first()).toEqual({ n: 365 });
  });
});

describe("GET /api/availability", () => {
  it("reports taken, unpriced and past nights, with each night's min stay", async () => {
    await seedRates();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO sync_runs (kind, property_id, started_at) VALUES ('ical_import', ?, 0)").bind(property.id),
      env.DB.prepare("INSERT INTO blocked_dates VALUES (?, 'airbnb', 'u1', '2026-11-10', '2026-11-12', 1)").bind(property.id),
      env.DB.prepare("INSERT INTO manual_blocks (property_id, start_date, end_date, created_at) VALUES (?, '2026-11-14', '2026-11-15', 0)").bind(property.id),
      env.DB.prepare("DELETE FROM nightly_rates WHERE date = '2026-11-17'"),
    ]);
    const res = (await call(testDeps({ now: NOW }), `/api/availability?property=${property.slug}&from=2026-10-31&to=2026-11-18`)) as Response;
    expect(res.status).toBe(200);
    const body = await res.json<{ property: string; nights: { date: string; available: boolean; minStay: number }[] }>();
    expect(body.property).toBe(property.id);
    const closed = body.nights.filter((n) => !n.available).map((n) => n.date);
    expect(closed).toEqual(["2026-10-31", "2026-11-01", "2026-11-10", "2026-11-11", "2026-11-14", "2026-11-17"]);
    expect(body.nights.every((n) => n.minStay === property.minNights)).toBe(true);
  });

  it("uses PriceLabs' min stay where it gives one", async () => {
    await seedRates();
    const res = (await call(testDeps({ now: NOW }), `/api/availability?property=${property.id}&from=2026-12-19&to=2026-12-21`)) as Response;
    const body = await res.json<{ nights: { minStay: number }[] }>();
    expect(body.nights.map((n) => n.minStay)).toEqual([property.minNights, 3]);
  });

  it("validates the request", async () => {
    const deps = testDeps({ now: NOW });
    expect(await call(deps, "/api/availability?property=nope&from=2026-11-01&to=2026-11-05")).toMatchObject({ status: 404, code: "unknown_property" });
    expect(await call(deps, `/api/availability?property=${property.id}&from=2026-11-05&to=2026-11-01`)).toMatchObject({ status: 400 });
    expect(await call(deps, `/api/availability?property=${property.id}&from=2026-11-01&to=2028-01-01`)).toMatchObject({ status: 400 });
  });
});

describe("POST /api/quote", () => {
  it("quotes from stored rates", async () => {
    await seedRates();
    const res = (await postQuote(testDeps({ now: NOW }), { property: property.id, checkIn: "2026-11-06", checkOut: "2026-11-09", guests: 2 })) as Response;
    expect(res.status).toBe(200);
    const { quote } = await res.json<{ quote: { total: number; nightly: { price: number }[]; currency: string } }>();
    expect(quote.nightly.map((n) => n.price)).toEqual([22900, 22900, 18900]);
    expect(quote.currency).toBe("USD");
    expect(quote.total).toBe(64700); // TODO(host) placeholders: no cleaning fee or tax yet
  });

  it("refuses nights held by another guest until the hold expires", async () => {
    await seedRates();
    await env.DB.prepare(
      `INSERT INTO bookings (id, view_token, property_id, check_in, check_out, guests, status, hold_expires_at, guest_name, guest_email, quote, currency, created_at, updated_at)
       VALUES ('h1', 't', ?, '2026-11-07', '2026-11-09', 2, 'hold', ?, 'G', 'g@example.com', '{}', 'USD', 0, 0)`,
    )
      .bind(property.id, Date.parse("2026-11-01T18:30:00Z") / 1000)
      .run();
    const body = { property: property.id, checkIn: "2026-11-06", checkOut: "2026-11-09", guests: 2 };
    expect(await postQuote(testDeps({ now: NOW }), body)).toMatchObject({ status: 422, code: "unavailable" });
    expect(((await postQuote(testDeps({ now: "2026-11-01T18:31:00Z" }), body)) as Response).status).toBe(200);
  });

  it("returns the reason when a stay can't be quoted", async () => {
    await seedRates();
    const deps = testDeps({ now: NOW });
    expect(await postQuote(deps, { property: property.id, checkIn: "2026-11-06", checkOut: "2026-11-07", guests: 2 })).toMatchObject({ status: 422, code: "min_stay" });
    expect(await postQuote(deps, { property: property.id, checkIn: "2026-11-06", checkOut: "2026-11-09", guests: 9 })).toMatchObject({ status: 422, code: "guests" });
    expect(await postQuote(deps, { property: property.id, checkIn: "2027-12-01", checkOut: "2027-12-04", guests: 2 })).toMatchObject({ status: 422, code: "no_rate" });
    expect(await postQuote(deps, { property: property.id, checkIn: "11/06/2026", guests: 2 })).toMatchObject({ status: 400, code: "invalid_request" });
  });

  it("answers the guest site with CORS in development, not other origins", async () => {
    await seedRates();
    const init = (origin: string) => ({
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ property: property.id, checkIn: "2027-01-12", checkOut: "2027-01-15", guests: 2 }),
    });
    const ok = await exports.default.fetch("http://api.test/api/quote", init("http://localhost:3000"));
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const other = await exports.default.fetch("http://api.test/api/quote", init("https://evil.test"));
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await exports.default.fetch("http://api.test/api/quote", { method: "OPTIONS", headers: { origin: "http://localhost:3000" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
