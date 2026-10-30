import { describe, expect, it } from "vitest";
import { defineSite, type SiteInput } from "./config";
import { addDays, eachNight } from "./dates";
import { cancellationDeadlines, quoteStay, refundFor, type NightRate, type QuoteContext } from "./quote";

function makeSite(overrides: Partial<SiteInput> = {}, propertyOverrides: Partial<SiteInput["properties"][number]> = {}) {
  return defineSite({
    id: "test",
    name: "Test",
    domain: null,
    currency: "USD",
    locale: "en-US",
    timezone: "America/Los_Angeles",
    host: { name: "Host", alertEmail: "host@example.com" },
    contact: { email: "hello@example.com" },
    brand: { tokens: {} },
    payment: { fullPaymentWithinDays: 30, depositPercent: 50, balanceDueDaysBeforeArrival: 30 },
    cancellation: [
      { daysBeforeArrival: 30, refundPercent: 100 },
      { daysBeforeArrival: 14, refundPercent: 50 },
      { daysBeforeArrival: 0, refundPercent: 0 },
    ],
    checkInTime: "16:00",
    checkOutTime: "11:00",
    properties: [
      {
        id: "home",
        slug: "home",
        name: "Home",
        maxGuests: 4,
        bedrooms: 2,
        baths: 2,
        cleaningFee: 12500,
        taxes: [
          { label: "Sales tax", ratePercent: 10.25, source: "test" },
          { label: "Lodging tax", ratePercent: 2, source: "test" },
        ],
        minNights: 2,
        maxNights: 30,
        pricelabsListingId: null,
        ...propertyOverrides,
      },
    ],
    ...overrides,
  });
}

const TODAY = "2026-11-01";

function context(siteOverrides: Partial<SiteInput> = {}, propertyOverrides = {}, rateOverrides: Record<string, NightRate> = {}, unavailable: string[] = []): QuoteContext {
  const site = makeSite(siteOverrides, propertyOverrides);
  const rates = new Map<string, NightRate>();
  for (const date of eachNight(TODAY, addDays(TODAY, 365))) rates.set(date, { price: 20000, minStay: null });
  for (const [date, rate] of Object.entries(rateOverrides)) rates.set(date, rate);
  return { site, property: site.properties[0]!, rates, unavailable: new Set(unavailable), today: TODAY };
}

const stay = (checkIn: string, checkOut: string, guests = 2) => ({ checkIn, checkOut, guests });

