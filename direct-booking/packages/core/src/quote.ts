// The quote: the only place a stay's price is computed (PLAN.md, POST /api/quote).
//
// nights (from nightly rates) - direct discount + cleaning fee = taxable amount;
// each tax line is a percentage of that; total = taxable amount + taxes.
// Then the payment rule splits the total into what is charged now and later.
// Every amount is integer minor units; each percentage is rounded half up once.

import type { CancellationTier, PropertyConfig, SiteConfig } from "./config";
import { addDays, daysBetween, eachNight, isIsoDate, type IsoDate } from "./dates";
import { percentOf, type Minor } from "./money";

export interface NightRate {
  price: Minor;
  /** Minimum stay when arriving this night; null means use the property's fallback. */
  minStay: number | null;
}

export interface StayRequest {
  checkIn: IsoDate;
  checkOut: IsoDate;
  guests: number;
}

export interface QuoteContext {
  site: SiteConfig;
  property: PropertyConfig;
  /** Nightly rates by date; a night without one can't be booked. */
  rates: ReadonlyMap<IsoDate, NightRate>;
  /** Nights already taken (imported blocks, direct bookings, live holds, manual blocks). */
  unavailable: ReadonlySet<IsoDate>;
  /** Today in the property's timezone. */
  today: IsoDate;
}

export type QuoteLine =
  | { kind: "nights"; label: string; amount: Minor; nights: number }
  | { kind: "discount"; label: string; amount: Minor; percent: number }
  | { kind: "cleaning"; label: string; amount: Minor }
  | { kind: "tax"; label: string; amount: Minor; percent: number };

export interface CancellationDeadline {
  /** Cancel before the end of this day (property's timezone)... */
  until: IsoDate;
  /** ...to get this percentage of the amount paid back. */
  refundPercent: number;
}

export interface Quote {
  propertyId: string;
  currency: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  guests: number;
  nights: number;
  nightly: { date: IsoDate; price: Minor }[];
  lines: QuoteLine[];
  subtotal: Minor;
  taxTotal: Minor;
  total: Minor;
  /** Charged at booking. */
  dueNow: Minor;
  /** Charged on balanceDueDate; 0 when paid in full now. */
  dueLater: Minor;
  balanceDueDate: IsoDate | null;
  cancellation: CancellationDeadline[];
}

export type QuoteErrorCode = "invalid_dates" | "too_soon" | "guests" | "min_stay" | "max_stay" | "unavailable" | "no_rate";

export interface QuoteError {
  code: QuoteErrorCode;
  message: string;
  /** Nights behind an "unavailable" or "no_rate" error; the minimum for "min_stay". */
  nights?: IsoDate[];
  minNights?: number;
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

const fail = (code: QuoteErrorCode, message: string, extra: Partial<QuoteError> = {}): QuoteResult => ({
  ok: false,
  error: { code, message, ...extra },
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function minStayFor(property: PropertyConfig, rates: ReadonlyMap<IsoDate, NightRate>, checkIn: IsoDate): number {
  return rates.get(checkIn)?.minStay ?? property.minNights;
}

export function quoteStay(request: StayRequest, ctx: QuoteContext): QuoteResult {
  const { site, property, rates, unavailable, today } = ctx;
  const { checkIn, checkOut, guests } = request;

  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) {
    return fail("invalid_dates", "Choose a check-out date after your check-in date.");
  }
  if (checkIn <= today) return fail("too_soon", "Bookings start from tomorrow.");
  if (!Number.isInteger(guests) || guests < 1 || guests > property.maxGuests) {
    return fail("guests", `This home sleeps up to ${property.maxGuests}.`);
  }

  const nights = eachNight(checkIn, checkOut);
  const minNights = minStayFor(property, rates, checkIn);
  if (nights.length < minNights) {
    return fail("min_stay", `The minimum stay for these dates is ${plural(minNights, "night")}.`, { minNights });
  }
  if (nights.length > property.maxNights) {
    return fail("max_stay", `The longest stay is ${plural(property.maxNights, "night")}.`);
  }

  const taken = nights.filter((d) => unavailable.has(d));
  if (taken.length) return fail("unavailable", "Some of these nights are already booked.", { nights: taken });
  const unpriced = nights.filter((d) => !rates.has(d));
  if (unpriced.length) return fail("no_rate", "Some of these nights aren't open for booking yet.", { nights: unpriced });

  const nightly = nights.map((date) => ({ date, price: rates.get(date)!.price }));
  const nightsTotal = nightly.reduce((sum, n) => sum + n.price, 0);
  const lines: QuoteLine[] = [{ kind: "nights", label: plural(nights.length, "night"), amount: nightsTotal, nights: nights.length }];

  if (site.directDiscountPercent > 0) {
    const amount = -percentOf(nightsTotal, site.directDiscountPercent);
    if (amount !== 0) lines.push({ kind: "discount", label: "Direct booking discount", amount, percent: site.directDiscountPercent });
  }
  if (property.cleaningFee > 0) lines.push({ kind: "cleaning", label: "Cleaning fee", amount: property.cleaningFee });

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const taxLines: QuoteLine[] = property.taxes
    .filter((t) => t.ratePercent > 0)
    .map((t) => ({ kind: "tax", label: t.label, amount: percentOf(subtotal, t.ratePercent), percent: t.ratePercent }));
  lines.push(...taxLines);
  const taxTotal = taxLines.reduce((sum, l) => sum + l.amount, 0);
  const total = subtotal + taxTotal;

  const { payment } = property;
  const payInFull = daysBetween(today, checkIn) <= payment.fullPaymentWithinDays || payment.depositPercent >= 100;
  const dueNow = payInFull ? total : percentOf(total, payment.depositPercent);

  return {
    ok: true,
    quote: {
      propertyId: property.id,
      currency: site.currency,
      checkIn,
      checkOut,
      guests,
      nights: nights.length,
      nightly,
      lines,
      subtotal,
      taxTotal,
      total,
      dueNow,
      dueLater: total - dueNow,
      balanceDueDate: payInFull ? null : addDays(checkIn, -payment.balanceDueDaysBeforeArrival),
      cancellation: cancellationDeadlines(property.cancellation, checkIn, today),
    },
  };
}

/** The policy's tiers as dates for this stay, skipping deadlines already past. */
export function cancellationDeadlines(tiers: CancellationTier[], checkIn: IsoDate, today: IsoDate): CancellationDeadline[] {
  return tiers
    .filter((t) => t.refundPercent > 0)
    .map((t) => ({ until: addDays(checkIn, -t.daysBeforeArrival), refundPercent: t.refundPercent }))
    .filter((d) => d.until >= today);
}

/**
 * Refund on cancellation. A tier applies when the guest cancels at least
 * `daysBeforeArrival` days before check-in; tiers are sorted longest notice first.
 */
export function refundFor(tiers: CancellationTier[], checkIn: IsoDate, cancelDate: IsoDate, amountPaid: Minor): { percent: number; amount: Minor } {
  const notice = daysBetween(cancelDate, checkIn);
  const percent = tiers.find((t) => notice >= t.daysBeforeArrival)?.refundPercent ?? 0;
  return { percent, amount: percentOf(amountPaid, percent) };
}
