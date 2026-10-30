// Direct bookings: holds, confirmation from Stripe, and notifications.
//
// A hold is created with the overlap check in the same INSERT, so two guests
// can't hold the same nights. Confirmation and emails are idempotent: every
// webhook retry finishes only the steps still missing.

import type { PropertyConfig, Quote, SiteConfig } from "@direct-booking/core";
import { unix } from "./calendars";
import type { Deps } from "./deps";
import { guestConfirmation, hostAlert, lateBookingConflictHost, lateBookingRefundGuest, type BookingForEmail } from "./email";
import { randomToken } from "./http";
import type { PaymentEvent } from "./payments";

export interface BookingRow {
  id: string;
  view_token: string;
  property_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  status: "hold" | "confirmed" | "cancelled" | "expired";
  hold_expires_at: number | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  guest_note: string | null;
  quote: string;
  currency: string;
  amount_paid: number;
  balance_due_date: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  created_at: number;
  updated_at: number;
  guest_emailed_at: number | null;
  host_alerted_at: number | null;
  status_note: string | null;
  balance_status: "pending" | "paid" | "failed" | null;
  balance_attempted_at: number | null;
  balance_payment_intent_id: string | null;
  balance_session_id: string | null;
  balance_error: string | null;
  cancelled_at: number | null;
  refunded_amount: number;
}

export function getBooking(db: D1Database, id: string): Promise<BookingRow | null> {
  return db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<BookingRow>();
}

export function forEmail(row: BookingRow): BookingForEmail {
  return {
    id: row.id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guests: row.guests,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    guestNote: row.guest_note,
    quote: JSON.parse(row.quote) as Quote,
    amountPaid: row.amount_paid,
    balanceDueDate: row.balance_due_date,
  };
}

/** SQL that is true when [?ci, ?co) overlaps anything else that blocks the property ?p. */
const OVERLAP = `(
  EXISTS (SELECT 1 FROM bookings o WHERE o.property_id = ?p AND o.id <> ?id AND o.check_in < ?co AND o.check_out > ?ci
          AND (o.status = 'confirmed' OR (o.status = 'hold' AND o.hold_expires_at > ?now)))
  OR EXISTS (SELECT 1 FROM blocked_dates b WHERE b.property_id = ?p AND b.start_date < ?co AND b.end_date > ?ci)
  OR EXISTS (SELECT 1 FROM manual_blocks m WHERE m.property_id = ?p AND m.start_date < ?co AND m.end_date > ?ci)
)`;

/** Replace named ?params with numbered ones (D1 binds positionally). */
function named(sql: string, params: Record<string, unknown>): { sql: string; values: unknown[] } {
  const names = Object.keys(params);
  return { sql: sql.replace(/\?([a-z]+)/g, (_, n: string) => `?${names.indexOf(n) + 1}`), values: names.map((n) => params[n]) };
}

export interface HoldInput {
  property: PropertyConfig;
  quote: Quote;
  guest: { name: string; email: string; phone: string; note: string };
  now: Date;
  holdSeconds: number;
}

export async function createHold(db: D1Database, input: HoldInput): Promise<{ id: string; viewToken: string; expiresAt: number } | null> {
  const id = `bk_${randomToken(12)}`;
  const viewToken = randomToken(24);
  const now = unix(input.now);
  const expiresAt = now + input.holdSeconds;
  const q = named(
    `INSERT INTO bookings (id, view_token, property_id, check_in, check_out, guests, status, hold_expires_at,
       guest_name, guest_email, guest_phone, guest_note, quote, currency, amount_paid, balance_due_date, created_at, updated_at)
     SELECT ?id, ?token, ?p, ?ci, ?co, ?guests, 'hold', ?exp, ?name, ?email, ?phone, ?note, ?quote, ?cur, 0, ?bal, ?now, ?now
     WHERE NOT ${OVERLAP}`,
    {
      id,
      token: viewToken,
      p: input.property.id,
      ci: input.quote.checkIn,
      co: input.quote.checkOut,
      guests: input.quote.guests,
      exp: expiresAt,
      name: input.guest.name,
      email: input.guest.email,
      phone: input.guest.phone || null,
      note: input.guest.note || null,
      quote: JSON.stringify(input.quote),
      cur: input.quote.currency,
      bal: input.quote.balanceDueDate,
      now,
    },
  );
  const result = await db.prepare(q.sql).bind(...q.values).run();
  return result.meta.changes === 1 ? { id, viewToken, expiresAt } : null;
}

export interface Context {
  db: D1Database;
  site: SiteConfig;
  deps: Deps;
}

function propertyOf(site: SiteConfig, row: BookingRow): PropertyConfig {
  const p = site.properties.find((x) => x.id === row.property_id);
  if (!p) throw new Error(`Booking ${row.id} is for unknown property ${row.property_id}`);
  return p;
}

/** Sends whichever confirmation emails haven't gone out yet. Throws if one fails, so Stripe retries. */
export async function notifyConfirmed(ctx: Context, id: string): Promise<void> {
  const row = await getBooking(ctx.db, id);
  if (!row || row.status !== "confirmed") return;
  const property = propertyOf(ctx.site, row);
  const b = forEmail(row);
  // Host first: the alert to block the other channels matters most.
  if (row.host_alerted_at === null) {
    await ctx.deps.mailer.send(hostAlert(ctx.site, property, b));
    await ctx.db.prepare("UPDATE bookings SET host_alerted_at = ? WHERE id = ?").bind(unix(ctx.deps.now()), id).run();
  }
  if (row.guest_emailed_at === null) {
    await ctx.deps.mailer.send(guestConfirmation(ctx.site, property, b));
    await ctx.db.prepare("UPDATE bookings SET guest_emailed_at = ? WHERE id = ?").bind(unix(ctx.deps.now()), id).run();
  }
}

