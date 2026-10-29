import { describe, expect, it } from "vitest";

import { displayName, initials } from "./service";

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Chloe Tan")).toBe("CT");
    expect(initials("aisha binte rahman")).toBe("AR");
  });

  it("handles one word or none", () => {
    expect(initials("Aisha")).toBe("A");
    expect(initials("   ")).toBe("?");
  });
});

describe("displayName", () => {
  it("prefers the preferred name", () => {
    expect(displayName("Tan Wei Ming", "Ming")).toBe("Ming");
  });

  it("falls back to the first word of the full name", () => {
    expect(displayName("  Aisha binte Rahman ", null)).toBe("Aisha");
    expect(displayName("Aisha", "   ")).toBe("Aisha");
  });

  it("never returns an empty string", () => {
    expect(displayName("   ", null)).toBe("there");
  });
});
