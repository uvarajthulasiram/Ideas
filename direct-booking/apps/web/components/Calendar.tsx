"use client";

// Availability calendar and date-range picker.
// Keyboard: arrows move a day or a week, Home/End to the start or end of the week,
// Page Up/Down a month, Enter or Space picks. One day is in the tab order at a time.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { addDays, eachNight } from "@direct-booking/core";
import type { NightInfo } from "../lib/api";
import { longDate, plural } from "../lib/format";

interface Props {
  /** Availability by date; null while loading. */
  nights: Map<string, NightInfo> | null;
  today: string;
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
  locale: string;
  /** Property's minimum stay when PriceLabs gives none. */
  fallbackMinNights: number;
}

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
function addMonths(first: string, n: number): string {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

export function Calendar({ nights, today, checkIn, checkOut, onChange, locale, fallbackMinNights }: Props) {
  const [view, setView] = useState(() => monthStart(checkIn ?? addDays(today, 1)));
  const [focused, setFocused] = useState(() => checkIn ?? addDays(today, 1));
  const [months, setMonths] = useState(1);
  const [message, setMessage] = useState("");
  const moved = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 720px)");
    const update = () => setMonths(mq.matches ? 2 : 1);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    root.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, view]);

  const lastBookable = addDays(today, 365);
  const firstMonth = monthStart(addDays(today, 1));
  const lastMonth = monthStart(lastBookable);

  const free = (date: string) => nights?.get(date)?.available ?? false;
  const minStay = (date: string) => nights?.get(date)?.minStay ?? fallbackMinNights;

  /** Can a stay arriving at checkIn end on date? */
  const validCheckOut = (date: string) => {
    if (!checkIn || date <= checkIn) return false;
    const stay = eachNight(checkIn, date);
    return stay.length >= minStay(checkIn) && stay.every(free);
  };
  const choosingCheckOut = Boolean(checkIn && !checkOut);

  function pick(date: string) {
    if (choosingCheckOut && validCheckOut(date)) {
      onChange(checkIn, date);
      setMessage(`Check-out ${longDate(date, locale)}. ${plural(eachNight(checkIn!, date).length, "night")}.`);
      return;
    }
    if (choosingCheckOut && date > checkIn! && eachNight(checkIn!, date).every(free)) {
      setMessage(`From ${longDate(checkIn!, locale)} the minimum stay is ${plural(minStay(checkIn!), "night")}.`);
      return;
    }
    if (free(date)) {
      onChange(date, null);
      setMessage(`Check-in ${longDate(date, locale)}. Now choose check-out. Minimum stay ${plural(minStay(date), "night")}.`);
    } else {
      setMessage(`${longDate(date, locale)} is not available.`);
    }
  }

  function move(date: string) {
    if (date <= today || date > lastBookable) return;
    moved.current = true;
    setFocused(date);
    const m = monthStart(date);
    if (m < view) setView(m);
    else if (m > addMonths(view, months - 1)) setView(addMonths(m, -(months - 1)) < firstMonth ? firstMonth : addMonths(m, -(months - 1)));
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, date: string) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in steps) move(addDays(date, steps[e.key]!));
    else if (e.key === "Home") move(addDays(date, -weekday(date)));
    else if (e.key === "End") move(addDays(date, 6 - weekday(date)));
    else if (e.key === "PageUp") move(addMonthsKeepDay(date, -1));
    else if (e.key === "PageDown") move(addMonthsKeepDay(date, 1));
    else return;
    e.preventDefault();
  }

  const visible = Array.from({ length: months }, (_, i) => addMonths(view, i));
  // Keep the focused day inside the visible months so it stays tabbable.
  const firstBookable = addDays(today, 1);
  const tabbable = visible.includes(monthStart(focused)) ? focused : visible[0]! > firstBookable ? visible[0]! : firstBookable;

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, i) => ({ short: fmt.format(Date.UTC(2023, 0, 1 + i)), long: long.format(Date.UTC(2023, 0, 1 + i)) }));
  }, [locale]);

  return (
    <div className="calendar" ref={root}>
      <div className="calendar__head">
        <button type="button" className="calendar__nav" aria-label="Previous month" disabled={view <= firstMonth} onClick={() => setView(addMonths(view, -1))}>
          ‹
        </button>
        <p className="small muted" aria-live="polite">
          {!nights ? "Loading availability…" : choosingCheckOut ? "Choose check-out" : checkOut ? "Pick a new check-in to change" : "Choose check-in"}
        </p>
        <button type="button" className="calendar__nav" aria-label="Next month" disabled={addMonths(view, months - 1) >= lastMonth} onClick={() => setView(addMonths(view, 1))}>
          ›
        </button>
      </div>
      <div className="calendar__months">
        {visible.map((first) => {
          const lead = weekday(first);
          const days = eachNight(first, addMonths(first, 1));
          const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
          while (cells.length % 7) cells.push(null);
          const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
          const caption = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));
          return (
            <table key={first} className="calendar__month" role="grid" aria-label={caption}>
              <caption>{caption}</caption>
              <thead>
                <tr>
                  {weekdayNames.map((d) => (
                    <th key={d.long} scope="col" abbr={d.long}>
                      {d.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, w) => (
                  <tr key={w}>
                    {week.map((date, i) => {
                      if (!date) return <td key={i} />;
                      const out = date <= today || date > lastBookable;
                      const isEdge = date === checkIn || date === checkOut;
                      const inRange = Boolean(checkIn && checkOut && date > checkIn && date < checkOut);
                      const selectable = !out && nights !== null && (free(date) || (choosingCheckOut && validCheckOut(date)));
                      const state = date === checkIn ? "check-in" : date === checkOut ? "check-out" : inRange ? "in your stay" : selectable ? "available" : "not available";
                      return (
                        <td key={date} role="gridcell" aria-selected={isEdge || inRange}>
                          <button
                            type="button"
                            data-date={date}
                            className={`day${isEdge ? " day--edge" : inRange ? " day--range" : ""}${date === today ? " day--today" : ""}`}
                            tabIndex={date === tabbable ? 0 : -1}
                            aria-label={`${longDate(date, locale)}, ${state}`}
                            aria-disabled={!selectable && !isEdge}
                            onClick={() => (out ? undefined : (setFocused(date), pick(date)))}
                            onKeyDown={(e) => onKey(e, date)}
                          >
                            {Number(date.slice(8))}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </div>
      <p className="status" role="status">
        {message}
      </p>
    </div>
  );
}

function addMonthsKeepDay(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
