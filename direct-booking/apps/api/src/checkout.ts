// Checkout routes (PLAN.md, Phase 5): POST /api/checkout, the Stripe webhook,
// the confirmation page's booking view, releasing a hold, and the dev-only test checkout.

import { HOLD_MINUTES, formatMoney, type PropertyConfig } from "@direct-booking/core";
import { site } from "@direct-booking/sites/selected";
import { quoteFromDb } from "./availability";
import { bookingView, createHold, getBooking, handlePaymentEvent, releaseHold, type Context } from "./bookings";
import { importCalendars } from "./calendars";
import type { Deps } from "./deps";
import { HttpError, json, readJson, safeEqual } from "./http";
import { CheckoutBody, parseBody } from "./schemas";

/** Stripe's minimum Checkout Session life is 30 minutes; the hold matches it, plus a minute of margin. */
export const HOLD_SECONDS = HOLD_MINUTES * 60 + 60;

export function siteOrigin(env: Env): string {
  if (env.SITE_ORIGIN) return env.SITE_ORIGIN.replace(/\/$/, "");
  if (site.domain) return `https://${site.domain}`;
  throw new Error("SITE_ORIGIN is not set and the site has no domain");
}

const ctx = (env: Env, deps: Deps): Context => ({ db: env.DB, site, deps });

function stayLabel(property: PropertyConfig, checkIn: string, checkOut: string): string {
  const fmt = new Intl.DateTimeFormat(site.locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${property.name}, ${fmt.formatRange(new Date(`${checkIn}T00:00:00Z`), new Date(`${checkOut}T00:00:00Z`))}`;
}

export async function checkout(request: Request, env: Env, deps: Deps, property: (id: string) => PropertyConfig): Promise<Response> {
  const body = parseBody(CheckoutBody, await readJson(request));
  if (!(await deps.turnstile.verify(body.turnstileToken, request.headers.get("cf-connecting-ip")))) {
    throw new HttpError(403, "verification_failed", "We couldn't verify this request. Please try again.");
  }
  const p = property(body.property);

  // Fresh channel calendars before taking the booking (a failed feed keeps its last blocks).
  await importCalendars(env.DB, p, deps);

  const result = await quoteFromDb(env.DB, site, p, body, deps.now());
  if (!result.ok) throw new HttpError(409, result.error.code, result.error.message, result.error);
  const quote = result.quote;
  if (quote.total !== body.expectedTotal) {
    throw new HttpError(409, "price_changed", "The price for these dates has changed. Please check the new total.", { quote });
  }

  const hold = await createHold(env.DB, {
    property: p,
    quote,
    guest: { name: body.name, email: body.email, phone: body.phone, note: body.note },
    now: deps.now(),
    holdSeconds: HOLD_SECONDS,
  });
  if (!hold) throw new HttpError(409, "unavailable", "Someone has just booked some of these nights. Please choose other dates.");

  const origin = siteOrigin(env);
  const back = new URLSearchParams({ id: hold.id, t: hold.viewToken });
  let session: { id: string; url: string };
  try {
    session = await deps.payments.createCheckout({
      bookingId: hold.id,
      amount: quote.dueNow,
      currency: quote.currency,
      description: `${quote.dueLater > 0 ? "Deposit: " : ""}${stayLabel(p, quote.checkIn, quote.checkOut)}`,
      customerEmail: body.email,
      expiresAt: hold.expiresAt,
      successUrl: `${origin}/booking/confirmed/?${back}`,
      cancelUrl: `${origin}/booking/cancelled/?${back}`,
      saveCard: quote.dueLater > 0,
      metadata: { bookingId: hold.id, siteId: site.id, propertyId: p.id },
    });
  } catch (error) {
    // No session, no hold: free the dates straight away.
    await env.DB.prepare("UPDATE bookings SET status = 'expired', status_note = 'checkout session failed' WHERE id = ?").bind(hold.id).run();
    console.error("Stripe Checkout failed", error);
    throw new HttpError(502, "payment_unavailable", "Payments are unavailable right now. Please try again in a few minutes.");
  }
  await env.DB.prepare("UPDATE bookings SET stripe_session_id = ? WHERE id = ?").bind(session.id, hold.id).run();
  return json({ url: session.url, bookingId: hold.id });
}

export async function stripeWebhook(request: Request, env: Env, deps: Deps): Promise<Response> {
  const raw = await request.text();
  let event;
  try {
    event = await deps.payments.parseWebhook(raw, request.headers.get("stripe-signature"));
  } catch {
    throw new HttpError(400, "bad_signature", "Invalid signature.");
  }
  const outcome = await handlePaymentEvent(ctx(env, deps), event);
  return json({ received: true, outcome });
}

async function bookingWithToken(env: Env, id: string, token: string | null) {
  const row = await getBooking(env.DB, id);
  if (!row || !token || !safeEqual(token, row.view_token)) throw new HttpError(404, "not_found", "Booking not found.");
  return row;
}

export async function getBookingRoute(env: Env, id: string, token: string | null): Promise<Response> {
  return json({ booking: bookingView(await bookingWithToken(env, id, token)) });
}

export async function releaseRoute(env: Env, deps: Deps, id: string, token: string | null): Promise<Response> {
  const row = await bookingWithToken(env, id, token);
  const released = await releaseHold(ctx(env, deps), row);
  return json({ released });
}

// ---- Development only: the fake checkout page (PAYMENTS=fake on localhost) ----

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function devCheckoutPage(url: URL): Response {
  const amount = Number(url.searchParams.get("amount"));
  const currency = url.searchParams.get("currency") ?? site.currency;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test checkout</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#22313a}button{font:600 16px system-ui;padding:14px 24px;border-radius:999px;border:0;margin:8px 8px 0 0;cursor:pointer}.pay{background:#3f6657;color:#fff}.note{background:#f4e9d8;padding:12px;border-radius:8px}</style></head>
<body><p class="note"><strong>Test checkout.</strong> Local development only: no card, no Stripe, no money moves.</p>
<h1>${escape(url.searchParams.get("what") ?? "")}</h1><p>Due now: <strong>${escape(formatMoney(amount, currency, site.locale))}</strong></p>
<form method="post"><button class="pay" name="action" value="pay">Pay (test)</button><button name="action" value="cancel">Back to the site</button></form></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function devCheckoutAction(request: Request, url: URL, env: Env, deps: Deps, sessionId: string): Promise<Response> {
  const form = await request.formData();
  const success = url.searchParams.get("success")!;
  const cancel = url.searchParams.get("cancel")!;
  if (form.get("action") !== "pay") return Response.redirect(cancel, 303);
  const bookingId = sessionId.replace(/^fake_cs_/, "");
  await handlePaymentEvent(ctx(env, deps), {
    id: `fake_evt_${crypto.randomUUID()}`,
    type: "checkout.session.completed",
    session: {
      id: sessionId,
      bookingId,
      paymentStatus: "paid",
      amountTotal: Number(url.searchParams.get("amount")),
      paymentIntentId: `fake_pi_${bookingId}`,
      customerId: `fake_cus_${bookingId}`,
    },
  });
  return Response.redirect(success, 303);
}
