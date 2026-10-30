import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIcal, parseIcal } from "./ical";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/ical/${name}`, import.meta.url), "utf8");
const TZ = "America/Los_Angeles";

describe("parseIcal: channel fixtures", () => {
  it("reads Airbnb reservations and blocks as all-day ranges with exclusive end", () => {
    const { events, skipped } = parseIcal(fixture("airbnb.ics"), TZ);
    expect(skipped).toEqual([]);
    expect(events.map((e) => [e.start, e.end, e.summary])).toEqual([
      ["2026-11-20", "2026-11-23", "Reserved"],
      ["2026-11-23", "2026-11-26", "Reserved"], // back-to-back with the stay before
      ["2026-12-01", "2026-12-05", "Airbnb (Not available)"],
      ["2027-06-01", "2027-11-01", "Airbnb (Not available)"],
    ]);
    expect(events[0]!.uid).toMatch(/@airbnb\.com$/);
  });

  it("reads VRBO and skips cancelled events", () => {
    const { events, skipped } = parseIcal(fixture("vrbo.ics"), TZ);
    expect(events.map((e) => [e.start, e.end])).toEqual([
      ["2026-12-10", "2026-12-14"],
      ["2026-12-24", "2026-12-27"],
    ]);
    expect(skipped).toEqual([{ uid: "b8e8c3a0-0000-4000-8000-000000000003", reason: "cancelled" }]);
  });
});

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
const event = (lines: string[]) => `BEGIN:VEVENT\r\n${lines.join("\r\n")}\r\nEND:VEVENT\r\n`;

describe("parseIcal: edge cases", () => {
  it("unfolds long lines and handles LF-only feeds and parameters", () => {
    const text = wrap(event(["UID:abc", "DTSTART;VALUE=DATE:20261120", "DTEND;VALUE=DATE:20261122", "SUMMARY:Long", " er title\\, with comma"])).replace(/\r\n/g, "\n");
    expect(parseIcal(text, TZ).events).toEqual([{ uid: "abc", start: "2026-11-20", end: "2026-11-22", summary: "Longer title, with comma" }]);
  });

  it("treats an all-day event without DTEND as one night", () => {
    const { events } = parseIcal(wrap(event(["UID:one", "DTSTART;VALUE=DATE:20261231"])), TZ);
    expect(events).toEqual([{ uid: "one", start: "2026-12-31", end: "2027-01-01" }]);
  });

  it("maps UTC times to the property's local dates", () => {
    // 2026-11-21T02:00Z is the evening of the 20th in Seattle; check-out 19:00Z on the 23rd is 11:00 local.
    const { events } = parseIcal(wrap(event(["UID:utc", "DTSTART:20261121T020000Z", "DTEND:20261123T190000Z"])), TZ);
    expect(events).toEqual([{ uid: "utc", start: "2026-11-20", end: "2026-11-23" }]);
    // The same instants in Calgary
    expect(parseIcal(wrap(event(["UID:utc", "DTSTART:20261121T020000Z", "DTEND:20261123T190000Z"])), "America/Edmonton").events[0]!.start).toBe("2026-11-20");
  });

  it("keeps the written date for TZID and floating times", () => {
    const { events } = parseIcal(wrap(event(["UID:tz", "DTSTART;TZID=America/Los_Angeles:20261120T160000", "DTEND;TZID=America/Los_Angeles:20261122T110000"])), TZ);
    expect(events).toEqual([{ uid: "tz", start: "2026-11-20", end: "2026-11-22" }]);
  });

  it("handles stays across the DST change", () => {
    const { events } = parseIcal(wrap(event(["UID:dst", "DTSTART;VALUE=DATE:20261031", "DTEND;VALUE=DATE:20261102"])), TZ);
    expect(events[0]).toMatchObject({ start: "2026-10-31", end: "2026-11-02" });
  });

  it("skips events with no nights or unreadable dates instead of guessing", () => {
    const { events, skipped } = parseIcal(
      wrap(
        event(["UID:same", "DTSTART:20261120T090000Z", "DTEND:20261120T170000Z"]) +
          event(["UID:bad", "DTSTART;VALUE=DATE:20261340", "DTEND;VALUE=DATE:20261342"]) +
          event(["UID:back", "DTSTART;VALUE=DATE:20261125", "DTEND;VALUE=DATE:20261120"]),
      ),
      TZ,
    );
    expect(events).toEqual([]);
    expect(skipped.map((s) => s.uid)).toEqual(["same", "bad", "back"]);
  });

  it("ignores text outside events and an empty calendar", () => {
    expect(parseIcal("", TZ)).toEqual({ events: [], skipped: [] });
    expect(parseIcal(wrap("X-WR-CALNAME:Test\r\n"), TZ).events).toEqual([]);
  });
});

describe("buildIcal", () => {
  const now = new Date("2026-10-29T18:00:00.123Z");

  it("writes all-day events that parse back to the same ranges", () => {
    const text = buildIcal({
      prodId: "-//Direct Booking//nest-retreat//EN",
      name: "The Nest Retreat",
      now,
      events: [
        { uid: "booking-1@nest-retreat", start: "2026-11-20", end: "2026-11-23", summary: "Reserved" },
        { uid: "block-2@nest-retreat", start: "2026-12-24", end: "2026-12-26", summary: "Blocked; owner, family" },
      ],
    });
    expect(text).toContain("DTSTART;VALUE=DATE:20261120\r\n");
    expect(text).toContain("DTSTAMP:20261029T180000Z\r\n");
    expect(text).toContain("SUMMARY:Blocked\\; owner\\, family\r\n");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(parseIcal(text, TZ).events.map((e) => [e.uid, e.start, e.end])).toEqual([
      ["booking-1@nest-retreat", "2026-11-20", "2026-11-23"],
      ["block-2@nest-retreat", "2026-12-24", "2026-12-26"],
    ]);
  });

  it("folds lines at 75 octets without splitting characters", () => {
    const name = "Ä".repeat(60);
    const text = buildIcal({ prodId: "x", name, now, events: [] });
    for (const line of text.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(text).not.toContain("�");
    expect(text.replace(/\r\n /g, "")).toContain(`X-WR-CALNAME:${name}`);
  });
});
