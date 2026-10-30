// Which nights are taken, and the rates for a date range, read from D1.

import { daysBetween, eachNight, isIsoDate, quoteStay, todayIn, type IsoDate, type NightRate, type PropertyConfig, type QuoteResult, type SiteConfig, type StayRequest } from "@direct-booking/core";
import { unix } from "./calendars";
import { HttpError } from "./http";

export const MAX_RANGE_DAYS = 400;

/** Nights in [from, to) blocked by imported calendars, direct bookings, live holds or the host. */
export async function takenNights(db: D1Database, propertyId: string, from: IsoDate, to: IsoDate, now: Date, excludeBookingId?: string): Promise<Set<IsoDate>> {
  const nowUnix = unix(now);
  const { results } = await db
    .prepare(
      `SELECT start_date AS s, end_date AS e FROM blocked_dates WHERE property_id = ?1 AND start_date < ?3 AND end_date > ?2
       UNION ALL
       SELECT check_in, check_out FROM bookings
         WHERE property_id = ?1 AND check_in < ?3 AND check_out > ?2 AND id IS NOT ?5
           AND (status = 'confirmed' OR (status = 'hold' AND hold_expires_at > ?4))
       UNION ALL
       SELECT start_date, end_date FROM manual_blocks WHERE property_id = ?1 AND start_date < ?3 AND end_date > ?2`,
    )
    .bind(propertyId, from, to, nowUnix, excludeBookingId ?? null)
    .all<{ s: string; e: string }>();

  const taken = new Set<IsoDate>();
  for (const r of results) {
    const start = r.s > from ? r.s : from;
    const end = r.e < to ? r.e : to;
    for (const night of eachNight(start, end)) taken.add(night);
  }
  return taken;
}

export async function ratesFor(db: D1Database, propertyId: string, from: IsoDate, to: IsoDate): Promise<Map<IsoDate, NightRate>> {
  const { results } = await db
    .prepare("SELECT date, price, min_stay FROM nightly_rates WHERE property_id = ? AND date >= ? AND date < ?")
    .bind(propertyId, from, to)
    .all<{ date: string; price: number; min_stay: number | null }>();
  return new Map(results.map((r) => [r.date, { price: r.price, minStay: r.min_stay }]));
}

export function parseRange(fromParam: string | null, toParam: string | null): { from: IsoDate; to: IsoDate } {
  if (!fromParam || !toParam || !isIsoDate(fromParam) || !isIsoDate(toParam) || toParam <= fromParam) {
    throw new HttpError(400, "bad_range", "Give from and to as YYYY-MM-DD, with to after from.");
  }
  if (daysBetween(fromParam, toParam) > MAX_RANGE_DAYS) throw new HttpError(400, "bad_range", `Ask for at most ${MAX_RANGE_DAYS} days at a time.`);
  return { from: fromParam, to: toParam };
}

export interface NightInfo {
  date: IsoDate;
  /** Can a stay include this night? */
  available: boolean;
  /** Minimum nights when arriving on this date. */
  minStay: number;
}

export async function availability(db: D1Database, property: PropertyConfig, from: IsoDate, to: IsoDate, now: Date): Promise<NightInfo[]> {
  const today = todayIn(property.timezone, now);
  const [taken, rates] = await Promise.all([takenNights(db, property.id, from, to, now), ratesFor(db, property.id, from, to)]);
  return eachNight(from, to).map((date) => ({
    date,
    available: date > today && !taken.has(date) && rates.has(date),
    minStay: rates.get(date)?.minStay ?? property.minNights,
  }));
}

/** Quote a stay against the current state of D1. */
export async function quoteFromDb(db: D1Database, site: SiteConfig, property: PropertyConfig, request: StayRequest, now: Date, excludeBookingId?: string): Promise<QuoteResult> {
  const today = todayIn(property.timezone, now);
  const valid = isIsoDate(request.checkIn) && isIsoDate(request.checkOut) && request.checkOut > request.checkIn;
  const [unavailable, rates] = valid
    ? await Promise.all([
        takenNights(db, property.id, request.checkIn, request.checkOut, now, excludeBookingId),
        ratesFor(db, property.id, request.checkIn, request.checkOut),
      ])
    : [new Set<IsoDate>(), new Map<IsoDate, NightRate>()];
  return quoteStay(request, { site, property, rates, unavailable, today });
}
