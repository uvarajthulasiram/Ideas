// Nightly rates and minimum stays (PLAN.md, "Prices").
//
// A PriceSource returns rates for a listing; refreshRates() stores 365 days of
// them in nightly_rates once a day. If a fetch fails the stored rates stay as
// they were and the failure is logged; a night without a stored rate can't be booked.

import { addDays, todayIn, toMinor, type IsoDate, type PropertyConfig } from "@direct-booking/core";
import { unix } from "./calendars";
import type { Deps } from "./deps";

export interface FetchedRate {
  date: IsoDate;
  /** Major units as the source sends them (e.g. 189.00 dollars). */
  price: number;
  minStay: number | null;
}

export interface PriceSource {
  readonly name: string;
  fetchRates(property: PropertyConfig, from: IsoDate, to: IsoDate): Promise<FetchedRate[]>;
}

export const RATE_DAYS = 365;

/**
 * Deterministic made-up rates for development and tests (PRICE_SOURCE=fixture).
 * Never used in production: realPriceSource() refuses it without the dev flag.
 */
export const fixturePriceSource: PriceSource = {
  name: "fixture",
  async fetchRates(_property, from, to) {
    const rates: FetchedRate[] = [];
    for (let date = from; date < to; date = addDays(date, 1)) {
      const d = new Date(`${date}T00:00:00Z`);
      const weekend = d.getUTCDay() === 5 || d.getUTCDay() === 6;
      const summer = d.getUTCMonth() >= 5 && d.getUTCMonth() <= 8;
      const holiday = date.slice(5) >= "12-20" || date.slice(5) <= "01-02";
      const price = (weekend ? 229 : 189) * (summer ? 1.2 : 1) * (holiday ? 1.15 : 1);
      rates.push({ date, price: Math.round(price * 100) / 100, minStay: summer || holiday ? 3 : null });
    }
    return rates;
  },
};

/**
 * TODO(host): the PriceLabs client. PLAN.md: ask Uvaraj for the endpoint and
 * auth details from his other project rather than guessing them. Until then this
 * source fails every fetch, so production serves no rates and takes no bookings.
 */
export const pricelabsPriceSource = (apiKey: string | undefined): PriceSource => ({
  name: "pricelabs",
  async fetchRates() {
    if (!apiKey) throw new Error("PRICELABS_API_KEY is not set");
    throw new Error("PriceLabs client not implemented yet: endpoint details needed (TODO(host))");
  },
});

export interface RefreshResult {
  runId: number;
  ok: boolean;
  stored: number;
  error?: string;
}

export async function refreshRates(db: D1Database, property: PropertyConfig, currency: string, source: PriceSource, deps: Deps): Promise<RefreshResult> {
  const now = deps.now();
  const run = await db
    .prepare("INSERT INTO sync_runs (kind, property_id, started_at) VALUES ('price_fetch', ?, ?) RETURNING id")
    .bind(property.id, unix(now))
    .first<{ id: number }>();
  const runId = run!.id;
  const from = todayIn(property.timezone, now);
  const to = addDays(from, RATE_DAYS);

  try {
    if (source.name !== "fixture" && !property.pricelabsListingId) throw new Error("No PriceLabs listing id in site config");
    const rates = (await source.fetchRates(property, from, to)).filter((r) => r.date >= from && r.date < to);
    for (const r of rates) {
      if (!(r.price >= 0) || !Number.isFinite(r.price)) throw new Error(`Bad price for ${r.date}: ${r.price}`);
      if (r.minStay !== null && !(Number.isInteger(r.minStay) && r.minStay >= 1)) throw new Error(`Bad min stay for ${r.date}: ${r.minStay}`);
    }
    const fetchedAt = unix(deps.now());
    const statements = rates.map((r) =>
      db
        .prepare(
          `INSERT INTO nightly_rates (property_id, date, price, min_stay, fetched_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (property_id, date) DO UPDATE SET price = excluded.price, min_stay = excluded.min_stay, fetched_at = excluded.fetched_at`,
        )
        .bind(property.id, r.date, toMinor(r.price, currency), r.minStay, fetchedAt),
    );
    // Past nights are no longer needed.
    statements.push(db.prepare("DELETE FROM nightly_rates WHERE property_id = ? AND date < ?").bind(property.id, from));
    await db.batch(statements);
    await finish(db, runId, deps, true, null, { stored: rates.length, source: source.name });
    return { runId, ok: true, stored: rates.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish(db, runId, deps, false, message, { stored: 0, source: source.name });
    return { runId, ok: false, stored: 0, error: message };
  }
}

async function finish(db: D1Database, runId: number, deps: Deps, ok: boolean, error: string | null, counts: object) {
  await db
    .prepare("UPDATE sync_runs SET finished_at = ?, ok = ?, error = ?, counts = ? WHERE id = ?")
    .bind(unix(deps.now()), ok ? 1 : 0, error, JSON.stringify(counts), runId)
    .run();
}
