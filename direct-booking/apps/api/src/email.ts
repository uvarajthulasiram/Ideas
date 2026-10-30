// The three emails (PLAN.md, "Emails"): guest confirmation, host alert, and
// balance-payment failure. Plain, short HTML plus text. Figures come from the
// booking's quote snapshot and the site config, never typed here.

import { cancellationSentence, formatMoney, formatTime, type PropertyConfig, type Quote, type SiteConfig } from "@direct-booking/core";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

/** Cloudflare Email Service binding. `wrangler dev` simulates it (logs, no delivery). */
export function bindingMailer(binding: SendEmail | undefined, from: { email: string; name: string }): Mailer {
  return {
    async send(email) {
      if (!binding) throw new Error("EMAIL binding is not configured");
      await binding.send({ from, to: email.to, subject: email.subject, text: email.text, html: email.html, ...(email.replyTo ? { replyTo: email.replyTo } : {}) });
    },
  };
}

export interface BookingForEmail {
  id: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  guestNote: string | null;
  quote: Quote;
  amountPaid: number;
  balanceDueDate: string | null;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function longDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/** One email body from paragraphs and label/value rows, as both HTML and text. */
function render(blocks: ({ p: string; strong?: boolean } | { rows: [string, string][] })[], footer: string): { text: string; html: string } {
  const text = blocks
    .map((b) => ("p" in b ? b.p : b.rows.map(([k, v]) => `${k}: ${v}`).join("\n")))
    .concat(footer)
    .join("\n\n");
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#22313a;max-width:560px">` +
    blocks
      .map((b) =>
        "p" in b
          ? `<p style="margin:0 0 16px">${b.strong ? `<strong>${escape(b.p)}</strong>` : escape(b.p)}</p>`
          : `<table style="border-collapse:collapse;margin:0 0 16px;width:100%">${b.rows
              .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5a6267">${escape(k)}</td><td style="padding:4px 0;text-align:right">${escape(v)}</td></tr>`)
              .join("")}</table>`,
      )
      .join("") +
    `<p style="margin:24px 0 0;font-size:13px;color:#5a6267">${escape(footer)}</p></div>`;
  return { text, html };
}

function stayRows(site: SiteConfig, property: PropertyConfig, b: BookingForEmail): [string, string][] {
  return [
    ["Home", property.name],
    ["Check-in", `${longDate(b.checkIn, site.locale)}, from ${formatTime(property.checkInTime, site.locale)}`],
    ["Check-out", `${longDate(b.checkOut, site.locale)}, by ${formatTime(property.checkOutTime, site.locale)}`],
    ["Guests", String(b.guests)],
  ];
}

function moneyRows(site: SiteConfig, b: BookingForEmail): [string, string][] {
  const m = (n: number) => formatMoney(n, b.quote.currency, site.locale);
  const rows: [string, string][] = b.quote.lines.map((l) => [l.kind === "tax" || l.kind === "discount" ? `${l.label} (${l.percent}%)` : l.label, m(l.amount)]);
  rows.push(["Total", m(b.quote.total)], ["Paid", m(b.amountPaid)]);
  if (b.balanceDueDate && b.quote.total > b.amountPaid) rows.push([`Balance, charged ${longDate(b.balanceDueDate, site.locale)}`, m(b.quote.total - b.amountPaid)]);
  return rows;
}

export function guestConfirmation(site: SiteConfig, property: PropertyConfig, b: BookingForEmail): OutgoingEmail {
  const body = render(
    [
      { p: `Hi ${b.guestName.split(" ")[0]},` },
      { p: `Your stay at ${property.name} is confirmed. We're looking forward to having you.` },
      { rows: stayRows(site, property, b) },
      { rows: moneyRows(site, b) },
      { p: "The address, door code and arrival guide come by email before your stay." },
      { p: `Cancellation: ${cancellationSentence(property.cancellation)}` },
      { p: `Questions? Reply to this email or write to ${site.contact.email}.` },
      { p: site.host.name },
    ],
    `Booking reference ${b.id}`,
  );
  return { to: b.guestEmail, subject: `Your stay at ${property.name} is confirmed`, replyTo: site.contact.email, ...body };
}

