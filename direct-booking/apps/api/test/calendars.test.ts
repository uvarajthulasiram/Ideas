import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { parseIcal, type PropertyConfig } from "@direct-booking/core";
import airbnb from "@direct-booking/core/fixtures/ical/airbnb.ics?raw";
import vrbo from "@direct-booking/core/fixtures/ical/vrbo.ics?raw";
import { site } from "@direct-booking/sites/selected";
import { expireHolds, exportToken, importCalendars } from "../src/calendars";
import { handle } from "../src/index";
import { ics, testDeps } from "./helpers";

const AIRBNB = "https://feeds.test/airbnb.ics";
const VRBO = "https://feeds.test/vrbo.ics";
const property: PropertyConfig = {
  ...site.properties[0]!,
  icalImports: [
    { channel: "airbnb", url: AIRBNB },
    { channel: "vrbo", url: VRBO },
  ],
};

async function blocked(channel?: string) {
  const { results } = await env.DB.prepare(
    `SELECT channel, start_date, end_date FROM blocked_dates WHERE property_id = ? ${channel ? "AND channel = ?" : ""} ORDER BY start_date`,
  )
    .bind(...(channel ? [property.id, channel] : [property.id]))
    .all<{ channel: string; start_date: string; end_date: string }>();
  return results.map((r) => `${r.channel} ${r.start_date}..${r.end_date}`);
}

describe("importCalendars", () => {
  it("imports every channel and records the run", async () => {
    const deps = testDeps({ responses: { [AIRBNB]: ics(airbnb), [VRBO]: ics(vrbo) } });
    const result = await importCalendars(env.DB, property, deps);

    expect(result.ok).toBe(true);
    expect(result.channels).toEqual([
      { channel: "airbnb", ok: true, events: 4, skipped: 0, removed: 0 },
      { channel: "vrbo", ok: true, events: 2, skipped: 1, removed: 0 },
    ]);
    expect(await blocked()).toEqual([
      "airbnb 2026-11-20..2026-11-23",
      "airbnb 2026-11-23..2026-11-26",
      "airbnb 2026-12-01..2026-12-05",
      "vrbo 2026-12-10..2026-12-14",
      "vrbo 2026-12-24..2026-12-27",
      "airbnb 2027-06-01..2027-11-01",
    ]);
    const run = await env.DB.prepare("SELECT kind, ok, error, finished_at FROM sync_runs WHERE id = ?").bind(result.runId).first();
    expect(run).toMatchObject({ kind: "ical_import", ok: 1, error: null });
    expect(run!.finished_at).toBeTypeOf("number");
  });

  it("removes events gone from the feed and updates moved ones", async () => {
    await importCalendars(env.DB, property, testDeps({ responses: { [AIRBNB]: ics(airbnb), [VRBO]: ics(vrbo) } }));

    // The first Airbnb stay is cancelled and the second moves a day later.
    const changed = airbnb
      .replace(/BEGIN:VEVENT\r\nDTEND;VALUE=DATE:20261123[\s\S]*?END:VEVENT\r\n/, "")
      .replace("DTEND;VALUE=DATE:20261126\r\nDTSTART;VALUE=DATE:20261123", "DTEND;VALUE=DATE:20261127\r\nDTSTART;VALUE=DATE:20261124");
    expect(parseIcal(changed, property.timezone).events).toHaveLength(3);

    const result = await importCalendars(env.DB, property, testDeps({ responses: { [AIRBNB]: ics(changed), [VRBO]: ics(vrbo) } }));
    expect(result.channels[0]).toMatchObject({ ok: true, events: 3, removed: 1 });
    expect(await blocked("airbnb")).toEqual(["airbnb 2026-11-24..2026-11-27", "airbnb 2026-12-01..2026-12-05", "airbnb 2027-06-01..2027-11-01"]);
  });

  it("keeps a channel's blocks when its feed fails, and logs the failure", async () => {
    await importCalendars(env.DB, property, testDeps({ responses: { [AIRBNB]: ics(airbnb), [VRBO]: ics(vrbo) } }));

    for (const bad of [new Response("Service unavailable", { status: 503 }), new Response("<html>Sign in</html>"), new Response("")]) {
      const result = await importCalendars(env.DB, property, testDeps({ responses: { [AIRBNB]: bad, [VRBO]: ics(vrbo) } }));
      expect(result.ok).toBe(false);
      expect(result.channels[0]!.ok).toBe(false);
      expect(await blocked("airbnb")).toHaveLength(4);
      const run = await env.DB.prepare("SELECT ok, error FROM sync_runs WHERE id = ?").bind(result.runId).first<{ ok: number; error: string }>();
      expect(run!.ok).toBe(0);
      expect(run!.error).toMatch(/^airbnb: /);
    }
  });

  it("drops past events and channels removed from the config", async () => {
    await importCalendars(env.DB, property, testDeps({ responses: { [AIRBNB]: ics(airbnb), [VRBO]: ics(vrbo) } }));

    const later = testDeps({ now: "2026-12-06T20:00:00Z", responses: { [AIRBNB]: ics(airbnb) } });
    await importCalendars(env.DB, { ...property, icalImports: [{ channel: "airbnb", url: AIRBNB }] }, later);
    expect(await blocked()).toEqual(["airbnb 2027-06-01..2027-11-01"]);
  });

  it("treats a valid empty calendar as no blocks", async () => {
    await importCalendars(env.DB, property, testDeps({ responses: { [AIRBNB]: ics(airbnb), [VRBO]: ics(vrbo) } }));
    const empty = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
    await importCalendars(env.DB, property, testDeps({ responses: { [AIRBNB]: ics(empty), [VRBO]: ics(vrbo) } }));
    expect(await blocked("airbnb")).toEqual([]);
  });
});

