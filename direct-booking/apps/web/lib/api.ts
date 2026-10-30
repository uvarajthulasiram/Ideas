// Calls to the booking Worker. In production it is routed on the site's own
// domain (same origin); in development NEXT_PUBLIC_API_BASE points at wrangler dev.

import type { Quote, QuoteError } from "@direct-booking/core";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export interface NightInfo {
  date: string;
  available: boolean;
  minStay: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiError(0, "network", "We couldn't reach the booking system. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; details?: unknown };
  if (!res.ok) throw new ApiError(res.status, body.error ?? "error", body.message ?? "Something went wrong. Please try again.", body.details);
  return body as T;
}

export function getAvailability(property: string, from: string, to: string): Promise<{ nights: NightInfo[] }> {
  return call(`/api/availability?${new URLSearchParams({ property, from, to })}`);
}

export function postQuote(body: { property: string; checkIn: string; checkOut: string; guests: number }): Promise<{ quote: Quote }> {
  return call("/api/quote", { method: "POST", body: JSON.stringify(body) });
}

export interface CheckoutBody {
  property: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  name: string;
  email: string;
  phone: string;
  note: string;
  agreed: true;
  turnstileToken: string;
  /** The total the guest saw, so a price change is caught before payment. */
  expectedTotal: number;
}

export function postCheckout(body: CheckoutBody): Promise<{ url: string }> {
  return call("/api/checkout", { method: "POST", body: JSON.stringify(body) });
}

export function getBooking(id: string, token: string): Promise<{ booking: BookingView }> {
  return call(`/api/booking/${encodeURIComponent(id)}?${new URLSearchParams({ t: token })}`);
}

export interface BookingView {
  id: string;
  status: "hold" | "confirmed" | "cancelled" | "expired";
  property: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  quote: Quote;
  amountPaid: number;
  balanceDueDate: string | null;
}

export type { Quote, QuoteError };
