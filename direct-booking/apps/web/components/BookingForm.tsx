"use client";

// Booking step 2: guest details and agreement, then on to Stripe Checkout.
// The trip summary is the Worker's quote; Turnstile is rendered explicitly so
// its single-use token can be reset after every attempt (turnstile-spin skill).

import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Quote } from "@direct-booking/core";
import { ApiError, postCheckout, postQuote } from "../lib/api";
import { shortDate, plural, type Locale } from "../lib/format";
import { readStayParams } from "./BookingWidget";
import { QuoteLines } from "./QuoteLines";

type TurnstileApi = {
  render: (el: HTMLElement, o: { sitekey: string; action: string; callback: (t: string) => void; "expired-callback": () => void }) => string;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface Props {
  property: { id: string; slug: string; name: string; maxGuests: number };
  l: Locale;
  holdMinutes: number;
  /** Server-rendered pieces: policy summary and the trip card's photo and subtitle. */
  policies: ReactNode;
  tripHeader: ReactNode;
}

type Errors = Partial<Record<"name" | "email" | "phone" | "agreed" | "form", string>>;

export function BookingForm({ property, l, holdMinutes, policies, tripHeader }: Props) {
  const [stay, setStay] = useState<{ checkIn: string | null; checkOut: string | null; guests: number } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState("");
  const widgetBox = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => setStay(readStayParams(property.maxGuests)), [property.maxGuests]);

  useEffect(() => {
    if (!stay) return;
    if (!stay.checkIn || !stay.checkOut) {
      setQuoteError("Choose your dates first.");
      return;
    }
    postQuote({ property: property.id, checkIn: stay.checkIn, checkOut: stay.checkOut, guests: stay.guests })
      .then((r) => setQuote(r.quote))
      .catch((e: unknown) => setQuoteError(e instanceof ApiError ? e.message : "We couldn't price these dates."));
  }, [stay, property.id]);

  function renderTurnstile() {
    if (!window.turnstile || !widgetBox.current || widgetId.current !== null) return;
    widgetId.current = window.turnstile.render(widgetBox.current, {
      sitekey: SITE_KEY,
      action: "checkout",
      callback: setToken,
      "expired-callback": () => setToken(""),
    });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!quote) return;
    const data = new FormData(e.currentTarget);
    const value = (k: string) => String(data.get(k) ?? "").trim();
    const next: Errors = {};
    if (value("name").length < 2) next.name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(value("email"))) next.email = "Enter a valid email.";
    if (!/^[+\d\s().-]{7,32}$/.test(value("phone"))) next.phone = "Enter a phone number we can reach you on.";
    if (data.get("agreed") !== "on") next.agreed = "Please agree before continuing.";
    if (!token) next.form = "Please wait a moment while we check your browser, then try again.";
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next).find((k) => k !== "form");
      if (first) document.getElementById(`f-${first}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const { url } = await postCheckout({
        property: property.id,
        checkIn: quote.checkIn,
        checkOut: quote.checkOut,
        guests: quote.guests,
        name: value("name"),
        email: value("email"),
        phone: value("phone"),
        note: value("note"),
        agreed: true,
        turnstileToken: token,
        expectedTotal: quote.total,
      });
      window.location.assign(url);
      return;
    } catch (err) {
      if (err instanceof ApiError && err.code === "price_changed") {
        const fresh = (err.details as { quote?: Quote } | undefined)?.quote;
        if (fresh) setQuote(fresh);
        setErrors({ form: "The price for these dates has just changed. Please check the new total, then continue." });
      } else if (err instanceof ApiError && err.code === "invalid_request" && err.details && typeof err.details === "object") {
        const d = err.details as Record<string, string[] | undefined>;
        setErrors({ name: d.name?.[0], email: d.email?.[0], phone: d.phone?.[0], agreed: d.agreed?.[0], form: err.message });
      } else {
        setErrors({ form: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
      }
    } finally {
      setSubmitting(false);
      if (widgetId.current !== null) {
        window.turnstile?.reset(widgetId.current);
        setToken("");
      }
    }
  }

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <span className="field__error" id={`e-${k}`}>
        {errors[k]}
      </span>
    ) : null;
  const invalid = (k: keyof Errors) => ({ "aria-invalid": Boolean(errors[k]), "aria-describedby": errors[k] ? `e-${k}` : undefined });

  return (
    <div className="booking">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={renderTurnstile} />
      <form className="booking__form" onSubmit={submit} noValidate>
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="h2">Almost there</h1>
          <p className="muted">When you continue, we hold your dates for {holdMinutes} minutes while you pay.</p>
        </div>

        <fieldset>
          <legend>Who&apos;s staying</legend>
          <div className="stack">
            <div className="fields">
              <label className="field">
                Full name
                <input id="f-name" name="name" autoComplete="name" required {...invalid("name")} />
                {err("name")}
              </label>
              <label className="field">
                Email
                <input id="f-email" name="email" type="email" autoComplete="email" required {...invalid("email")} />
                {err("email")}
              </label>
            </div>
            <label className="field" style={{ maxWidth: 340 }}>
              Mobile phone
              <input id="f-phone" name="phone" type="tel" autoComplete="tel" required {...invalid("phone")} />
              <span className="field__hint">For door codes and anything urgent during your stay.</span>
              {err("phone")}
            </label>
            <label className="field">
              A note for your host (optional)
              <textarea name="note" rows={3} maxLength={1000} />
            </label>
          </div>
        </fieldset>

        <fieldset className="terms">
          <legend>Before you pay</legend>
          {policies}
          <label className="check">
            <input id="f-agreed" name="agreed" type="checkbox" {...invalid("agreed")} />
            <span>
              I agree to the <a href="/house-rules/">house rules</a>, <a href="/cancellation/">cancellation policy</a> and <a href="/terms/">booking terms</a>.
            </span>
          </label>
          {err("agreed")}
        </fieldset>

        <div className="stack" style={{ gap: 12 }}>
          <div ref={widgetBox} />
          {errors.form && (
            <p className="status status--error" role="alert">
              {errors.form}
            </p>
          )}
          <button className="button" type="submit" disabled={!quote || submitting} style={{ alignSelf: "flex-start" }}>
            {submitting ? "Holding your dates…" : "Continue to secure payment"}
          </button>
          <p className="tiny muted secure">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="10" height="7" rx="1" />
              <path d="M5 7V5a3 3 0 0 1 6 0v2" />
            </svg>
            Payment is handled by Stripe. We never see or store your card number.
          </p>
        </div>
      </form>

      <aside className="booking__aside" aria-label="Your trip">
        <div className="card">
          {tripHeader}
          {stay && quote && (
            <dl className="lines">
              <div>
                <dt>Dates</dt>
                <dd>
                  {shortDate(quote.checkIn, l.locale)} to {shortDate(quote.checkOut, l.locale, true)}
                </dd>
              </div>
              <div>
                <dt>Guests</dt>
                <dd>{plural(quote.guests, "guest")}</dd>
              </div>
            </dl>
          )}
          <div aria-live="polite">
            {quote && <QuoteLines quote={quote} l={l} />}
            {quoteError && (
              <p className="status status--error">
                {quoteError} <a href={`/stay/${property.slug}/`}>Choose dates</a>
              </p>
            )}
            {!quote && !quoteError && <p className="status muted">Loading your trip…</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}
