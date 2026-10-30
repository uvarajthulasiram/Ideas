// Schema for sites/<id>/site.ts. Each host's site file calls defineSite(), which
// validates at import time, so a bad config fails the Worker and site builds.
//
// Policies, timezone and check-in times are set once for the site and may be
// overridden per property; defineSite() fills in every property's resolved values.

import { z } from "zod";
import { isValidTimeZone } from "./dates";
import { hasAtMostThreeDecimals, isValidCurrency } from "./money";

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");
const timeZone = z.string().refine(isValidTimeZone, "Unknown IANA timezone, e.g. America/Los_Angeles");
const currency = z.string().refine(isValidCurrency, "Use an ISO 4217 code, e.g. USD or CAD");
const percent = z.number().min(0).max(100).refine(hasAtMostThreeDecimals, "At most 3 decimals");
const minor = z.number().int().nonnegative();
const days = z.number().int().nonnegative();

export const PaymentRuleSchema = z
  .object({
    /** Arrival within this many days: the guest pays everything at booking. */
    fullPaymentWithinDays: days,
    /** Otherwise this percentage is charged at booking... */
    depositPercent: percent,
    /** ...and the balance this many days before arrival. */
    balanceDueDaysBeforeArrival: days,
  })
  .refine((r) => r.balanceDueDaysBeforeArrival <= r.fullPaymentWithinDays, {
    message: "balanceDueDaysBeforeArrival must not exceed fullPaymentWithinDays, or the balance date can fall in the past",
  });

export const CancellationTierSchema = z.object({
  /** Cancelling at least this many days before arrival... */
  daysBeforeArrival: days,
  /** ...refunds this percentage of what was paid. */
  refundPercent: percent,
});

export const CancellationPolicySchema = z
  .array(CancellationTierSchema)
  .min(1)
  .transform((tiers) => [...tiers].sort((a, b) => b.daysBeforeArrival - a.daysBeforeArrival))
  .refine((tiers) => new Set(tiers.map((t) => t.daysBeforeArrival)).size === tiers.length, {
    message: "Each tier needs a different daysBeforeArrival",
  })
  .refine((tiers) => tiers.every((t, i) => i === 0 || t.refundPercent <= tiers[i - 1]!.refundPercent), {
    message: "Refunds must not grow as arrival gets closer",
  });

export const TaxLineSchema = z.object({
  label: z.string().min(1),
  ratePercent: percent,
  /** Where the rate comes from (law, accountant, date checked). */
  source: z.string().min(1),
});

export const IcalImportSchema = z.object({
  /** e.g. "airbnb", "vrbo". */
  channel: slug,
  url: z.url(),
});

export const PhotoSchema = z.object({
  /** File name in sites/<id>/photos/. */
  file: z.string().min(1),
  alt: z.string().min(1),
});

const policyOverrides = {
  timezone: timeZone.optional(),
  checkInTime: time.optional(),
  checkOutTime: time.optional(),
  payment: PaymentRuleSchema.optional(),
  cancellation: CancellationPolicySchema.optional(),
};

export const PropertySchema = z
  .object({
    id: slug,
    slug,
    name: z.string().min(1),
    summary: z.string().default(""),
    maxGuests: z.number().int().min(1),
    bedrooms: z.number().int().nonnegative(),
    baths: z.number().nonnegative().multipleOf(0.5),
    cleaningFee: minor,
    taxes: z.array(TaxLineSchema),
    /** Used when PriceLabs gives no minimum stay for a night. */
    minNights: z.number().int().min(1).default(1),
    maxNights: z.number().int().min(1).default(365),
    icalImports: z.array(IcalImportSchema).default([]),
    /** null until the listing is connected to PriceLabs. A night without a rate can't be booked. */
    pricelabsListingId: z.string().min(1).nullable(),
    photos: z.array(PhotoSchema).default([]),
    /** Public location (never the street address, which guests get after booking). */
    location: z
      .object({ area: z.string().min(1).optional(), city: z.string().min(1), region: z.string().min(1), postalCode: z.string().min(1), country: z.string().length(2) })
      .optional(),
    /** Registration or licence shown on the property page where the law requires it. */
    licence: z.object({ label: z.string().min(1), number: z.string().min(1) }).optional(),
    ...policyOverrides,
  })
  .refine((p) => p.minNights <= p.maxNights, { message: "minNights must not exceed maxNights" });

export const SiteSchema = z
  .object({
    id: slug,
    name: z.string().min(1),
    /** null until the domain is bought. */
    domain: z.string().min(1).nullable(),
    currency,
    /** BCP 47 locale for formatting, e.g. en-US, en-CA. */
    locale: z.string().min(2),
    timezone: timeZone,
    host: z.object({ name: z.string().min(1), alertEmail: z.email() }),
    contact: z.object({ email: z.email(), phone: z.string().optional() }),
    /** Sender for booking emails; its domain must be onboarded to Cloudflare Email Service. */
    emailFrom: z.object({ email: z.email(), name: z.string().min(1) }),
    brand: z.object({
      /** CSS custom properties, without the leading "--". */
      tokens: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.string()),
      /** Self-hosted font files in sites/<id>/fonts/ (no third-party requests from the page). */
      fonts: z
        .array(
          z.object({
            family: z.string().min(1),
            file: z.string().regex(/^[\w.-]+\.woff2$/),
            style: z.enum(["normal", "italic"]).default("normal"),
            /** A weight or a variable range, e.g. "400" or "400 600". */
            weight: z.string().regex(/^\d{3}( \d{3})?$/).default("400"),
            /** Preload faces used above the fold. */
            preload: z.boolean().default(false),
          }),
        )
        .default([]),
    }),
    /** Discount on direct bookings compared with channel prices. Each host decides at launch. */
    directDiscountPercent: percent.default(0),
    payment: PaymentRuleSchema,
    cancellation: CancellationPolicySchema,
    checkInTime: time,
    checkOutTime: time,
    properties: z.array(PropertySchema).min(1),
  })
  .superRefine((site, ctx) => {
    for (const key of ["id", "slug"] as const) {
      const seen = new Set<string>();
      site.properties.forEach((p, i) => {
        if (seen.has(p[key])) ctx.addIssue({ code: "custom", path: ["properties", i, key], message: `Duplicate property ${key}` });
        seen.add(p[key]);
      });
    }
  })
  .transform((site) => ({
    ...site,
    properties: site.properties.map((p) => ({
      ...p,
      timezone: p.timezone ?? site.timezone,
      checkInTime: p.checkInTime ?? site.checkInTime,
      checkOutTime: p.checkOutTime ?? site.checkOutTime,
      payment: p.payment ?? site.payment,
      cancellation: p.cancellation ?? site.cancellation,
    })),
  }));

export type SiteInput = z.input<typeof SiteSchema>;
export type SiteConfig = z.output<typeof SiteSchema>;
export type PropertyConfig = SiteConfig["properties"][number];
export type PaymentRule = z.output<typeof PaymentRuleSchema>;
export type CancellationTier = z.output<typeof CancellationTierSchema>;
export type TaxLine = z.output<typeof TaxLineSchema>;

export function defineSite(input: SiteInput): SiteConfig {
  const result = SiteSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid site config "${input.id}":\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function findProperty(site: SiteConfig, idOrSlug: string): PropertyConfig | undefined {
  return site.properties.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}
