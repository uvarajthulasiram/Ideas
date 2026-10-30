"use client";

// Home page search: dates and guests, then on to the property page, where the
// calendar shows what is free and the quote. Native date inputs are phone friendly.

import { useEffect, useState, type FormEvent } from "react";
import { addDays, todayIn } from "@direct-booking/core";

interface Props {
  properties: { slug: string; name: string; maxGuests: number }[];
  timezone: string;
  note: string;
}

export function SearchBar({ properties, timezone, note }: Props) {
  const [minDate, setMinDate] = useState<string | undefined>();
  useEffect(() => setMinDate(addDays(todayIn(timezone), 1)), [timezone]);
  const [slug, setSlug] = useState(properties[0]!.slug);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const maxGuests = properties.find((p) => p.slug === slug)!.maxGuests;
  const [guests, setGuests] = useState(Math.min(2, maxGuests));

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams({ guests: String(guests) });
    if (checkIn) q.set("checkIn", checkIn);
    if (checkIn && checkOut > checkIn) q.set("checkOut", checkOut);
    window.location.assign(`/stay/${slug}/?${q}`);
  }

  return (
    <section id="check" aria-label="Check availability" className="wrap search">
      <form className="search__form" onSubmit={submit}>
        {properties.length > 1 && (
          <label className="field">
            Home
            <select value={slug} onChange={(e) => setSlug(e.target.value)}>
              {properties.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Check-in
          <input type="date" min={minDate} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <label className="field">
          Check-out
          <input type="date" min={checkIn || minDate} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
        <label className="field">
          Guests
          <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
            {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "guest" : "guests"}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          Check availability
        </button>
      </form>
      <p className="tiny muted" style={{ marginTop: 12 }}>
        {note}
      </p>
    </section>
  );
}