describe("quoteStay: amounts", () => {
  it("adds nights, cleaning and taxes on both", () => {
    const result = quoteStay(stay("2026-12-10", "2026-12-13"), context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const q = result.quote;
    // 3 × 200.00 + 125.00 = 725.00; 10.25% = 74.3125 → 74.31; 2% = 14.50
    expect(q.lines).toEqual([
      { kind: "nights", label: "3 nights", amount: 60000, nights: 3 },
      { kind: "cleaning", label: "Cleaning fee", amount: 12500 },
      { kind: "tax", label: "Sales tax", amount: 7431, percent: 10.25 },
      { kind: "tax", label: "Lodging tax", amount: 1450, percent: 2 },
    ]);
    expect(q).toMatchObject({ nights: 3, subtotal: 72500, taxTotal: 8881, total: 81381, currency: "USD" });
    expect(q.total).toBe(q.lines.reduce((s, l) => s + l.amount, 0));
  });

  it("uses each night's own rate", () => {
    const ctx = context({}, {}, { "2026-12-11": { price: 25050, minStay: null }, "2026-12-12": { price: 31999, minStay: null } });
    const result = quoteStay(stay("2026-12-10", "2026-12-13"), ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.quote.nightly.map((n) => n.price)).toEqual([20000, 25050, 31999]);
    expect(result.quote.lines[0]!.amount).toBe(77049);
  });

  it("applies the direct discount to nights only, before taxes", () => {
    const result = quoteStay(stay("2026-12-10", "2026-12-13"), context({ directDiscountPercent: 7.5 }));
    if (!result.ok) throw new Error(result.error.message);
    const q = result.quote;
    // nights 600.00, discount 45.00, cleaning 125.00 → 680.00; taxes 69.70 + 13.60
    expect(q.lines.map((l) => [l.kind, l.amount])).toEqual([
      ["nights", 60000],
      ["discount", -4500],
      ["cleaning", 12500],
      ["tax", 6970],
      ["tax", 1360],
    ]);
    expect(q.total).toBe(76330);
  });

  it("omits zero lines (no cleaning fee, 0% tax placeholders)", () => {
    const result = quoteStay(stay("2026-12-10", "2026-12-12"), context({}, { cleaningFee: 0, taxes: [{ label: "TBC", ratePercent: 0, source: "x" }] }));
    if (!result.ok) throw new Error(result.error.message);
    expect(result.quote.lines.map((l) => l.kind)).toEqual(["nights"]);
    expect(result.quote.total).toBe(40000);
  });

  it("rounds each tax line half up to the cent", () => {
    const ctx = context({}, { cleaningFee: 0, taxes: [{ label: "A", ratePercent: 10.25, source: "x" }] }, {
      "2026-12-10": { price: 10001, minStay: null },
      "2026-12-11": { price: 10001, minStay: null },
    });
    const result = quoteStay(stay("2026-12-10", "2026-12-12"), ctx);
    if (!result.ok) throw new Error(result.error.message);
    // 20002 × 10.25% = 2050.205 → 2050
    expect(result.quote.taxTotal).toBe(2050);
  });
});

describe("quoteStay: deposit split", () => {
  it("charges everything now when arrival is within the full-payment window", () => {
    const result = quoteStay(stay("2026-12-01", "2026-12-03"), context()); // 30 days out
    if (!result.ok) throw new Error(result.error.message);
    expect(result.quote).toMatchObject({ dueNow: result.quote.total, dueLater: 0, balanceDueDate: null });
  });

  it("splits deposit and balance further out, balance due N days before arrival", () => {
    const result = quoteStay(stay("2026-12-02", "2026-12-05"), context()); // 31 days out
    if (!result.ok) throw new Error(result.error.message);
    const q = result.quote;
    expect(q.dueNow + q.dueLater).toBe(q.total);
    expect(q.dueNow).toBe(Math.round(q.total / 2)); // 50%, half up
    expect(q.balanceDueDate).toBe("2026-11-02");
    expect(q.balanceDueDate! > TODAY).toBe(true);
  });

  it("rounds an odd deposit half up and leaves the exact remainder as balance", () => {
    const ctx = context({ payment: { fullPaymentWithinDays: 14, depositPercent: 33.333, balanceDueDaysBeforeArrival: 14 } }, { cleaningFee: 0, taxes: [] }, {
      "2027-01-10": { price: 10000, minStay: null },
      "2027-01-11": { price: 10001, minStay: null },
    });
    const result = quoteStay(stay("2027-01-10", "2027-01-12"), ctx);
    if (!result.ok) throw new Error(result.error.message);
    // 20001 × 33.333% = 6666.93... → 6667
    expect(result.quote).toMatchObject({ total: 20001, dueNow: 6667, dueLater: 13334, balanceDueDate: "2026-12-27" });
  });

  it("charges in full when the deposit is 100%", () => {
    const result = quoteStay(stay("2027-03-01", "2027-03-03"), context({ payment: { fullPaymentWithinDays: 0, depositPercent: 100, balanceDueDaysBeforeArrival: 0 } }));
    if (!result.ok) throw new Error(result.error.message);
    expect(result.quote.dueLater).toBe(0);
  });
});

describe("quoteStay: rejections", () => {
  const code = (ctx: QuoteContext, s: ReturnType<typeof stay>) => {
    const r = quoteStay(s, ctx);
    return r.ok ? "ok" : r.error.code;
  };

  it("validates dates", () => {
    expect(code(context(), stay("2026-12-10", "2026-12-10"))).toBe("invalid_dates");
    expect(code(context(), stay("2026-12-10", "2026-12-08"))).toBe("invalid_dates");
    expect(code(context(), stay("2026-02-30", "2026-03-02"))).toBe("invalid_dates");
    expect(code(context(), stay(TODAY, "2026-11-04"))).toBe("too_soon");
    expect(code(context(), stay("2026-10-20", "2026-10-25"))).toBe("too_soon");
    expect(code(context(), stay("2026-11-02", "2026-11-04"))).toBe("ok");
  });

  it("validates guests", () => {
    expect(code(context(), stay("2026-12-10", "2026-12-12", 0))).toBe("guests");
    expect(code(context(), stay("2026-12-10", "2026-12-12", 5))).toBe("guests");
    expect(code(context(), stay("2026-12-10", "2026-12-12", 2.5))).toBe("guests");
    expect(code(context(), stay("2026-12-10", "2026-12-12", 4))).toBe("ok");
  });

  it("uses the arrival night's minimum stay, falling back to the property's", () => {
    const ctx = context({}, {}, { "2026-12-24": { price: 30000, minStay: 4 } });
    const r = quoteStay(stay("2026-12-24", "2026-12-27"), ctx);
    expect(r.ok ? null : r.error).toMatchObject({ code: "min_stay", minNights: 4, message: "The minimum stay for these dates is 4 nights." });
    expect(code(ctx, stay("2026-12-24", "2026-12-28"))).toBe("ok");
    expect(code(ctx, stay("2026-12-10", "2026-12-11"))).toBe("min_stay"); // fallback 2
    // A min stay on a later night doesn't apply to an earlier arrival.
    expect(code(ctx, stay("2026-12-22", "2026-12-25"))).toBe("ok");
  });

  it("enforces the longest stay", () => {
    expect(code(context(), stay("2026-12-01", "2026-12-31"))).toBe("ok");
    expect(code(context(), stay("2026-12-01", "2027-01-01"))).toBe("max_stay");
  });

  it("refuses taken nights, but allows arriving on another stay's check-out day", () => {
    const ctx = context({}, {}, {}, ["2026-12-10", "2026-12-11"]);
    const r = quoteStay(stay("2026-12-09", "2026-12-12"), ctx);
    expect(r.ok ? null : r.error).toMatchObject({ code: "unavailable", nights: ["2026-12-10", "2026-12-11"] });
    expect(code(ctx, stay("2026-12-12", "2026-12-14"))).toBe("ok");
    expect(code(ctx, stay("2026-12-08", "2026-12-10"))).toBe("ok");
  });

  it("refuses nights without a rate", () => {
    const ctx = context();
    (ctx.rates as Map<string, NightRate>).delete("2026-12-11");
    const r = quoteStay(stay("2026-12-10", "2026-12-13"), ctx);
    expect(r.ok ? null : r.error).toMatchObject({ code: "no_rate", nights: ["2026-12-11"] });
  });
});

describe("cancellation", () => {
  const tiers = makeSite().properties[0]!.cancellation;

  it("lists refund deadlines for the stay, dropping past ones", () => {
    expect(cancellationDeadlines(tiers, "2027-01-20", TODAY)).toEqual([
      { until: "2026-12-21", refundPercent: 100 },
      { until: "2027-01-06", refundPercent: 50 },
    ]);
    expect(cancellationDeadlines(tiers, "2026-11-20", TODAY)).toEqual([{ until: "2026-11-06", refundPercent: 50 }]);
  });

  it("refunds by notice given, with the deadline day itself included", () => {
    expect(refundFor(tiers, "2027-01-20", "2026-12-21", 50000)).toEqual({ percent: 100, amount: 50000 });
    expect(refundFor(tiers, "2027-01-20", "2026-12-22", 50000)).toEqual({ percent: 50, amount: 25000 });
    expect(refundFor(tiers, "2027-01-20", "2027-01-06", 33333)).toEqual({ percent: 50, amount: 16667 });
    expect(refundFor(tiers, "2027-01-20", "2027-01-07", 50000)).toEqual({ percent: 0, amount: 0 });
    expect(refundFor(tiers, "2027-01-20", "2027-01-25", 50000)).toEqual({ percent: 0, amount: 0 });
  });

  it("agrees with the deadlines shown in the quote", () => {
    for (const d of cancellationDeadlines(tiers, "2027-01-20", TODAY)) {
      expect(refundFor(tiers, "2027-01-20", d.until, 100).percent).toBe(d.refundPercent);
    }
  });
});
