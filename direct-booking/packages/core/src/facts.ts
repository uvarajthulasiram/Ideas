// Guest-facing sentences built from config, so no policy figure is ever typed
// into copy. Site content uses them as {{placeholders}} (fillTemplate); emails
// and the booking pages call them directly.

import type { CancellationTier, PaymentRule, PropertyConfig, SiteConfig } from "./config";

/** How long a hold lasts: Stripe Checkout Sessions can't expire sooner than 30 minutes. */
export const HOLD_MINUTES = 30;

export function formatTime(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: m ? "2-digit" : undefined, timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h, m));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function paymentSentence(rule: PaymentRule): string {
  if (rule.depositPercent >= 100) return "You pay in full when you book.";
  return (
    `You pay ${rule.depositPercent}% when you book and the rest ${plural(rule.balanceDueDaysBeforeArrival, "day")} before you arrive. ` +
    `Arriving within ${plural(rule.fullPaymentWithinDays, "day")}? You pay in full when you book.`
  );
}

export function cancellationSentence(tiers: CancellationTier[]): string {
  const refunds = tiers.filter((t) => t.refundPercent > 0);
  if (!refunds.length) return "Bookings can't be refunded once made.";
  const parts = refunds.map((t) => {
    const what = t.refundPercent === 100 ? "a full refund" : `a ${t.refundPercent}% refund`;
    return t.daysBeforeArrival === 0 ? `${what} up to your arrival day` : `${what} if you cancel at least ${plural(t.daysBeforeArrival, "day")} before arrival`;
  });
  const last = tiers.at(-1)!;
  const after = last.refundPercent === 0 && refunds.length < tiers.length ? " After that, the booking can't be refunded." : "";
  return `${list(parts).replace(/^./, (c) => c.toUpperCase())}.${after}`;
}

/** The tiers as a Markdown list, longest notice first, ending with the no-refund window. */
export function cancellationTiersMarkdown(tiers: CancellationTier[]): string {
  return tiers
    .map((t, i) => {
      const refund = t.refundPercent === 100 ? "a full refund" : t.refundPercent === 0 ? "no refund" : `a ${t.refundPercent}% refund`;
      const prev = tiers[i - 1];
      const when =
        t.daysBeforeArrival === 0
          ? prev
            ? `Fewer than ${plural(prev.daysBeforeArrival, "day")} before check-in`
            : "Any time before check-in"
          : `At least ${plural(t.daysBeforeArrival, "day")} before check-in`;
      return `- ${when}: ${refund} of what you've paid`;
    })
    .join("\n");
}

export function policyFacts(site: SiteConfig, property: PropertyConfig): Record<string, string> {
  return {
    siteName: site.name,
    hostName: site.host.name,
    contactEmail: site.contact.email,
    propertyName: property.name,
    checkInTime: formatTime(property.checkInTime, site.locale),
    checkOutTime: formatTime(property.checkOutTime, site.locale),
    maxGuests: String(property.maxGuests),
    bedrooms: String(property.bedrooms),
    baths: String(property.baths),
    minNights: plural(property.minNights, "night"),
    depositPercent: String(property.payment.depositPercent),
    balanceDays: plural(property.payment.balanceDueDaysBeforeArrival, "day"),
    fullPaymentDays: plural(property.payment.fullPaymentWithinDays, "day"),
    holdMinutes: String(HOLD_MINUTES),
    payment: paymentSentence(property.payment),
    cancellation: cancellationSentence(property.cancellation),
    cancellationTiers: cancellationTiersMarkdown(property.cancellation),
    currency: site.currency,
    location: property.location ? `${property.location.city}, ${property.location.region} ${property.location.postalCode}` : "",
    licence: property.licence ? `${property.licence.label} ${property.licence.number}` : "",
  };
}

/** Replaces {{name}} with facts[name]; an unknown name throws, so typos fail the build. */
export function fillTemplate(text: string, facts: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, name: string) => {
    if (!(name in facts)) throw new Error(`Unknown placeholder {{${name}}} in "${text.slice(0, 60)}"`);
    return facts[name]!;
  });
}
