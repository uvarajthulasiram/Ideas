"use client";

// Host admin: bookings, cancellation with the policy refund shown first,
// manual blocks, and calendar/price sync. Protected by Cloudflare Access
// (the page and /api/admin/*); the Worker checks the Access JWT as well.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { longDate, money, type Locale } from "../lib/format";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

interface AdminBooking {
  id: string;
  property: string;
  status: string;
  statusNote: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  guest: { name: string; email: string; phone: string | null; note: string | null };
  total: number;
  amountPaid: number;
  refundedAmount: number;
  balanceDueDate: string | null;
  balanceStatus: string | null;
  balanceError: string | null;
  policyRefundToday: { percent: number; amount: number } | null;
}
interface Block {
  id: number;
  property: string;
  start: string;
  end: string;
  note: string | null;
}
interface Run {
  id: number;
  kind: string;
  property_id: string;
  started_at: number;
  ok: number | null;
  error: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/admin${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `Request failed (${res.status})`);
  return body;
}

export function Admin({ l, properties }: { l: Locale; properties: { id: string; name: string }[] }) {
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, bl, r] = await Promise.all([api<{ bookings: AdminBooking[] }>("/bookings"), api<{ blocks: Block[] }>("/blocks"), api<{ runs: Run[] }>("/sync-runs")]);
      setBookings(b.bookings);
      setBlocks(bl.blocks);
      setRuns(r.runs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function act(what: () => Promise<unknown>, done: string) {
    setError("");
    setMessage("");
    try {
      await what();
      setMessage(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function cancel(b: AdminBooking) {
    const policy = b.policyRefundToday!;
    const answer = window.prompt(
      `Cancel ${b.guest.name}'s stay (${b.checkIn} to ${b.checkOut})?\n\nThe policy refunds ${policy.percent}% today: ${money(policy.amount, l)} of ${money(b.amountPaid, l)} paid.\n\nRefund amount (${l.currency}), or leave as is:`,
      (policy.amount / 100).toFixed(2),
    );
    if (answer === null) return;
    const refundAmount = Math.round(Number(answer) * 100);
    if (!Number.isFinite(refundAmount) || refundAmount < 0) return setError("Enter a refund amount, e.g. 120.00");
    void act(() => api(`/bookings/${b.id}/cancel`, { method: "POST", body: JSON.stringify({ refundAmount }) }), `Cancelled; refunded ${money(refundAmount, l)}.`);
  }

  function addBlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void act(
      () => api("/blocks", { method: "POST", body: JSON.stringify({ property: f.get("property"), start: f.get("start"), end: f.get("end"), note: f.get("note") || undefined }) }),
      "Dates blocked. Airbnb and VRBO pick this up from the export feed.",
    );
  }

  const name = (id: string) => properties.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="stack" style={{ gap: 40 }}>
      <div aria-live="polite">
        {message && <p className="notice">{message}</p>}
        {error && (
          <p className="notice status--error" role="alert">
            {error}
          </p>
        )}
      </div>

      <section className="stack">
        <h2 className="h3">Bookings</h2>
        {!bookings && <p className="muted">Loading…</p>}
        {bookings?.length === 0 && <p className="muted">No current bookings.</p>}
        {bookings?.map((b) => (
          <article key={b.id} className="card">
            <div className="stack" style={{ gap: 4 }}>
              <p className="eyebrow">
                {b.status}
                {properties.length > 1 ? ` · ${name(b.property)}` : ""}
              </p>
              <h3 className="h4">
                {longDate(b.checkIn, l.locale)} to {longDate(b.checkOut, l.locale)}
              </h3>
              <p className="small">
                {b.guest.name} · {b.guests} guests · <a href={`mailto:${b.guest.email}`}>{b.guest.email}</a>
                {b.guest.phone ? ` · ${b.guest.phone}` : ""}
              </p>
              {b.guest.note && <p className="small muted">“{b.guest.note}”</p>}
              <p className="small">
                Paid {money(b.amountPaid, l)} of {money(b.total, l)}
                {b.balanceDueDate && b.amountPaid < b.total ? ` · balance due ${b.balanceDueDate}` : ""}
                {b.balanceStatus === "failed" ? ` · balance charge failed: ${b.balanceError}` : ""}
                {b.refundedAmount ? ` · refunded ${money(b.refundedAmount, l)}` : ""}
              </p>
              {b.statusNote && <p className="tiny muted">{b.statusNote}</p>}
            </div>
            {b.status === "confirmed" && (
              <button type="button" className="button button--small" style={{ alignSelf: "flex-start", background: "var(--ember)" }} onClick={() => cancel(b)}>
                Cancel and refund…
              </button>
            )}
          </article>
        ))}
      </section>

      <section className="stack">
        <h2 className="h3">Block dates</h2>
        <form className="search__form" onSubmit={addBlock}>
          {properties.length > 1 ? (
            <label className="field">
              Home
              <select name="property">
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="property" value={properties[0]!.id} />
          )}
          <label className="field">
            First night
            <input type="date" name="start" required />
          </label>
          <label className="field">
            Day after the last night
            <input type="date" name="end" required />
          </label>
          <label className="field">
            Note
            <input name="note" maxLength={200} />
          </label>
          <button className="button" type="submit">
            Block
          </button>
        </form>
        <ul className="stack" style={{ gap: 8, paddingLeft: 20 }}>
          {blocks.map((b) => (
            <li key={b.id} className="small">
              {name(b.property)}: {b.start} to {b.end}
              {b.note ? ` (${b.note})` : ""}{" "}
              <button type="button" className="text-link" style={{ border: 0, background: "none", cursor: "pointer", color: "var(--driftwood-deep)" }} onClick={() => void act(() => api(`/blocks/${b.id}`, { method: "DELETE" }), "Unblocked.")}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack">
        <h2 className="h3">Calendars and prices</h2>
        <p className="small muted">Calendars sync every 15 minutes and prices daily. Sync now after changing something on Airbnb, VRBO or PriceLabs.</p>
        <button type="button" className="button button--small" style={{ alignSelf: "flex-start" }} onClick={() => void act(() => api("/sync", { method: "POST" }), "Synced.")}>
          Sync now
        </button>
        <ul className="stack" style={{ gap: 4, paddingLeft: 20 }}>
          {runs.slice(0, 10).map((r) => (
            <li key={r.id} className="tiny">
              {new Date(r.started_at * 1000).toLocaleString(l.locale)} · {r.kind === "ical_import" ? "calendars" : "prices"} · {r.ok === 1 ? "ok" : r.ok === 0 ? `failed: ${r.error}` : "running"}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
