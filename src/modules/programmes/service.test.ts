import { describe, expect, it } from "vitest";

import type { Enrolment, Programme, ProgrammeCourse } from "./schema";
import { activeEntitlements } from "./service";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const P3 = "00000000-0000-4000-8000-000000000003";
const C1 = "00000000-0000-4000-8000-0000000000c1";
const C2 = "00000000-0000-4000-8000-0000000000c2";

const programmes: Programme[] = [
  { id: P1, name: "P6 Science E-learning", kind: "e_learning", status: "active" },
  { id: P2, name: "P6 Maths Tutorial", kind: "live_tutorial", status: "active" },
  { id: P3, name: "Old Programme", kind: "e_learning", status: "archived" },
];
const programmeCourses: ProgrammeCourse[] = [
  { programmeId: P1, courseId: C1 },
  { programmeId: P2, courseId: C2 },
  { programmeId: P2, courseId: C2 },
  { programmeId: P3, courseId: C1 },
];

function enrolment(programmeId: string, validFrom: string, validUntil: string): Enrolment {
  return { id: `${programmeId}-${validFrom}`, programmeId, validFrom, validUntil };
}

describe("activeEntitlements", () => {
  const today = "2026-10-29";

  it("includes enrolments that cover today, inclusive at both ends", () => {
    const result = activeEntitlements(
      [enrolment(P1, "2026-10-29", "2026-12-31"), enrolment(P2, "2026-01-01", "2026-10-29")],
      programmes,
      programmeCourses,
      today,
    );
    expect(result.map((e) => e.programmeId)).toEqual([P2, P1]); // sorted by name
  });

  it("excludes enrolments that have ended or not started", () => {
    const result = activeEntitlements(
      [enrolment(P1, "2026-01-01", "2026-10-28"), enrolment(P2, "2026-10-30", "2026-12-31")],
      programmes,
      programmeCourses,
      today,
    );
    expect(result).toEqual([]);
  });

  it("excludes programmes that are not active", () => {
    const result = activeEntitlements(
      [enrolment(P3, "2026-01-01", "2026-12-31")],
      programmes,
      programmeCourses,
      today,
    );
    expect(result).toEqual([]);
  });

  it("merges overlapping enrolments and keeps the latest end date", () => {
    const result = activeEntitlements(
      [enrolment(P1, "2026-01-01", "2026-11-30"), enrolment(P1, "2026-10-01", "2027-03-31")],
      programmes,
      programmeCourses,
      today,
    );
    expect(result).toEqual([
      {
        programmeId: P1,
        programmeName: "P6 Science E-learning",
        kind: "e_learning",
        validUntil: "2027-03-31",
        courseIds: [C1],
      },
    ]);
  });

  it("de-duplicates course ids", () => {
    const [entitlement] = activeEntitlements(
      [enrolment(P2, "2026-01-01", "2026-12-31")],
      programmes,
      programmeCourses,
      today,
    );
    expect(entitlement.courseIds).toEqual([C2]);
  });

  it("ignores enrolments whose programme is missing (not visible)", () => {
    const missing = "00000000-0000-4000-8000-0000000000ff";
    expect(
      activeEntitlements([enrolment(missing, "2026-01-01", "2026-12-31")], programmes, [], today),
    ).toEqual([]);
  });
});
