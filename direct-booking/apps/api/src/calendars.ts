// Calendar sync with Airbnb, VRBO and other channels (PLAN.md, "Calendars").
//
// Import: each channel's feed replaces that channel's rows in blocked_dates.
// A channel whose feed fails keeps its previous rows, so an outage never opens dates.
// Export: confirmed direct bookings, live holds and manual blocks only. Imported
// blocks are never re-exported, which would bounce them between channels.

import { buildIcal, parseIcal, todayIn, type PropertyConfig } from "@direct-booking/core";
import type { Deps } from "./deps";
import { hmac } from "./http";

const MAX_FEED_BYTES = 2_000_000;

export interface ChannelResult {
  channel: string;
  ok: boolean;
  events?: number;
  skipped?: number;
  removed?: number;
  error?: string;
}

export interface ImportResult {
  runId: number;
  ok: boolean;
  channels: ChannelResult[];
}

export async function importCalendars(db: D1Database, property: PropertyConfig, deps: Deps): Promise<ImportResult> {
  const now = deps.now();
  const startedAt = unix(now);
  const run = await db
    .prepare("INSERT INTO sync_runs (kind, property_id, started_at) VALUES ('ical_import', ?, ?) RETURNING id")
    .bind(property.id, startedAt)
    .first<{ id: number }>();
  const runId = run!.id;
  const today = todayIn(property.timezone, now);
  const channels: ChannelResult[] = [];

  for (const feed of property.icalImports) {
    try {
      const text = await fetchFeed(deps, feed.url);
      const { events, skipped } = parseIcal(text, property.timezone);
      const current = events.filter((e) => e.end > today);
      const statements = current.map((e) =>
        db
          .prepare(
            `INSERT INTO blocked_dates (property_id, channel, event_uid, start_date, end_date, last_seen_run)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (property_id, channel, event_uid)
             DO UPDATE SET start_date = excluded.start_date, end_date = excluded.end_date, last_seen_run = excluded.last_seen_run`,
          )
          .bind(property.id, feed.channel, e.uid, e.start, e.end, runId),
      );
      statements.push(
        db.prepare("DELETE FROM blocked_dates WHERE property_id = ? AND channel = ? AND last_seen_run <> ?").bind(property.id, feed.channel, runId),
      );
      const results = await db.batch(statements);
      channels.push({ channel: feed.channel, ok: true, events: current.length, skipped: skipped.length, removed: results.at(-1)!.meta.changes });
    } catch (error) {
      channels.push({ channel: feed.channel, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Channels removed from the config no longer block anything.
  const configured = property.icalImports.map((f) => f.channel);
  await db
    .prepare(`DELETE FROM blocked_dates WHERE property_id = ? AND channel NOT IN (SELECT value FROM json_each(?))`)
    .bind(property.id, JSON.stringify(configured))
    .run();

  const ok = channels.every((c) => c.ok);
  const errors = channels.filter((c) => !c.ok).map((c) => `${c.channel}: ${c.error}`);
  await db
    .prepare("UPDATE sync_runs SET finished_at = ?, ok = ?, error = ?, counts = ? WHERE id = ?")
    .bind(unix(deps.now()), ok ? 1 : 0, errors.length ? errors.join("; ") : null, JSON.stringify(channels), runId)
    .run();
  return { runId, ok, channels };
}

async function fetchFeed(deps: Deps, url: string): Promise<string> {
  const res = await deps.fetch(url, { headers: { accept: "text/calendar" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new Error("feed too large");
  // An error page or empty body must not wipe the channel's blocks.
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("not an iCalendar feed");
  return text;
}

/** Holds whose Checkout Session has expired free their dates. */
export async function expireHolds(db: D1Database, now: Date): Promise<number> {
  const result = await db
    .prepare("UPDATE bookings SET status = 'expired', updated_at = ? WHERE status = 'hold' AND hold_expires_at <= ?")
    .bind(unix(now), unix(now))
    .run();
  return result.meta.changes;
}

/** Each property's export URL carries its own token, derived from one secret. */
export function exportToken(secret: string, propertyId: string): Promise<string> {
  return hmac(secret, `ical-export:${propertyId}`).then((t) => t.slice(0, 32));
}

export async function exportCalendar(db: D1Database, siteId: string, property: PropertyConfig, now: Date): Promise<string> {
  const today = todayIn(property.timezone, now);
  const bookings = await db
    .prepare(
      `SELECT id, check_in, check_out, status FROM bookings
       WHERE property_id = ? AND check_out > ? AND (status = 'confirmed' OR (status = 'hold' AND hold_expires_at > ?))
       ORDER BY check_in`,
    )
    .bind(property.id, today, unix(now))
    .all<{ id: string; check_in: string; check_out: string; status: string }>();
  const blocks = await db
    .prepare("SELECT id, start_date, end_date FROM manual_blocks WHERE property_id = ? AND end_date > ? ORDER BY start_date")
    .bind(property.id, today)
    .all<{ id: number; start_date: string; end_date: string }>();

  return buildIcal({
    prodId: `-//Direct Booking//${siteId}//EN`,
    name: property.name,
    now,
    events: [
      ...bookings.results.map((b) => ({ uid: `booking-${b.id}@${siteId}`, start: b.check_in, end: b.check_out, summary: "Reserved" })),
      ...blocks.results.map((b) => ({ uid: `block-${b.id}@${siteId}`, start: b.start_date, end: b.end_date, summary: "Not available" })),
    ],
  });
}

export function unix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
