// Minimal iCalendar (RFC 5545) reading and writing for channel calendar sync.
//
// Reading: only what Airbnb, VRBO and similar feeds use: VEVENTs with UID,
// DTSTART, DTEND, DURATION-free all-day DATE values (end exclusive), or
// DATE-TIME values, which are mapped to calendar dates in the property's
// timezone. Writing: all-day events, CRLF line endings, lines folded at 75 octets.

import { addDays, isIsoDate, todayIn, type IsoDate } from "./dates";

export interface IcalEvent {
  uid: string;
  /** First blocked night. */
  start: IsoDate;
  /** Day after the last blocked night (exclusive). */
  end: IsoDate;
  summary?: string;
}

export interface ParseResult {
  events: IcalEvent[];
  /** Events skipped, with the reason (cancelled, no nights, unreadable dates). */
  skipped: { uid: string; reason: string }[];
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Undo line folding: a CRLF followed by a space or tab continues the previous line. */
function unfold(text: string): string[] {
  return text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Property | undefined {
  // NAME;PARAM=VALUE;PARAM="QUOTED:VALUE":value
  let i = 0;
  let inQuotes = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ":" && !inQuotes) break;
  }
  if (i === line.length) return undefined;
  const [name = "", ...rawParams] = line.slice(0, i).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/**
 * The calendar date a DATE or DATE-TIME value falls on in `timeZone`.
 * UTC times ("Z") are converted; floating and TZID times keep their written
 * date, since channel feeds write those in the listing's own timezone.
 */
function toDate(prop: Property, timeZone: string): IsoDate | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(prop.value.trim());
  if (!m) return undefined;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (hh !== undefined && z) {
    return todayIn(timeZone, new Date(Date.UTC(+y!, +mo! - 1, +d!, +hh!, +mm!, +ss!)));
  }
  const date = `${y}-${mo}-${d}`;
  return isIsoDate(date) ? date : undefined;
}

function hasTime(prop: Property): boolean {
  return prop.value.includes("T");
}

export function parseIcal(text: string, timeZone: string): ParseResult {
  const events: IcalEvent[] = [];
  const skipped: ParseResult["skipped"] = [];
  let current: Map<string, Property> | undefined;

  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line.trim())) {
      current = new Map();
      continue;
    }
    if (/^END:VEVENT$/i.test(line.trim())) {
      if (current) {
        const result = toEvent(current, timeZone);
        if ("reason" in result) skipped.push(result);
        else events.push(result);
      }
      current = undefined;
      continue;
    }
    if (!current) continue;
    const prop = parseLine(line);
    // Keep the first of each property; feeds don't repeat the ones used here.
    if (prop && !current.has(prop.name)) current.set(prop.name, prop);
  }
  return { events, skipped };
}

function toEvent(props: Map<string, Property>, timeZone: string): IcalEvent | { uid: string; reason: string } {
  const startProp = props.get("DTSTART");
  const endProp = props.get("DTEND");
  const uid = props.get("UID")?.value.trim() || `no-uid:${startProp?.value ?? "?"}-${endProp?.value ?? "?"}`;

  if (props.get("STATUS")?.value.trim().toUpperCase() === "CANCELLED") return { uid, reason: "cancelled" };
  if (!startProp) return { uid, reason: "no DTSTART" };

  const start = toDate(startProp, timeZone);
  if (!start) return { uid, reason: `unreadable DTSTART ${startProp.value}` };

  let end: IsoDate | undefined;
  if (endProp) {
    end = toDate(endProp, timeZone);
    if (!end) return { uid, reason: `unreadable DTEND ${endProp.value}` };
  } else {
    // RFC 5545: an all-day event without DTEND lasts one day; a timed one has no length.
    end = hasTime(startProp) ? start : addDays(start, 1);
  }
  if (end <= start) return { uid, reason: "no nights" };

  const summary = props.get("SUMMARY");
  return { uid, start, end, ...(summary ? { summary: unescapeText(summary.value) } : {}) };
}

// ---- Writing ----

export interface ExportEvent {
  uid: string;
  start: IsoDate;
  end: IsoDate;
  summary: string;
}

function escapeText(value: string): string {
  return value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Fold a content line at 75 octets without splitting a UTF-8 character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += ch;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (date: IsoDate) => date.replaceAll("-", "");

export function buildIcal(options: { prodId: string; name: string; events: ExportEvent[]; now: Date }): string {
  const stamp = options.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${options.prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
  ];
  for (const e of options.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
