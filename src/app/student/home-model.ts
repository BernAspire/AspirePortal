import type { Course } from "@/modules/academics";
import type { ActiveEntitlement, ProgrammeKind } from "@/modules/programmes";

export interface HomeCourse {
  readonly courseId: string;
  readonly courseName: string;
  readonly subjectId: string;
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
        subjectId: course.subjectId,
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

/** "Good morning/afternoon/evening" by the hour in Singapore (0–23). */
export function greetingFor(singaporeHour: number): string {
  if (singaporeHour < 12) return "Good morning";
  if (singaporeHour < 18) return "Good afternoon";
  return "Good evening";
}

/** Whole days from `today` to `date` (both `YYYY-MM-DD`). */
export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export const RENEW_SOON_DAYS = 30;

export interface HomeProgramme {
  readonly name: string;
  readonly kind: ProgrammeKind;
  readonly validUntil: string;
  readonly renewSoon: boolean;
}

/** Programmes for the "My programmes" list, ending soonest first. */
export function homeProgrammes(
  entitlements: readonly ActiveEntitlement[],
  today: string,
): HomeProgramme[] {
  return entitlements
    .map((e) => ({
      name: e.programmeName,
      kind: e.kind,
      validUntil: e.validUntil,
      renewSoon: daysUntil(today, e.validUntil) <= RENEW_SOON_DAYS,
    }))
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil) || a.name.localeCompare(b.name, "en-SG"));
}

/** The latest date any programme runs to, for the sidebar's "Validity". */
export function overallValidity(entitlements: readonly ActiveEntitlement[]): string | null {
  return entitlements.reduce<string | null>(
    (latest, e) => (latest === null || e.validUntil > latest ? e.validUntil : latest),
    null,
  );
}

/**
 * Which subject tab is selected: the one asked for (if the student has it),
 * else the current course's subject, else the first.
 */
export function selectedSubjectId(
  subjectIds: readonly string[],
  courses: readonly HomeCourse[],
  requested: string | undefined,
): string | null {
  if (requested && subjectIds.includes(requested)) return requested;
  const current = courses.find((c) => c.isCurrent);
  if (current && subjectIds.includes(current.subjectId)) return current.subjectId;
  return subjectIds[0] ?? null;
}
