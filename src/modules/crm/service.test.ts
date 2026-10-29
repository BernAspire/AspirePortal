import { describe, expect, it } from "vitest";

import { displayName } from "./service";

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
