"use client";

// Property page booking card: calendar, guests, live quote from the Worker, Reserve.
// Shows only what /api/quote returns; nothing is priced here.

import { useEffect, useMemo, useState } from "react";
import { addDays, todayIn, type Quote } from "@direct-booking/core";
import { ApiError, getAvailability, postQuote, type NightInfo } from "../lib/api";
import { shortDate, type Locale } from "../lib/format";
import { Calendar } from "./Calendar";
import { QuoteLines } from "./QuoteLines";
import { BOOKING_PREVIEW, withBase } from "../lib/base";

export interface WidgetProperty {
  id: string;
  slug: string;
  name: string;
  maxGuests: number;
  minNights: number;
  timezone: string;
}

export function readStayParams(maxGuests: number) {
  const q = new URLSearchParams(window.location.search);
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const guests = Math.min(maxGuests, Math.max(1, Number(q.get("guests")) || 2));
  return { checkIn: date(q.get("checkIn")), checkOut: date(q.get("checkOut")), guests };
}

export function BookingWidget({ property, l }: { property: WidgetProperty; l: Locale }) {
  const [today, setToday] = useState<string | null>(null);
  const [nights, setNights] = useState<Map<string, NightInfo> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [guests, setGuests] = useState(Math.min(2, property.maxGuests));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const p = readStayParams(property.maxGuests);
    setCheckIn(p.checkIn);
    setCheckOut(p.checkIn && p.checkOut && p.checkOut > p.checkIn ? p.checkOut : null);
    setGuests(p.guests);
    setToday(todayIn(property.timezone));
  }, [property.maxGuests, property.timezone]);

  useEffect(() => {
    if (!today || BOOKING_PREVIEW) return;
    setLoadError(null);
    getAvailability(property.id, today, addDays(today, 366))
      .then((r) => setNights(new Map(r.nights.map((n) => [n.date, n]))))
      .catch((e: unknown) => setLoadError(e instanceof ApiError ? e.message : "We couldn't load availability."));
  }, [property.id, today, attempt]);

  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!checkIn || !checkOut) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      postQuote({ property: property.id, checkIn, checkOut, guests })
        .then((r) => !cancelled && setQuote(r.quote))
        .catch((e: unknown) => !cancelled && setQuoteError(e instanceof ApiError ? e.message : "We couldn't price these dates."))
        .finally(() => !cancelled && setLoading(false));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [property.id, checkIn, checkOut, guests]);

  const reserveHref = useMemo(
    () => (quote ? withBase(`/book/${property.slug}/?${new URLSearchParams({ checkIn: quote.checkIn, checkOut: quote.checkOut, guests: String(quote.guests) })}`) : null),
    [quote, property.slug],
  );

  return (
    <section className="card" aria-labelledby="book-heading">
      <h2 id="book-heading" className="h3">
        Check availability
      </h2>
      <div className="dates" aria-live="polite">
        <div>
          <span>Check-in</span>
          <span>{checkIn ? shortDate(checkIn, l.locale) : "Add date"}</span>
        </div>
        <div>
          <span>Check-out</span>
          <span>{checkOut ? shortDate(checkOut, l.locale) : "Add date"}</span>
        </div>
      </div>

      {BOOKING_PREVIEW ? (
        <p className="notice">This is a preview: booking isn&apos;t connected yet, so dates and prices don&apos;t show here.</p>
      ) : loadError ? (
        <div className="notice" role="alert">
          {loadError}{" "}
          <button type="button" className="button button--small" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      ) : (
        today && (
          <Calendar
            nights={nights}
            today={today}
            checkIn={checkIn}
            checkOut={checkOut}
            locale={l.locale}
            fallbackMinNights={property.minNights}
            onChange={(a, b) => {
              setCheckIn(a);
              setCheckOut(b);
            }}
          />
        )
      )}

      <label className="field">
        Guests
        <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
          {Array.from({ length: property.maxGuests }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "guest" : "guests"}
            </option>
          ))}
        </select>
      </label>

      <div aria-live="polite" aria-busy={loading}>
        {quote && <QuoteLines quote={quote} l={l} />}
        {quoteError && <p className="status status--error">{quoteError}</p>}
        {loading && !quote && <p className="status muted">Pricing your stay…</p>}
      </div>

      {reserveHref ? (
        <a className="button" href={reserveHref}>
          Reserve
        </a>
      ) : (
        <button type="button" className="button" aria-disabled="true" onClick={() => document.querySelector<HTMLButtonElement>(".day[tabindex='0']")?.focus()}>
          {checkIn ? "Choose check-out" : "Choose your dates"}
        </button>
      )}
      <p className="tiny muted">You won&apos;t be charged yet. The full price, taxes included, is shown before you pay.</p>
    </section>
  );
}
