import { describe, expect, it } from "vitest";
import { addDays, daysBetween, eachNight, isIsoDate, rangesOverlap, todayIn } from "./dates";

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-11-20")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible or badly formatted dates", () => {
    for (const bad of ["2026-02-29", "2026-13-01", "2026-11-31", "2026-1-05", "20261105", ""]) {
      expect(isIsoDate(bad), bad).toBe(false);
    }
  });
});

describe("date arithmetic", () => {
  it("adds days across month, year and daylight saving changes", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    // US clocks fall back on 2026-11-01 and spring forward on 2027-03-14.
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(addDays("2027-03-13", 2)).toBe("2027-03-15");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-11-20", "2026-11-23")).toBe(3);
    expect(daysBetween("2027-03-13", "2027-03-15")).toBe(2);
    expect(daysBetween("2026-11-23", "2026-11-20")).toBe(-3);
  });

  it("lists the nights of a stay, excluding check-out", () => {
    expect(eachNight("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(eachNight("2026-12-30", "2026-12-30")).toEqual([]);
  });

  it("throws on invalid input instead of guessing", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("rangesOverlap", () => {
  it("treats check-out as exclusive, so back-to-back stays don't overlap", () => {
    expect(rangesOverlap("2026-11-20", "2026-11-23", "2026-11-23", "2026-11-25")).toBe(false);
    expect(rangesOverlap("2026-11-23", "2026-11-25", "2026-11-20", "2026-11-23")).toBe(false);
  });

  it("detects shared nights", () => {
    expect(rangesOverlap("2026-11-20", "2026-11-23", "2026-11-22", "2026-11-25")).toBe(true);
    expect(rangesOverlap("2026-11-20", "2026-11-30", "2026-11-22", "2026-11-23")).toBe(true);
  });
});

describe("todayIn", () => {
  it("uses the property's timezone, not UTC", () => {
    const now = new Date("2026-11-21T05:30:00Z"); // 21:30 on the 20th in Seattle
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-11-20");
    expect(todayIn("America/Edmonton", now)).toBe("2026-11-20");
    expect(todayIn("UTC", now)).toBe("2026-11-21");
  });
});
