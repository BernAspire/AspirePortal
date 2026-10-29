import type { Enrolment, Programme, ProgrammeCourse, ProgrammeKind } from "./schema";

/** A programme the student can use today, with the courses it covers. */
export interface ActiveEntitlement {
  readonly programmeId: string;
  readonly programmeName: string;
  readonly kind: ProgrammeKind;
  /** Last day of access (inclusive), `YYYY-MM-DD` in Singapore time. */
  readonly validUntil: string;
  readonly courseIds: readonly string[];
}

/**
 * Programmes the student is entitled to on `today` (a Singapore `YYYY-MM-DD`
 * date). Mirrors `app.has_course_access` in the database: the enrolment must
 * cover today (inclusive) and the programme must be active. Several
 * enrolments in the same programme merge, keeping the latest end date.
 */
export function activeEntitlements(
  enrolments: readonly Enrolment[],
  programmes: readonly Programme[],
  programmeCourses: readonly ProgrammeCourse[],
  today: string,
): ActiveEntitlement[] {
  const programmeById = new Map(programmes.map((p) => [p.id, p]));
  const latestUntil = new Map<string, string>();

  for (const e of enrolments) {
    if (!(e.validFrom <= today && today <= e.validUntil)) continue;
    const programme = programmeById.get(e.programmeId);
    if (!programme || programme.status !== "active") continue;
    const current = latestUntil.get(e.programmeId);
    if (!current || e.validUntil > current) latestUntil.set(e.programmeId, e.validUntil);
  }

  return [...latestUntil.entries()]
    .map(([programmeId, validUntil]) => {
      const programme = programmeById.get(programmeId);
      if (!programme) throw new Error("unreachable: programme filtered above");
      return {
        programmeId,
        programmeName: programme.name,
        kind: programme.kind,
        validUntil,
        courseIds: [
          ...new Set(
            programmeCourses.filter((pc) => pc.programmeId === programmeId).map((pc) => pc.courseId),
          ),
        ],
      };
    })
    .sort((a, b) => a.programmeName.localeCompare(b.programmeName, "en-SG"));
}
