import { describe, expect, it } from "vitest";

import type { Course } from "@/modules/academics";
import type { ActiveEntitlement } from "@/modules/programmes";

import { homeCourses } from "./home-model";

const SCI = "00000000-0000-4000-8000-0000000000c1";
const MATH = "00000000-0000-4000-8000-0000000000c2";
const ENG = "00000000-0000-4000-8000-0000000000c3";

const courses: Course[] = [
  { id: SCI, name: "Primary 6 Science", status: "active" },
  { id: MATH, name: "Primary 6 Maths", status: "active" },
  { id: ENG, name: "Primary 6 English", status: "archived" },
];

const entitlements: ActiveEntitlement[] = [
  {
    programmeId: "p1",
    programmeName: "Science E-learning",
    kind: "e_learning",
    validUntil: "2026-12-31",
    courseIds: [SCI],
  },
  {
    programmeId: "p2",
    programmeName: "Science Live",
    kind: "live_tutorial",
    validUntil: "2027-02-28",
    courseIds: [SCI, ENG],
  },
  {
    programmeId: "p3",
    programmeName: "Maths E-learning",
    kind: "e_learning",
    validUntil: "2026-11-30",
    courseIds: [MATH],
  },
];

describe("homeCourses", () => {
  it("lists one card per entitled course, current first, then by name", () => {
    const result = homeCourses(entitlements, courses, new Set([SCI]));
    expect(result.map((c) => c.courseName)).toEqual(["Primary 6 Science", "Primary 6 Maths"]);
    expect(result[0].isCurrent).toBe(true);
  });

  it("sorts by name when there is no current course", () => {
    const result = homeCourses(entitlements, courses, new Set());
    expect(result.map((c) => c.courseName)).toEqual(["Primary 6 Maths", "Primary 6 Science"]);
  });

  it("uses the latest end date and lists every programme covering the course", () => {
    const [science] = homeCourses(entitlements, courses, new Set([SCI]));
    expect(science.accessUntil).toBe("2027-02-28");
    expect(science.programmes).toEqual([
      { name: "Science E-learning", kind: "e_learning" },
      { name: "Science Live", kind: "live_tutorial" },
    ]);
  });

  it("leaves out inactive and unknown courses", () => {
    const result = homeCourses(entitlements, courses, new Set());
    expect(result.find((c) => c.courseId === ENG)).toBeUndefined();
    expect(homeCourses(entitlements, [], new Set())).toEqual([]);
  });

  it("shows nothing without entitlements, even for a current course", () => {
    expect(homeCourses([], courses, new Set([SCI]))).toEqual([]);
  });
});
