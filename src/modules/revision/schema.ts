import { z } from "zod";

export const revisionSectionRow = z
  .object({
    section_id: z.uuid(),
    title: z.string(),
    number: z.number().int(),
    topic: z.string(),
    course_id: z.uuid(),
    tried: z.number().int(),
    correct: z.number().int(),
    last_attempted_at: z.string().nullable(),
    confidence: z.number().int().min(1).max(5).nullable(),
    interval_days: z.number().int().nullable(),
    due_on: z.string().nullable(),
    last_reviewed_at: z.string().nullable(),
    bookmarks_unresolved: z.number().int(),
    bookmarks_resolved: z.number().int(),
  })
  .transform((r) => ({
    sectionId: r.section_id,
    title: r.title,
    number: r.number,
    topic: r.topic,
    courseId: r.course_id,
    tried: r.tried,
    correct: r.correct,
    lastAttemptedAt: r.last_attempted_at,
    confidence: r.confidence,
    intervalDays: r.interval_days,
    dueOn: r.due_on,
    lastReviewedAt: r.last_reviewed_at,
    bookmarksUnresolved: r.bookmarks_unresolved,
    bookmarksResolved: r.bookmarks_resolved,
  }));
export type RevisionSection = z.infer<typeof revisionSectionRow>;

export const examRow = z
  .object({ id: z.uuid(), course_id: z.uuid(), name: z.string(), exam_on: z.string(), own: z.boolean(), active: z.boolean() })
  .transform((r) => ({ id: r.id, courseId: r.course_id, name: r.name, examOn: r.exam_on, own: r.own, active: r.active }));
export type Exam = z.infer<typeof examRow>;

export const weekReviewRow = z
  .object({ section_id: z.uuid(), answered: z.number().int(), correct: z.number().int(), on: z.string() })
  .transform((r) => ({ sectionId: r.section_id, answered: r.answered, correct: r.correct, on: r.on }));
export type WeekReview = z.infer<typeof weekReviewRow>;

export const myRevisionRow = z
  .object({
    today: z.string(),
    sections: z.array(revisionSectionRow),
    exams: z.array(examRow),
    review_days: z.array(z.string()),
    week_reviews: z.array(weekReviewRow),
  })
  .transform((r) => ({ today: r.today, sections: r.sections, exams: r.exams, reviewDays: r.review_days, weekReviews: r.week_reviews }));
export type MyRevision = z.infer<typeof myRevisionRow>;

/** A centre offer the student may be shown ("Recommended for you"); never carries a price. */
export const revisionOfferRow = z
  .object({ id: z.uuid(), course_id: z.uuid(), title: z.string(), description: z.string().nullable(), section_ids: z.array(z.uuid()) })
  .transform((r) => ({ id: r.id, courseId: r.course_id, title: r.title, description: r.description, sectionIds: r.section_ids }));
export type RevisionOffer = z.infer<typeof revisionOfferRow>;

export const confidenceInput = z.object({ sectionId: z.uuid(), confidence: z.number().int().min(1).max(5).nullable() });
export const bookmarkInput = z.object({ questionId: z.uuid(), on: z.boolean() });
export const examInput = z.object({
  courseId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  examOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const examModeInput = z.object({ courseId: z.uuid(), examId: z.uuid().nullable() });

export type RevisionActionResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
