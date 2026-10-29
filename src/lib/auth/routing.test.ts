import { describe, expect, it } from "vitest";

import {
  NO_ACCESS_PATH,
  START_PATH,
  STUDENT_HOME_PATH,
  isProtectedPath,
  portalPathFor,
  safeNextPath,
} from "./routing";

describe("safeNextPath", () => {
  it.each(["/student", "/student/courses?x=1", "/centres#top", "/"])("accepts %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "student",
    "/student\\..\\x",
    "/stu\ndent",
    "",
    "/sign-in",
    "/sign-in?next=/student",
  ])("rejects %j", (path) => {
    expect(safeNextPath(path)).toBe(START_PATH);
  });

  it("rejects non-strings and very long values", () => {
    expect(safeNextPath(null)).toBe(START_PATH);
    expect(safeNextPath(42)).toBe(START_PATH);
    expect(safeNextPath(`/${"a".repeat(600)}`)).toBe(START_PATH);
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//x", "/student")).toBe("/student");
  });
});

describe("isProtectedPath", () => {
  it("matches portal paths and their children", () => {
    expect(isProtectedPath("/student")).toBe(true);
    expect(isProtectedPath("/student/courses")).toBe(true);
    expect(isProtectedPath("/start")).toBe(true);
    expect(isProtectedPath("/centres")).toBe(true);
  });

  it("does not match public paths or lookalikes", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/sign-in")).toBe(false);
    expect(isProtectedPath("/students-info")).toBe(false);
    expect(isProtectedPath("/no-access")).toBe(false);
  });
});

describe("portalPathFor", () => {
  it("sends students to the student portal", () => {
    expect(portalPathFor(["student"])).toBe(STUDENT_HOME_PATH);
    expect(portalPathFor(["guardian", "student"])).toBe(STUDENT_HOME_PATH);
  });

  it("sends roles without a portal yet to no-access", () => {
    expect(portalPathFor(["guardian"])).toBe(NO_ACCESS_PATH);
    expect(portalPathFor(["admin"])).toBe(NO_ACCESS_PATH);
    expect(portalPathFor([])).toBe(NO_ACCESS_PATH);
  });
});
