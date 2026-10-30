import { describe, expect, it } from "vitest";
import { cancellationSentence, cancellationTiersMarkdown, fillTemplate, formatTime, paymentSentence } from "./facts";

describe("formatTime", () => {
  it("formats 24-hour times for the locale", () => {
    expect(formatTime("16:00", "en-US")).toBe("4 PM");
    expect(formatTime("11:30", "en-US")).toBe("11:30 AM");
    expect(formatTime("16:00", "en-CA")).toMatch(/^4 p\.m\.$/);
  });
});

describe("paymentSentence", () => {
  it("describes deposit and balance from the rule", () => {
    expect(paymentSentence({ fullPaymentWithinDays: 30, depositPercent: 50, balanceDueDaysBeforeArrival: 30 })).toBe(
      "You pay 50% when you book and the rest 30 days before you arrive. Arriving within 30 days? You pay in full when you book.",
    );
    expect(paymentSentence({ fullPaymentWithinDays: 0, depositPercent: 100, balanceDueDaysBeforeArrival: 0 })).toBe("You pay in full when you book.");
  });
});

describe("cancellationSentence", () => {
  it("lists refund tiers in plain words", () => {
    expect(
      cancellationSentence([
        { daysBeforeArrival: 30, refundPercent: 100 },
        { daysBeforeArrival: 14, refundPercent: 50 },
        { daysBeforeArrival: 0, refundPercent: 0 },
      ]),
    ).toBe("A full refund if you cancel at least 30 days before arrival and a 50% refund if you cancel at least 14 days before arrival. After that, the booking can't be refunded.");
    expect(cancellationSentence([{ daysBeforeArrival: 1, refundPercent: 100 }])).toBe("A full refund if you cancel at least 1 day before arrival.");
    expect(cancellationSentence([{ daysBeforeArrival: 0, refundPercent: 0 }])).toBe("Bookings can't be refunded once made.");
  });
});

describe("fillTemplate", () => {
  it("fills known placeholders and rejects unknown ones", () => {
    expect(fillTemplate("Check-in from {{checkInTime}}.", { checkInTime: "4 PM" })).toBe("Check-in from 4 PM.");
    expect(() => fillTemplate("{{nope}}", {})).toThrow(/Unknown placeholder \{\{nope\}\}/);
  });
});

describe("cancellationTiersMarkdown", () => {
  it("lists each tier, ending with the no-refund window", () => {
    expect(
      cancellationTiersMarkdown([
        { daysBeforeArrival: 30, refundPercent: 100 },
        { daysBeforeArrival: 14, refundPercent: 50 },
        { daysBeforeArrival: 0, refundPercent: 0 },
      ]),
    ).toBe(
      "- At least 30 days before check-in: a full refund of what you've paid\n- At least 14 days before check-in: a 50% refund of what you've paid\n- Fewer than 14 days before check-in: no refund of what you've paid",
    );
  });
});
