import type { Course } from "@/modules/academics";
import type { ActiveEntitlement, ProgrammeKind } from "@/modules/programmes";

export interface HomeCourse {
  readonly courseId: string;
  readonly courseName: string;
  readonly isCurrent: boolean;
  /** Latest end date across the programmes that cover this course. */
  readonly accessUntil: string;
  readonly programmes: readonly { readonly name: string; readonly kind: ProgrammeKind }[];
}

/**
 * Courses the student can use today, one card per course. Only courses
 * covered by an active programme are listed (CLAUDE.md, rule 12), and
 * only active courses. The current course comes first, then by name.
 */
export function homeCourses(
  entitlements: readonly ActiveEntitlement[],
  courses: readonly Course[],
  currentCourseIds: ReadonlySet<string>,
): HomeCourse[] {
  const courseById = new Map(courses.filter((c) => c.status === "active").map((c) => [c.id, c]));
  const byCourse = new Map<
    string,
    { accessUntil: string; programmes: { name: string; kind: ProgrammeKind }[] }
  >();

  for (const e of entitlements) {
    for (const courseId of e.courseIds) {
      if (!courseById.has(courseId)) continue;
      const entry = byCourse.get(courseId);
      if (entry) {
        if (e.validUntil > entry.accessUntil) entry.accessUntil = e.validUntil;
        entry.programmes.push({ name: e.programmeName, kind: e.kind });
      } else {
        byCourse.set(courseId, {
          accessUntil: e.validUntil,
          programmes: [{ name: e.programmeName, kind: e.kind }],
        });
      }
    }
  }

  return [...byCourse.entries()]
    .map(([courseId, { accessUntil, programmes }]) => {
      const course = courseById.get(courseId);
      if (!course) throw new Error("unreachable: course filtered above");
      return {
        courseId,
        courseName: course.name,
        isCurrent: currentCourseIds.has(courseId),
        accessUntil,
        programmes,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isCurrent) - Number(a.isCurrent) ||
        a.courseName.localeCompare(b.courseName, "en-SG"),
    );
}
