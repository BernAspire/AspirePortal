import type { Lesson, LessonPart, PartProgress } from "./schema";

export type LessonStatus = "not_started" | "in_progress" | "completed";

export interface LessonSummary {
  readonly lesson: Lesson;
  readonly parts: readonly LessonPart[];
  readonly status: LessonStatus;
  readonly partsDone: number;
}

/** A lesson is completed when every part is, in progress once any part is started. */
export function lessonStatus(parts: readonly LessonPart[], progress: ReadonlyMap<string, PartProgress>): LessonStatus {
  if (parts.length === 0) return "not_started";
  const done = parts.filter((p) => progress.get(p.id)?.status === "completed").length;
  if (done === parts.length) return "completed";
  return parts.some((p) => progress.has(p.id)) ? "in_progress" : "not_started";
}

export function summariseLessons(
  lessons: readonly Lesson[],
  parts: readonly LessonPart[],
  progress: ReadonlyMap<string, PartProgress>,
): LessonSummary[] {
  return [...lessons]
    .sort((a, b) => a.position - b.position)
    .map((lesson) => {
      const own = parts.filter((p) => p.lessonId === lesson.id).sort((a, b) => a.position - b.position);
      return {
        lesson,
        parts: own,
        status: lessonStatus(own, progress),
        partsDone: own.filter((p) => progress.get(p.id)?.status === "completed").length,
      };
    });
}

/** Course progress as whole-number percent of parts completed, plus lessons completed. */
export function courseProgress(summaries: readonly LessonSummary[]): {
  percent: number;
  lessonsDone: number;
  lessons: number;
} {
  const totalParts = summaries.reduce((n, s) => n + s.parts.length, 0);
  const doneParts = summaries.reduce((n, s) => n + s.partsDone, 0);
  return {
    percent: totalParts === 0 ? 0 : Math.round((doneParts / totalParts) * 100),
    lessonsDone: summaries.filter((s) => s.status === "completed").length,
    lessons: summaries.length,
  };
}

/** Human description of a part, e.g. "Lesson slides · 80 slides". */
export function partDescription(part: LessonPart): string {
  if (part.kind === "document") {
    const n = part.pages.length;
    const noun = part.title.toLowerCase().includes("slide") ? "slide" : "page";
    return `${part.title} · ${n} ${noun}${n === 1 ? "" : "s"}`;
  }
  return part.title;
}

/** The page to open a part on: where the student left off, within range. */
export function resumePage(part: LessonPart, progress: PartProgress | undefined): number {
  const max = Math.max(part.pages.length, 1);
  const last = progress?.lastPage ?? 1;
  return Math.min(Math.max(last, 1), max);
}

/**
 * Progress to save when the student reaches `page`: never go backwards on the
 * furthest page reached, and once completed, stay completed.
 */
export function nextProgress(
  pageCount: number,
  page: number,
  previous: { lastPage: number | null; status: "started" | "completed" } | null,
): { lastPage: number; completed: boolean } {
  const lastPage = Math.max(page, previous?.lastPage ?? 1);
  const completed = previous?.status === "completed" || (pageCount > 0 && page >= pageCount);
  return { lastPage: Math.min(lastPage, Math.max(pageCount, 1)), completed };
}
