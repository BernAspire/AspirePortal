import { describe, expect, it } from "vitest";

import { codeSchema, emailSchema } from "./schema";

describe("emailSchema", () => {
  it("trims and lower-cases", () => {
    expect(emailSchema.parse("  Parent@Example.COM ")).toBe("parent@example.com");
  });

  it.each(["", "not-an-email", "a@", "@b.com", `${"a".repeat(250)}@b.com`])("rejects %j", (v) => {
    expect(emailSchema.safeParse(v).success).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(emailSchema.safeParse(null).success).toBe(false);
  });
});

describe("codeSchema", () => {
  it("accepts 6 to 10 digits and strips spaces", () => {
    expect(codeSchema.parse("123456")).toBe("123456");
    expect(codeSchema.parse("123 456")).toBe("123456");
    expect(codeSchema.parse(" 1234567890 ")).toBe("1234567890");
  });

  it.each(["12345", "12345678901", "12a456", "", "١٢٣٤٥٦"])("rejects %j", (v) => {
    expect(codeSchema.safeParse(v).success).toBe(false);
  });
});
