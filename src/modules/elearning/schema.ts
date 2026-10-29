import { z } from "zod";

export const pageSchema = z.object({
  path: z.string().min(1),
  role: z.enum(["page", "solution"]),
  title: z.string().optional(),
});
export type LessonPage = z.infer<typeof pageSchema>;

export const lessonRow = z
  .object({
    id: z.uuid(),
    course_id: z.uuid(),
    position: z.number().int(),
    title: z.string(),
    summary: z.string().nullable(),
  })
  .transform((r) => ({ id: r.id, courseId: r.course_id, position: r.position, title: r.title, summary: r.summary }));
export type Lesson = z.infer<typeof lessonRow>;

export const partRow = z
  .object({
    id: z.uuid(),
    lesson_id: z.uuid(),
    position: z.number().int(),
    kind: z.enum(["video", "reading", "document", "link"]),
    title: z.string(),
    body_md: z.string().nullable(),
    video_url: z.string().nullable(),
    link_url: z.string().nullable(),
    file_path: z.string().nullable(),
    pages: z.array(pageSchema).nullable(),
    downloadable: z.boolean(),
    duration_s: z.number().int().nullable(),
  })
  .transform((r) => ({
    id: r.id,
    lessonId: r.lesson_id,
    position: r.position,
    kind: r.kind,
    title: r.title,
    bodyMd: r.body_md,
    videoUrl: r.video_url,
    linkUrl: r.link_url,
    filePath: r.file_path,
    pages: r.pages ?? [],
    downloadable: r.downloadable,
    durationS: r.duration_s,
  }));
export type LessonPart = z.infer<typeof partRow>;

export const progressRow = z
  .object({
    lesson_part_id: z.uuid(),
    status: z.enum(["started", "completed"]),
    last_page: z.number().int().nullable(),
    updated_at: z.string(),
  })
  .transform((r) => ({ partId: r.lesson_part_id, status: r.status, lastPage: r.last_page, updatedAt: r.updated_at }));
export type PartProgress = z.infer<typeof progressRow>;

/** What the viewer sends when the student moves through a part. */
export const saveProgressInput = z.object({
  partId: z.uuid(),
  page: z.number().int().min(1).max(1000),
  completed: z.boolean(),
});
export type SaveProgressInput = z.infer<typeof saveProgressInput>;

export type SaveProgressResult =
  | { readonly saved: true }
  | { readonly saved: false; readonly reason: "consent" | "not_allowed" | "error" };
