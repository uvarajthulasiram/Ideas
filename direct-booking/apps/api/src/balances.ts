// Daily balance charges (PLAN.md, Phase 6). The deposit's card was saved at
// Checkout; on the due date the balance is charged off-session. On failure the
// guest gets a 24-hour payment link and the host an alert.
//
// Each booking is claimed ('pending') before charging, and the charge uses a
// per-booking idempotency key, so an overlapping or retried run can't double-charge.

import { formatMoney, todayIn, type PropertyConfig, type Quote } from "@direct-booking/core";
import { forEmail, type BookingRow, type Context } from "./bookings";
import { unix } from "./calendars";
import { balanceFailedGuest, balanceFailedHost } from "./email";

/** A run that died mid-charge is retried after this long (same idempotency key). */
const STALE_PENDING_SECONDS = 3600;
/** Stripe Checkout Sessions last at most 24 hours. */
const PAY_LINK_SECONDS = 24 * 3600 - 300;

export interface BalanceResult {
  id: string;
  outcome: "paid" | "failed" | "skipped";
  reason?: string;
}

export async function chargeDueBalances(ctx: Context, siteOrigin: string): Promise<BalanceResult[]> {
  const now = ctx.deps.now();
  const nowUnix = unix(now);
  const results: BalanceResult[] = [];

  for (const property of ctx.site.properties) {
    const today = todayIn(property.timezone, now);
    const { results: due } = await ctx.db
      .prepare(
        `SELECT * FROM bookings
         WHERE property_id = ? AND status = 'confirmed' AND balance_due_date IS NOT NULL AND balance_due_date <= ?
           AND (balance_status IS NULL OR (balance_status = 'pending' AND balance_attempted_at < ?))`,
      )
      .bind(property.id, today, nowUnix - STALE_PENDING_SECONDS)
      .all<BookingRow>();

    for (const row of due) {
      try {
        results.push(await chargeOne(ctx, siteOrigin, property, row, nowUnix));
      } catch (error) {
        // Stays 'pending'; the next run retries with the same idempotency key.
        console.error(`Balance charge error ${row.id}`, error);
        results.push({ id: row.id, outcome: "skipped", reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return results;
}

async function chargeOne(ctx: Context, siteOrigin: string, property: PropertyConfig, row: BookingRow, nowUnix: number): Promise<BalanceResult> {
  const quote = JSON.parse(row.quote) as Quote;
  const amount = quote.total - row.amount_paid;
  if (amount <= 0) {
    await ctx.db.prepare("UPDATE bookings SET balance_status = 'paid' WHERE id = ?").bind(row.id).run();
    return { id: row.id, outcome: "skipped", reason: "nothing due" };
  }
  const claimed = await ctx.db
    .prepare(
      "UPDATE bookings SET balance_status = 'pending', balance_attempted_at = ? WHERE id = ? AND status = 'confirmed' AND (balance_status IS NULL OR (balance_status = 'pending' AND balance_attempted_at < ?))",
    )
    .bind(nowUnix, row.id, nowUnix - STALE_PENDING_SECONDS)
    .run();
  if (claimed.meta.changes !== 1) return { id: row.id, outcome: "skipped", reason: "claimed by another run" };

  const description = `Balance: ${property.name}, arriving ${row.check_in}`;
  const result =
    row.stripe_customer_id && row.stripe_payment_intent_id
      ? await ctx.deps.payments.chargeSaved({
          customerId: row.stripe_customer_id,
          depositPaymentIntentId: row.stripe_payment_intent_id,
          amount,
          currency: quote.currency,
          description,
          idempotencyKey: `balance-${row.id}`,
          metadata: { bookingId: row.id, siteId: ctx.site.id, kind: "balance" },
        })
      : ({ ok: false, paymentIntentId: null, reason: "No saved card for this booking" } as const);

  if (result.ok) {
    await ctx.db
      .prepare("UPDATE bookings SET amount_paid = amount_paid + ?, balance_status = 'paid', balance_payment_intent_id = ?, updated_at = ? WHERE id = ? AND balance_status = 'pending'")
      .bind(amount, result.paymentIntentId, unix(ctx.deps.now()), row.id)
      .run();
    return { id: row.id, outcome: "paid" };
  }

  // Declined: send the guest a payment link and tell the host.
  const back = new URLSearchParams({ id: row.id, t: row.view_token });
  const link = await ctx.deps.payments.createCheckout({
    bookingId: row.id,
    amount,
    currency: quote.currency,
    description,
    customerEmail: row.guest_email,
    expiresAt: nowUnix + PAY_LINK_SECONDS,
    successUrl: `${siteOrigin}/booking/confirmed/?${back}`,
    cancelUrl: `${siteOrigin}/booking/confirmed/?${back}`,
    saveCard: false,
    metadata: { bookingId: row.id, siteId: ctx.site.id, kind: "balance" },
  });
  await ctx.db
    .prepare("UPDATE bookings SET balance_status = 'failed', balance_error = ?, balance_session_id = ?, updated_at = ? WHERE id = ?")
    .bind(result.reason, link.id, unix(ctx.deps.now()), row.id)
    .run();
  const b = forEmail(row);
  await ctx.deps.mailer.send(balanceFailedGuest(ctx.site, property, b, link.url));
  await ctx.deps.mailer.send(balanceFailedHost(ctx.site, property, b, result.reason));
  console.error(`Balance failed ${row.id}: ${result.reason} (${formatMoney(amount, quote.currency, ctx.site.locale)})`);
  return { id: row.id, outcome: "failed", reason: result.reason };
}
