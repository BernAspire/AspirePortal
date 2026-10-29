import { describe, expect, it } from "vitest";

import {
  assertCents,
  formatMoney,
  gstForLine,
  lineTotals,
  parseDollars,
  sumLines,
} from "./money";

describe("gstForLine", () => {
  it("computes 9% GST on whole amounts", () => {
    expect(gstForLine(10_000, 900)).toBe(900);
  });

  it("rounds half-up to the cent", () => {
    // 0.5 cent rounds up
    expect(gstForLine(50, 100)).toBe(1); // 50 × 1% = 0.5
    // 1.35 cents rounds down; 1.5 rounds up
    expect(gstForLine(15, 900)).toBe(1); // 1.35
    expect(gstForLine(50, 300)).toBe(2); // 1.5
  });

  it("mirrors rounding for negative amounts (credits)", () => {
    expect(gstForLine(-50, 100)).toBe(-1);
    expect(gstForLine(-15, 900)).toBe(-1);
  });

  it("returns 0 for a zero rate", () => {
    expect(gstForLine(12_345, 0)).toBe(0);
  });

  it("rejects fractional cents and bad rates", () => {
    expect(() => gstForLine(10.5, 900)).toThrow(RangeError);
    expect(() => gstForLine(100, -1)).toThrow(RangeError);
    expect(() => gstForLine(100, 9.5)).toThrow(RangeError);
  });
});

describe("lineTotals and sumLines", () => {
  it("computes GST per line, not on the invoice total", () => {
    const lines = [lineTotals(15, 900), lineTotals(15, 900)];
    // Per line: 1 + 1 = 2. On the total (30 × 9% = 2.7) it would be 3.
    expect(sumLines(lines)).toEqual({ netCents: 30, gstCents: 2, grossCents: 32 });
  });

  it("handles an empty invoice", () => {
    expect(sumLines([])).toEqual({ netCents: 0, gstCents: 0, grossCents: 0 });
  });
});

describe("parseDollars", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["0.07", 7],
    [" 3.10 ", 310],
    ["-4.20", -420],
  ])("parses %s", (input, cents) => {
    expect(parseDollars(input)).toBe(cents);
  });

  it.each(["", "abc", "1.234", "1,000", "$5", "1e3"])("rejects %s", (input) => {
    expect(() => parseDollars(input)).toThrow(RangeError);
  });
});

describe("formatMoney", () => {
  it("formats SGD with grouping", () => {
    expect(formatMoney(123_456)).toBe("S$1,234.56");
    expect(formatMoney(5)).toBe("S$0.05");
    expect(formatMoney(-2_000)).toBe("-S$20.00");
  });
});

describe("assertCents", () => {
  it("rejects unsafe integers", () => {
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});
