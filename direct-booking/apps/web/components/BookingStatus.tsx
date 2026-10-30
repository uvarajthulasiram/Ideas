"use client";

// The pages Stripe returns guests to. They read the booking with its private
// token and, on the cancel page, release the hold so the dates free up at once.

import { useEffect, useState } from "react";
import { ApiError, getBooking, type BookingView } from "../lib/api";
import { longDate, money, type Locale } from "../lib/format";
import { QuoteLines } from "./QuoteLines";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

function params() {
  const q = new URLSearchParams(window.location.search);
  return { id: q.get("id") ?? "", t: q.get("t") ?? "" };
}

export function Confirmed({ l, contactEmail }: { l: Locale; contactEmail: string }) {
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { id, t } = params();
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      getBooking(id, t)
        .then(({ booking }) => {
          setBooking(booking);
          // Stripe's webhook can land a few seconds after the redirect.
          if (booking.status === "hold" && tries++ < 10) timer = setTimeout(load, 2000);
        })
        .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "We couldn't load your booking."));
    load();
    return () => clearTimeout(timer);
  }, []);

  if (error) return <p className="notice">{error} If you paid, your confirmation email is on its way. Questions: {contactEmail}</p>;
  if (!booking) return <p className="muted">Loading your booking…</p>;
  if (booking.status === "hold")
    return (
      <p className="notice" role="status">
        We&apos;re confirming your payment. This page updates by itself in a moment.
      </p>
    );
  if (booking.status !== "confirmed")
    return <p className="notice">This booking isn&apos;t active. If you were charged, check your email or write to {contactEmail}.</p>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h2">You&apos;re booked, {booking.guestName.split(" ")[0]}.</h1>
        <p className="lede">
          {longDate(booking.checkIn, l.locale)} to {longDate(booking.checkOut, l.locale)}. A confirmation is on its way to your inbox.
        </p>
      </div>
      <div className="card" style={{ maxWidth: 520 }}>
        <QuoteLines quote={booking.quote} l={l} />
        <p className="small">
          Paid today: <strong>{money(booking.amountPaid, l)}</strong>
        </p>
      </div>
      <p className="small muted">The address, door code and arrival guide come by email before your stay. Booking reference {booking.id}.</p>
    </div>
  );
}

export function Cancelled({ propertyPath }: { propertyPath: string }) {
  const [released, setReleased] = useState<boolean | null>(null);
  useEffect(() => {
    const { id, t } = params();
    if (!id || !t) return setReleased(false);
    fetch(`${BASE}/api/booking/${encodeURIComponent(id)}/release?${new URLSearchParams({ t })}`, { method: "POST" })
      .then((r) => r.json() as Promise<{ released?: boolean }>)
      .then((r) => setReleased(Boolean(r.released)))
      .catch(() => setReleased(false));
  }, []);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="h2">No payment was taken.</h1>
      <p className="lede">{released ? "We've let go of the dates you were holding." : "Your dates weren't booked."} You can pick them again any time.</p>
      <p>
        <a className="button" href={propertyPath}>
          Back to the calendar
        </a>
      </p>
    </div>
  );
}
