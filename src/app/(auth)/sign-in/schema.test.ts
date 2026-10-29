import { describe, expect, it } from "vitest";

import { codeSchema, emailSchema, pinSchema, studentLoginEmail, usernameSchema } from "./schema";

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

describe("usernameSchema", () => {
  it("trims and lower-cases", () => {
    expect(usernameSchema.parse("  Tess.Tan ")).toBe("tess.tan");
  });

  it.each(["ab", "-tess", "tess tan", "tess@x", "a".repeat(33), ""])("rejects %j", (v) => {
    expect(usernameSchema.safeParse(v).success).toBe(false);
  });
});

describe("pinSchema", () => {
  it("accepts 6 to 8 digits", () => {
    expect(pinSchema.parse("123456")).toBe("123456");
    expect(pinSchema.parse("1234 5678")).toBe("12345678");
  });

  it.each(["12345", "123456789", "12a456", ""])("rejects %j", (v) => {
    expect(pinSchema.safeParse(v).success).toBe(false);
  });
});

describe("studentLoginEmail", () => {
  it("uses the reserved student domain", () => {
    expect(studentLoginEmail("tess.tan")).toBe("tess.tan@students.aspireportal.invalid");
  });
});
