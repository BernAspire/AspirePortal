import { z } from "zod";

const isoDate = z.iso.date();

export const programmeKindSchema = z.enum([
  "e_learning",
  "physical_lecture",
  "live_tutorial",
  "academic_coaching",
]);
export type ProgrammeKind = z.infer<typeof programmeKindSchema>;

export const enrolmentRow = z
  .object({
    id: z.uuid(),
    programme_id: z.uuid(),
    valid_from: isoDate,
    valid_until: isoDate,
  })
  .transform((r) => ({
    id: r.id,
    programmeId: r.programme_id,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
  }));
export type Enrolment = z.infer<typeof enrolmentRow>;

export const programmeRow = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: programmeKindSchema,
  status: z.enum(["active", "suspended", "archived"]),
});
export type Programme = z.infer<typeof programmeRow>;

export const programmeCourseRow = z
  .object({ programme_id: z.uuid(), course_id: z.uuid() })
  .transform((r) => ({ programmeId: r.programme_id, courseId: r.course_id }));
export type ProgrammeCourse = z.infer<typeof programmeCourseRow>;

export const PROGRAMME_KIND_LABELS: Record<ProgrammeKind, string> = {
  e_learning: "E-learning",
  physical_lecture: "Lecture",
  live_tutorial: "Live tutorial",
  academic_coaching: "Academic coaching",
};
