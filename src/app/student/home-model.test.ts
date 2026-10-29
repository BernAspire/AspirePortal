import { describe, expect, it } from "vitest";

import type { Course } from "@/modules/academics";
import type { ActiveEntitlement } from "@/modules/programmes";

import {
  daysUntil,
  greetingFor,
  homeCourses,
  homeProgrammes,
  overallValidity,
  selectedSubjectId,
  type HomeCourse,
} from "./home-model";

const SCI = "00000000-0000-4000-8000-0000000000c1";
const MATH = "00000000-0000-4000-8000-0000000000c2";
const ENG = "00000000-0000-4000-8000-0000000000c3";

const courses: Course[] = [
  { id: SCI, name: "Primary 6 Science", status: "active", subjectId: "s1" },
  { id: MATH, name: "Primary 6 Maths", status: "active", subjectId: "s1" },
  { id: ENG, name: "Primary 6 English", status: "archived", subjectId: "s1" },
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

describe("greetingFor", () => {
  it.each([
    [0, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [23, "Good evening"],
  ])("hour %i → %s", (hour, text) => {
    expect(greetingFor(hour)).toBe(text);
  });
});

describe("daysUntil", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2026-10-29", "2026-10-29")).toBe(0);
    expect(daysUntil("2026-10-29", "2026-11-28")).toBe(30);
    expect(daysUntil("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("homeProgrammes", () => {
  it("flags programmes ending within 30 days and sorts soonest first", () => {
    const result = homeProgrammes(entitlements, "2026-11-01");
    expect(result.map((p) => [p.name, p.renewSoon])).toEqual([
      ["Maths E-learning", true], // ends 30 Nov: 29 days away
      ["Science E-learning", false], // ends 31 Dec
      ["Science Live", false],
    ]);
  });

  it("treats exactly 30 days as soon", () => {
    expect(homeProgrammes(entitlements, "2026-10-31")[0].renewSoon).toBe(true);
    expect(homeProgrammes(entitlements, "2026-10-30")[0].renewSoon).toBe(false);
  });
});

describe("overallValidity", () => {
  it("is the latest end date, or null", () => {
    expect(overallValidity(entitlements)).toBe("2027-02-28");
    expect(overallValidity([])).toBeNull();
  });
});

describe("selectedSubjectId", () => {
  const course = (subjectId: string, isCurrent: boolean): HomeCourse => ({
    courseId: subjectId + "-c",
    courseName: subjectId,
    subjectId,
    isCurrent,
    accessUntil: "2026-12-31",
    programmes: [],
  });

  it("uses the requested subject when the student has it", () => {
    expect(selectedSubjectId(["sci", "math"], [course("sci", true)], "math")).toBe("math");
  });

  it("ignores a requested subject the student doesn't have", () => {
    expect(selectedSubjectId(["sci", "math"], [course("math", true)], "eng")).toBe("math");
  });

  it("falls back to the first subject, or null", () => {
    expect(selectedSubjectId(["sci", "math"], [course("math", false)], undefined)).toBe("sci");
    expect(selectedSubjectId([], [], undefined)).toBeNull();
  });
});