async function insertBooking(id: string, checkIn: string, checkOut: string, status: string, holdExpiresAt: number | null = null) {
  await env.DB.prepare(
    `INSERT INTO bookings (id, view_token, property_id, check_in, check_out, guests, status, hold_expires_at,
       guest_name, guest_email, quote, currency, created_at, updated_at)
     VALUES (?, 't', ?, ?, ?, 2, ?, ?, 'Guest', 'g@example.com', '{}', 'USD', 0, 0)`,
  )
    .bind(id, property.id, checkIn, checkOut, status, holdExpiresAt)
    .run();
}

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("expireHolds", () => {
  it("expires only holds past their expiry", async () => {
    await insertBooking("old", "2026-11-20", "2026-11-22", "hold", at("2026-11-01T17:59:00Z"));
    await insertBooking("live", "2026-11-24", "2026-11-26", "hold", at("2026-11-01T18:20:00Z"));
    await insertBooking("done", "2026-11-28", "2026-11-30", "confirmed");
    expect(await expireHolds(env.DB, new Date("2026-11-01T18:00:00Z"))).toBe(1);
    const { results } = await env.DB.prepare("SELECT id, status FROM bookings ORDER BY id").all();
    expect(results).toEqual([
      { id: "done", status: "confirmed" },
      { id: "live", status: "hold" },
      { id: "old", status: "expired" },
    ]);
  });
});

describe("GET /ical/<property>/<token>.ics", () => {
  const deps = testDeps({ now: "2026-11-01T18:00:00Z" });
  const get = async (path: string) => handle(new Request(`http://api.test${path}`), env, deps).catch((e) => e);

  it("exports confirmed bookings, live holds and manual blocks, never imported blocks", async () => {
    await importCalendars(env.DB, property, testDeps({ responses: { [AIRBNB]: ics(airbnb), [VRBO]: ics(vrbo) } }));
    await insertBooking("confirmed1", "2026-11-10", "2026-11-12", "confirmed");
    await insertBooking("hold-live", "2026-11-14", "2026-11-16", "hold", at("2026-11-01T18:20:00Z"));
    await insertBooking("hold-old", "2026-11-17", "2026-11-19", "hold", at("2026-11-01T17:00:00Z"));
    await insertBooking("cancelled", "2026-11-27", "2026-11-29", "cancelled");
    await insertBooking("past", "2026-10-01", "2026-10-03", "confirmed");
    await env.DB.prepare("INSERT INTO manual_blocks (property_id, start_date, end_date, note, created_at) VALUES (?, '2026-12-20', '2026-12-22', 'family', 0)")
      .bind(property.id)
      .run();

    const token = await exportToken(env.ICAL_EXPORT_TOKEN, property.id);
    const res = (await get(`/ical/${property.id}/${token}.ics`)) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const events = parseIcal(await res.text(), property.timezone).events;
    expect(events.map((e) => [e.uid, e.start, e.end, e.summary])).toEqual([
      ["booking-confirmed1@nest-retreat", "2026-11-10", "2026-11-12", "Reserved"],
      ["booking-hold-live@nest-retreat", "2026-11-14", "2026-11-16", "Reserved"],
      ["block-1@nest-retreat", "2026-12-20", "2026-12-22", "Not available"],
    ]);
  });

  it("hides the feed behind a per-property token", async () => {
    const token = await exportToken(env.ICAL_EXPORT_TOKEN, property.id);
    expect(token).toHaveLength(32);
    expect(await exportToken("another-secret", property.id)).not.toBe(token);
    for (const path of [`/ical/${property.id}/wrong.ics`, `/ical/other/${token}.ics`, `/ical/${property.id}/${token}x.ics`]) {
      expect((await get(path)).status).toBe(404);
    }
  });

  it("is reachable through the Worker's fetch handler", async () => {
    const token = await exportToken(env.ICAL_EXPORT_TOKEN, property.id);
    const res = await exports.default.fetch(`http://api.test/ical/${property.id}/${token}.ics`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect((await exports.default.fetch(`http://api.test/ical/${property.id}/nope.ics`)).status).toBe(404);
  });
});