export type PaymentOutcome = "confirmed" | "already" | "refunded" | "expired" | "ignored" | "balance_paid";

export async function handlePaymentEvent(ctx: Context, event: PaymentEvent): Promise<PaymentOutcome> {
  const s = event.session;
  if (!s?.bookingId) return "ignored";
  const row = await getBooking(ctx.db, s.bookingId);
  if (!row) return "ignored";
  const now = unix(ctx.deps.now());

  if (s.kind === "balance") {
    if (row.balance_session_id !== s.id || event.type !== "checkout.session.completed" || s.paymentStatus !== "paid") return "ignored";
    const r = await ctx.db
      .prepare(
        "UPDATE bookings SET amount_paid = amount_paid + ?, balance_status = 'paid', balance_payment_intent_id = ?, balance_error = NULL, updated_at = ? WHERE id = ? AND balance_status = 'failed'",
      )
      .bind(s.amountTotal, s.paymentIntentId, now, row.id)
      .run();
    return r.meta.changes === 1 ? "balance_paid" : "already";
  }
  if (row.stripe_session_id !== null && row.stripe_session_id !== s.id) return "ignored";

  if (event.type === "checkout.session.expired") {
    await ctx.db.prepare("UPDATE bookings SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'hold'").bind(now, row.id).run();
    return "expired";
  }
  if (event.type !== "checkout.session.completed" || s.paymentStatus !== "paid") return "ignored";

  if (row.status === "confirmed") {
    await notifyConfirmed(ctx, row.id);
    return "already";
  }
  if (row.status === "cancelled") {
    if (row.status_note?.startsWith("late payment")) await finishLateRefund(ctx, row.id, s.paymentIntentId);
    return "refunded";
  }

  // A live hold is honoured as promised. A payment after the hold expired is
  // accepted only if nothing else has taken the dates since.
  const q = named(
    `UPDATE bookings SET status = 'confirmed', amount_paid = ?paid, stripe_payment_intent_id = ?pi, stripe_customer_id = ?cus,
       hold_expires_at = NULL, updated_at = ?now
     WHERE id = ?id AND (status = 'hold' OR (status = 'expired' AND NOT ${OVERLAP}))`,
    { paid: s.amountTotal, pi: s.paymentIntentId, cus: s.customerId, now, id: row.id, p: row.property_id, ci: row.check_in, co: row.check_out },
  );
  const result = await ctx.db.prepare(q.sql).bind(...q.values).run();
  if (result.meta.changes === 1) {
    await notifyConfirmed(ctx, row.id);
    return "confirmed";
  }

  // Paid after the hold expired, and the dates are gone: refund in full.
  await ctx.db
    .prepare(
      "UPDATE bookings SET status = 'cancelled', status_note = 'late payment: dates taken, refunded', amount_paid = ?, stripe_payment_intent_id = ?, stripe_customer_id = ?, updated_at = ? WHERE id = ? AND status = 'expired'",
    )
    .bind(s.amountTotal, s.paymentIntentId, s.customerId, now, row.id)
    .run();
  await finishLateRefund(ctx, row.id, s.paymentIntentId);
  return "refunded";
}

async function finishLateRefund(ctx: Context, id: string, paymentIntentId: string | null): Promise<void> {
  const row = await getBooking(ctx.db, id);
  if (!row || !paymentIntentId) return;
  // The idempotency key makes a retried webhook reuse the same refund.
  await ctx.deps.payments.refund(paymentIntentId, row.amount_paid, "late payment: dates taken", `late-refund-${id}`);
  const property = propertyOf(ctx.site, row);
  if (row.host_alerted_at === null) {
    await ctx.deps.mailer.send(lateBookingConflictHost(ctx.site, property, forEmail(row)));
    await ctx.db.prepare("UPDATE bookings SET host_alerted_at = ? WHERE id = ?").bind(unix(ctx.deps.now()), id).run();
  }
  if (row.guest_emailed_at === null) {
    await ctx.deps.mailer.send(lateBookingRefundGuest(ctx.site, property, forEmail(row)));
    await ctx.db.prepare("UPDATE bookings SET guest_emailed_at = ? WHERE id = ?").bind(unix(ctx.deps.now()), id).run();
  }
}

/** The guest left Stripe without paying: end the session and free the dates now. */
export async function releaseHold(ctx: Context, row: BookingRow): Promise<boolean> {
  if (row.status !== "hold") return false;
  if (row.stripe_session_id) {
    try {
      await ctx.deps.payments.expireCheckout(row.stripe_session_id);
    } catch {
      // Already completed or expired at Stripe: leave the booking to the webhook.
      return false;
    }
  }
  const r = await ctx.db
    .prepare("UPDATE bookings SET status = 'expired', status_note = 'released by guest', updated_at = ? WHERE id = ? AND status = 'hold'")
    .bind(unix(ctx.deps.now()), row.id)
    .run();
  return r.meta.changes === 1;
}

/** What the confirmation page may show: no contact details, no Stripe ids. */
export function bookingView(row: BookingRow) {
  return {
    balanceStatus: row.balance_status,
    id: row.id,
    status: row.status,
    property: row.property_id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guests: row.guests,
    guestName: row.guest_name,
    quote: JSON.parse(row.quote) as Quote,
    amountPaid: row.amount_paid,
    balanceDueDate: row.balance_due_date,
  };
}
