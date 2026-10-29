import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { lessonRow, partRow, progressRow, type Lesson, type LessonPart, type PartProgress } from "./schema";

const LESSON_FILES_BUCKET = "lesson-files";
/** Signed page links last long enough for a study session; reloading renews them. */
const PAGE_URL_TTL_S = 2 * 60 * 60;
const DOWNLOAD_URL_TTL_S = 5 * 60;

const PART_COLUMNS =
  "id, lesson_id, position, kind, title, body_md, video_url, link_url, file_path, pages, downloadable, duration_s";

/**
 * Reads use the student's own session: RLS returns only published lessons of
 * courses an active programme covers today, in the student's own centre.
 */
async function partsFor(centreId: string, lessonIds: readonly string[]): Promise<LessonPart[]> {
  if (lessonIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_parts")
    .select(PART_COLUMNS)
    .eq("centre_id", centreId)
    .in("lesson_id", [...lessonIds]);
  if (error) throw new Error("Could not load lesson parts.");
  return z.array(partRow).parse(data);
}

async function progressFor(centreId: string, studentId: string, partIds: readonly string[]): Promise<Map<string, PartProgress>> {
  if (partIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_part_id, status, last_page, updated_at")
    .eq("centre_id", centreId)
    .eq("student_id", studentId)
    .in("lesson_part_id", [...partIds]);
  if (error) throw new Error("Could not load your progress.");
  return new Map(z.array(progressRow).parse(data).map((p) => [p.partId, p]));
}

export const getCourseLessons = cache(
  async (
    centreId: string,
    courseId: string,
    studentId: string,
  ): Promise<{ lessons: Lesson[]; parts: LessonPart[]; progress: Map<string, PartProgress> }> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("course_lessons")
      .select("id, course_id, position, title, summary")
      .eq("centre_id", centreId)
      .eq("course_id", courseId)
      .eq("status", "published")
      .order("position");
    if (error) throw new Error("Could not load lessons.");
    const lessons = z.array(lessonRow).parse(data);
    const parts = await partsFor(centreId, lessons.map((l) => l.id));
    const progress = await progressFor(centreId, studentId, parts.map((p) => p.id));
    return { lessons, parts, progress };
  },
);

export const getLesson = cache(
  async (
    centreId: string,
    lessonId: string,
    studentId: string,
  ): Promise<{ lesson: Lesson; parts: LessonPart[]; progress: Map<string, PartProgress> } | null> => {
    if (!z.uuid().safeParse(lessonId).success) return null;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("course_lessons")
      .select("id, course_id, position, title, summary")
      .eq("centre_id", centreId)
      .eq("id", lessonId)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error("Could not load the lesson.");
    if (!data) return null;
    const lesson = lessonRow.parse(data);
    const parts = (await partsFor(centreId, [lesson.id])).sort((a, b) => a.position - b.position);
    const progress = await progressFor(centreId, studentId, parts.map((p) => p.id));
    return { lesson, parts, progress };
  },
);

/** Short-lived links to page images. Storage checks the same rules as the tables. */
export async function signPageUrls(paths: readonly string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(LESSON_FILES_BUCKET).createSignedUrls([...paths], PAGE_URL_TTL_S);
  if (error || !data) throw new Error("Could not open the lesson pages.");
  const urls = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

/** A download link for a part's PDF, only when the part is downloadable (enforced in Storage too). */
export async function signDownloadUrl(part: LessonPart, fileName: string): Promise<string | null> {
  if (!part.downloadable || !part.filePath) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(LESSON_FILES_BUCKET)
    .createSignedUrl(part.filePath, DOWNLOAD_URL_TTL_S, { download: fileName });
  if (error || !data) return null;
  return data.signedUrl;
}

export interface ContinueLearning {
  readonly lessonId: string;
  readonly lessonTitle: string;
  readonly lessonPosition: number;
  readonly courseId: string;
  readonly partId: string;
  readonly partTitle: string;
  readonly partPosition: number;
  readonly page: number;
  readonly pageCount: number;
}

/** The part the student touched most recently and hasn't finished, if any. */
export const getContinueLearning = cache(
  async (centreId: string, studentId: string): Promise<ContinueLearning | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lesson_progress")
      .select("lesson_part_id, status, last_page, updated_at")
      .eq("centre_id", centreId)
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) throw new Error("Could not load your progress.");
    const recent = z.array(progressRow).parse(data);
    const target = recent.find((p) => p.status !== "completed");
    if (!target) return null;

    const { data: partData, error: partError } = await supabase
      .from("lesson_parts")
      .select(PART_COLUMNS)
      .eq("centre_id", centreId)
      .eq("id", target.partId)
      .maybeSingle();
    if (partError || !partData) return null; // e.g. the programme has since expired
    const part = partRow.parse(partData);

    const { data: lessonData } = await supabase
      .from("course_lessons")
      .select("id, course_id, position, title, summary")
      .eq("centre_id", centreId)
      .eq("id", part.lessonId)
      .maybeSingle();
    if (!lessonData) return null;
    const lesson = lessonRow.parse(lessonData);

    return {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      lessonPosition: lesson.position,
      courseId: lesson.courseId,
      partId: part.id,
      partTitle: part.title,
      partPosition: part.position,
      page: Math.min(target.lastPage ?? 1, Math.max(part.pages.length, 1)),
      pageCount: part.pages.length,
    };
  },
);
