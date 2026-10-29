import { describe, expect, it } from "vitest";

import {
  formatSingapore,
  isWithinValidity,
  singaporeDate,
  startOfSingaporeDay,
} from "./time";

describe("singaporeDate", () => {
  it("uses the Singapore calendar date, not UTC", () => {
    // 20:00 UTC on 28 Oct is 04:00 on 29 Oct in Singapore (UTC+8)
    expect(singaporeDate("2026-10-28T20:00:00Z")).toBe("2026-10-29");
    // 15:59 UTC is 23:59 the same day in Singapore
    expect(singaporeDate("2026-10-29T15:59:00Z")).toBe("2026-10-29");
    expect(singaporeDate("2026-10-29T16:00:00Z")).toBe("2026-10-30");
  });
});

describe("startOfSingaporeDay", () => {
  it("returns Singapore midnight as a UTC instant", () => {
    expect(startOfSingaporeDay("2026-10-29T07:52:00Z").toISOString()).toBe(
      "2026-10-28T16:00:00.000Z",
    );
  });
});

describe("formatSingapore", () => {
  it("formats in Singapore time", () => {
    expect(formatSingapore("2026-10-29T07:52:00Z")).toBe("Thu 29 Oct 2026, 3:52 pm");
  });
});

describe("isWithinValidity", () => {
  const at = "2026-10-29T03:00:00Z"; // 11:00 on 29 Oct in Singapore

  it("is inclusive at both ends", () => {
    expect(isWithinValidity("2026-10-29", "2026-10-29", at)).toBe(true);
  });

  it("treats a null end as open-ended", () => {
    expect(isWithinValidity("2026-01-01", null, at)).toBe(true);
  });

  it("is false before the start and after the end", () => {
    expect(isWithinValidity("2026-10-30", null, at)).toBe(false);
    expect(isWithinValidity("2026-01-01", "2026-10-28", at)).toBe(false);
  });

  it("uses the Singapore date at a UTC day boundary", () => {
    // 16:30 UTC on 28 Oct is already 29 Oct in Singapore
    expect(isWithinValidity("2026-10-29", null, "2026-10-28T16:30:00Z")).toBe(true);
  });
});
