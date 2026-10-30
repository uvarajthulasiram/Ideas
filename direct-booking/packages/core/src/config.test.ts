import { describe, expect, it } from "vitest";
import { defineSite, findProperty, type SiteInput } from "./config";

function property(overrides: Partial<SiteInput["properties"][number]> = {}): SiteInput["properties"][number] {
  return {
    id: "house-a",
    slug: "house-a",
    name: "House A",
    maxGuests: 6,
    bedrooms: 3,
    baths: 2.5,
    cleaningFee: 12500,
    taxes: [{ label: "GST", ratePercent: 5, source: "test" }],
    pricelabsListingId: null,
    ...overrides,
  };
}

function site(overrides: Partial<SiteInput> = {}): SiteInput {
  return {
    id: "calgary-test",
    name: "Test Homes",
    domain: null,
    currency: "CAD",
    locale: "en-CA",
    timezone: "America/Edmonton",
    host: { name: "Host", alertEmail: "host@example.com" },
    contact: { email: "hello@example.com" },
    brand: { tokens: { ink: "#222" } },
    payment: { fullPaymentWithinDays: 30, depositPercent: 50, balanceDueDaysBeforeArrival: 14 },
    cancellation: [
      { daysBeforeArrival: 7, refundPercent: 50 },
      { daysBeforeArrival: 30, refundPercent: 100 },
    ],
    checkInTime: "16:00",
    checkOutTime: "11:00",
    properties: [property()],
    ...overrides,
  };
}

describe("defineSite", () => {
  it("fills defaults and resolves site-wide policies onto each property", () => {
    const config = defineSite(site());
    expect(config.directDiscountPercent).toBe(0);
    const p = config.properties[0]!;
    expect(p.timezone).toBe("America/Edmonton");
    expect(p.checkInTime).toBe("16:00");
    expect(p.minNights).toBe(1);
    expect(p.icalImports).toEqual([]);
    expect(p.cancellation.map((t) => t.daysBeforeArrival)).toEqual([30, 7]);
  });

  it("lets a property override site policies", () => {
    const config = defineSite(
      site({
        properties: [
          property(),
          property({ id: "house-b", slug: "house-b", checkInTime: "15:00", cancellation: [{ daysBeforeArrival: 14, refundPercent: 100 }] }),
        ],
      }),
    );
    expect(config.properties[1]!.checkInTime).toBe("15:00");
    expect(config.properties[1]!.cancellation).toEqual([{ daysBeforeArrival: 14, refundPercent: 100 }]);
    expect(config.properties[0]!.checkInTime).toBe("16:00");
  });

  it("finds properties by id or slug", () => {
    const config = defineSite(site({ properties: [property({ id: "a1", slug: "the-loft" })] }));
    expect(findProperty(config, "a1")?.name).toBe("House A");
    expect(findProperty(config, "the-loft")?.id).toBe("a1");
    expect(findProperty(config, "nope")).toBeUndefined();
  });

  it.each<[string, Partial<SiteInput>]>([
    ["unknown currency", { currency: "XYZ" }],
    ["bad timezone", { timezone: "Mountain Time" }],
    ["bad time", { checkInTime: "4pm" }],
    ["balance due after full-payment window", { payment: { fullPaymentWithinDays: 7, depositPercent: 50, balanceDueDaysBeforeArrival: 14 } }],
    ["refund growing closer to arrival", { cancellation: [{ daysBeforeArrival: 30, refundPercent: 50 }, { daysBeforeArrival: 7, refundPercent: 100 }] }],
    ["duplicate property slug", { properties: [property(), property({ id: "house-b" })] }],
    ["fractional cents", { properties: [property({ cleaningFee: 99.5 })] }],
    ["tax rate with 4 decimals", { properties: [property({ taxes: [{ label: "x", ratePercent: 1.2345, source: "t" }] })] }],
    ["no properties", { properties: [] }],
  ])("rejects %s", (_, overrides) => {
    expect(() => defineSite(site(overrides))).toThrow(/Invalid site config "calgary-test"/);
  });
});