export function hostAlert(site: SiteConfig, property: PropertyConfig, b: BookingForEmail): OutgoingEmail {
  const dates = `${longDate(b.checkIn, site.locale)} to ${longDate(b.checkOut, site.locale)}`;
  const body = render(
    [
      // The real double-booking guard: Airbnb and VRBO refresh imported calendars only every few hours.
      { p: `Block these dates on Airbnb and VRBO now: ${dates} (${property.name}).`, strong: true },
      { p: `New direct booking from ${b.guestName}.` },
      { rows: stayRows(site, property, b) },
      { rows: [["Email", b.guestEmail], ["Phone", b.guestPhone ?? "not given"], ...(b.guestNote ? ([["Note", b.guestNote]] as [string, string][]) : [])] },
      { rows: moneyRows(site, b) },
    ],
    `Booking reference ${b.id}`,
  );
  return { to: site.host.alertEmail, subject: `Block dates now: new booking ${b.checkIn} to ${b.checkOut}`, replyTo: b.guestEmail, ...body };
}

export function balanceFailedGuest(site: SiteConfig, property: PropertyConfig, b: BookingForEmail, payUrl: string): OutgoingEmail {
  const amount = formatMoney(b.quote.total - b.amountPaid, b.quote.currency, site.locale);
  const body = render(
    [
      { p: `Hi ${b.guestName.split(" ")[0]},` },
      { p: `We couldn't charge the balance of ${amount} for your stay at ${property.name} (${longDate(b.checkIn, site.locale)}). This often happens when a card expires or the bank asks for a check.` },
      { p: `Please pay the balance here: ${payUrl}` },
      { p: `The link works for 24 hours. If you have any trouble, reply to this email or write to ${site.contact.email}.` },
      { p: site.host.name },
    ],
    `Booking reference ${b.id}`,
  );
  return { to: b.guestEmail, subject: `Action needed: balance for your stay at ${property.name}`, replyTo: site.contact.email, ...body };
}

export function balanceFailedHost(site: SiteConfig, property: PropertyConfig, b: BookingForEmail, reason: string): OutgoingEmail {
  const amount = formatMoney(b.quote.total - b.amountPaid, b.quote.currency, site.locale);
  const body = render(
    [
      { p: `The balance charge of ${amount} failed for ${b.guestName}'s stay (${b.checkIn} to ${b.checkOut}, ${property.name}).`, strong: true },
      { p: `Reason from Stripe: ${reason}` },
      { p: "The guest has been emailed a payment link that works for 24 hours. The booking stays confirmed until you decide otherwise." },
      { rows: [["Email", b.guestEmail], ["Phone", b.guestPhone ?? "not given"]] },
    ],
    `Booking reference ${b.id}`,
  );
  return { to: site.host.alertEmail, subject: `Balance payment failed: ${b.guestName}, ${b.checkIn}`, replyTo: b.guestEmail, ...body };
}

export function lateBookingConflictHost(site: SiteConfig, property: PropertyConfig, b: BookingForEmail): OutgoingEmail {
  const body = render(
    [
      { p: `A guest paid after their hold expired, and the dates were taken in the meantime. They have been refunded in full automatically.`, strong: true },
      { rows: [...stayRows(site, property, b), ["Guest", `${b.guestName} <${b.guestEmail}>`]] },
      { p: "No action is needed, but you may want to reach out to them." },
    ],
    `Booking reference ${b.id}`,
  );
  return { to: site.host.alertEmail, subject: `Refunded a late payment: ${b.checkIn} to ${b.checkOut}`, replyTo: b.guestEmail, ...body };
}

export function lateBookingRefundGuest(site: SiteConfig, property: PropertyConfig, b: BookingForEmail): OutgoingEmail {
  const body = render(
    [
      { p: `Hi ${b.guestName.split(" ")[0]},` },
      { p: `We're sorry: your payment for ${property.name} (${longDate(b.checkIn, site.locale)} to ${longDate(b.checkOut, site.locale)}) arrived after your 30-minute hold ended, and those dates were booked in the meantime.` },
      { p: `We've refunded your payment of ${formatMoney(b.amountPaid, b.quote.currency, site.locale)} in full. Banks usually show it within 5 to 10 business days.` },
      { p: `If you'd like to find other dates, reply to this email or write to ${site.contact.email}.` },
      { p: site.host.name },
    ],
    `Booking reference ${b.id}`,
  );
  return { to: b.guestEmail, subject: `Your payment for ${property.name} has been refunded`, replyTo: site.contact.email, ...body };
}
