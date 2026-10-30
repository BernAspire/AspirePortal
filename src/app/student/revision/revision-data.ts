import "server-only";

import { requirePortal } from "@/lib/auth/session";
import { getCourses } from "@/modules/academics";
import { getMyStudent, type MyStudent } from "@/modules/crm";
import { getMyRevision, type MyRevision } from "@/modules/revision";

export interface RevisionContext {
  readonly centreId: string;
  readonly centreName: string;
  readonly student: MyStudent | null;
  readonly revision: MyRevision | null;
  /** Course id → "Primary 5 Mathematics". */
  readonly courseNames: ReadonlyMap<string, string>;
}

/** "Primary 5 Mathematics" → "Mathematics". */
export function subjectOf(courseName: string): string {
  return courseName.replace(/^(Primary|Secondary)\s+\d+\s+|^JC\s*\d\s+/i, "");
}

export async function loadRevision(path: string): Promise<RevisionContext> {
  const { centre } = await requirePortal("student", path);
  const [student, revision] = await Promise.all([getMyStudent(centre.centreId), getMyRevision(centre.centreId)]);
  const courseIds = new Set<string>([...(revision?.sections ?? []).map((s) => s.courseId), ...(revision?.exams ?? []).map((e) => e.courseId)]);
  const courses = await getCourses([...courseIds]);
  return {
    centreId: centre.centreId,
    centreName: centre.centreName,
    student,
    revision,
    courseNames: new Map(courses.map((c) => [c.id, c.name])),
  };
}
