// Host admin API (behind Cloudflare Access): bookings, cancellation with
// refund per policy tier, manual blocks, on-demand sync and sync history.

import { isIsoDate, refundFor, todayIn, type PropertyConfig, type Quote } from "@direct-booking/core";
import { site } from "@direct-booking/sites/selected";
import { z } from "zod";
import { forEmail, getBooking, type BookingRow, type Context } from "./bookings";
import { importCalendars, unix } from "./calendars";
import type { Deps } from "./deps";
import { cancellationGuest } from "./email";
import { HttpError, json, readJson } from "./http";
import { refreshRates } from "./prices";
import { parseBody } from "./schemas";

const ctx = (env: Env, deps: Deps): Context => ({ db: env.DB, site, deps });

function propertyOf(id: string): PropertyConfig {
  const p = site.properties.find((x) => x.id === id);
  if (!p) throw new HttpError(404, "unknown_property", "No such property.");
  return p;
}

/** What the policy refunds if the booking is cancelled today. */
function policyRefund(row: BookingRow, now: Date) {
  const p = propertyOf(row.property_id);
  return refundFor(p.cancellation, row.check_in, todayIn(p.timezone, now), row.amount_paid);
}

function adminView(row: BookingRow, now: Date) {
  const quote = JSON.parse(row.quote) as Quote;
  return {
    id: row.id,
    property: row.property_id,
    status: row.status,
    statusNote: row.status_note,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guests: row.guests,
    guest: { name: row.guest_name, email: row.guest_email, phone: row.guest_phone, note: row.guest_note },
    currency: row.currency,
    total: quote.total,
    amountPaid: row.amount_paid,
    refundedAmount: row.refunded_amount,
    balanceDueDate: row.balance_due_date,
    balanceStatus: row.balance_status,
    balanceError: row.balance_error,
    policyRefundToday: row.status === "confirmed" ? policyRefund(row, now) : null,
    createdAt: row.created_at,
  };
}

export async function listBookings(env: Env, deps: Deps): Promise<Response> {
  const now = deps.now();
  const since = todayIn(site.timezone, new Date(now.getTime() - 30 * 86_400_000));
  const { results } = await env.DB.prepare(
    "SELECT * FROM bookings WHERE check_out >= ? AND status IN ('confirmed', 'hold', 'cancelled') ORDER BY check_in",
  )
    .bind(since)
    .all<BookingRow>();
  return json({ bookings: results.map((r) => adminView(r, now)) });
}

const CancelBody = z.object({
  /** Override the policy's refund (minor units), e.g. a goodwill full refund. */
  refundAmount: z.number().int().nonnegative().optional(),
  note: z.string().max(500).optional(),
});

export async function cancelBooking(request: Request, env: Env, deps: Deps, id: string, admin: string): Promise<Response> {
  const body = parseBody(CancelBody, await readJson(request));
  const row = await getBooking(env.DB, id);
  if (!row) throw new HttpError(404, "not_found", "Booking not found.");
  if (row.status !== "confirmed") throw new HttpError(409, "not_confirmed", `Only confirmed bookings can be cancelled (this one is ${row.status}).`);

  const policy = policyRefund(row, deps.now());
  const refund = body.refundAmount ?? policy.amount;
  if (refund > row.amount_paid) throw new HttpError(400, "refund_too_large", "The refund can't be more than the guest paid.");

  // Refund the balance payment first, then the deposit. Keys make retries reuse the same refunds.
  const quote = JSON.parse(row.quote) as Quote;
  const balancePaid = row.balance_payment_intent_id ? row.amount_paid - quote.dueNow : 0;
  const parts: [string | null, number][] = [
    [row.balance_payment_intent_id, Math.min(refund, balancePaid)],
    [row.stripe_payment_intent_id, refund - Math.min(refund, balancePaid)],
  ];
  for (const [pi, amount] of parts) {
    if (amount <= 0) continue;
    if (!pi) throw new HttpError(409, "no_payment", "There is no payment to refund.");
    await deps.payments.refund(pi, amount, `cancelled by host (${admin})`, `cancel-${row.id}-${pi}`);
  }

  const now = unix(deps.now());
  const note = `cancelled by ${admin}${body.note ? `: ${body.note}` : ""}`;
  await env.DB.prepare(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, refunded_amount = ?, status_note = ?, updated_at = ? WHERE id = ? AND status = 'confirmed'",
  )
    .bind(now, refund, note, now, row.id)
    .run();

  const property = propertyOf(row.property_id);
  try {
    await deps.mailer.send(cancellationGuest(site, property, forEmail(row), refund));
  } catch (error) {
    console.error(`Cancellation email failed ${row.id}`, error);
  }
  return json({ cancelled: true, refund, policy });
}

const BlockBody = z.object({
  property: z.string(),
  start: z.string().refine(isIsoDate),
  end: z.string().refine(isIsoDate),
  note: z.string().max(200).optional(),
});

export async function listBlocks(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT id, property_id AS property, start_date AS start, end_date AS end, note FROM manual_blocks ORDER BY start_date").all();
  return json({ blocks: results });
}

export async function addBlock(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = parseBody(BlockBody, await readJson(request));
  propertyOf(body.property);
  if (body.end <= body.start) throw new HttpError(400, "bad_range", "The end date must be after the start date.");
  const row = await env.DB.prepare("INSERT INTO manual_blocks (property_id, start_date, end_date, note, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(body.property, body.start, body.end, body.note ?? null, unix(deps.now()))
    .first<{ id: number }>();
  return json({ id: row!.id }, { status: 201 });
}

export async function deleteBlock(env: Env, id: number): Promise<Response> {
  const r = await env.DB.prepare("DELETE FROM manual_blocks WHERE id = ?").bind(id).run();
  if (r.meta.changes !== 1) throw new HttpError(404, "not_found", "No such block.");
  return json({ deleted: true });
}

export async function syncNow(env: Env, deps: Deps): Promise<Response> {
  const results = [];
  for (const p of site.properties) {
    results.push({ property: p.id, calendars: await importCalendars(env.DB, p, deps), rates: await refreshRates(env.DB, p, site.currency, deps.prices, deps) });
  }
  return json({ results });
}

export async function syncRuns(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 30").all();
  return json({ runs: results });
}

export { ctx as adminContext };
