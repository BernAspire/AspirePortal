import { describe, expect, it } from "vitest";

import type { Lesson, LessonPart, PartProgress } from "./schema";
import { courseProgress, lessonStatus, nextProgress, partDescription, resumePage, summariseLessons } from "./service";

const lesson = (id: string, position: number): Lesson => ({ id, courseId: "c", position, title: `L${position}`, summary: null });
const part = (id: string, lessonId: string, position: number, pages = 3, title = "Lesson slides"): LessonPart => ({
  id,
  lessonId,
  position,
  kind: "document",
  title,
  bodyMd: null,
  videoUrl: null,
  linkUrl: null,
  filePath: "x.pdf",
  pages: Array.from({ length: pages }, (_, i) => ({ path: `p${i}`, role: "page" as const })),
  downloadable: false,
  durationS: null,
});
const prog = (partId: string, status: "started" | "completed", lastPage: number | null = null): PartProgress => ({
  partId,
  status,
  lastPage,
  updatedAt: "2026-10-29T00:00:00Z",
});

describe("lessonStatus", () => {
  const parts = [part("a", "l1", 1), part("b", "l1", 2)];

  it("is not started without progress", () => {
    expect(lessonStatus(parts, new Map())).toBe("not_started");
    expect(lessonStatus([], new Map())).toBe("not_started");
  });

  it("is in progress once any part is touched", () => {
    expect(lessonStatus(parts, new Map([["a", prog("a", "started")]]))).toBe("in_progress");
    expect(lessonStatus(parts, new Map([["a", prog("a", "completed")]]))).toBe("in_progress");
  });

  it("is completed when every part is", () => {
    const m = new Map([["a", prog("a", "completed")], ["b", prog("b", "completed")]]);
    expect(lessonStatus(parts, m)).toBe("completed");
  });
});

describe("summariseLessons and courseProgress", () => {
  it("orders lessons and counts completed parts", () => {
    const lessons = [lesson("l2", 2), lesson("l1", 1)];
    const parts = [part("b", "l1", 2), part("a", "l1", 1), part("c", "l2", 1)];
    const progress = new Map([["a", prog("a", "completed")], ["b", prog("b", "completed")], ["c", prog("c", "started")]]);
    const s = summariseLessons(lessons, parts, progress);
    expect(s.map((x) => x.lesson.id)).toEqual(["l1", "l2"]);
    expect(s[0].parts.map((p) => p.id)).toEqual(["a", "b"]);
    expect(s.map((x) => x.status)).toEqual(["completed", "in_progress"]);
    expect(courseProgress(s)).toEqual({ percent: 67, lessonsDone: 1, lessons: 2 });
  });

  it("handles an empty course", () => {
    expect(courseProgress([])).toEqual({ percent: 0, lessonsDone: 0, lessons: 0 });
  });
});

describe("partDescription", () => {
  it("counts slides or pages", () => {
    expect(partDescription(part("a", "l", 1, 80))).toBe("Lesson slides · 80 slides");
    expect(partDescription(part("a", "l", 1, 1, "Worksheet"))).toBe("Worksheet · 1 page");
  });
});

describe("resumePage", () => {
  it("returns the last page, clamped", () => {
    const p = part("a", "l", 1, 10);
    expect(resumePage(p, undefined)).toBe(1);
    expect(resumePage(p, prog("a", "started", 4))).toBe(4);
    expect(resumePage(p, prog("a", "started", 99))).toBe(10);
  });
});

describe("nextProgress", () => {
  it("keeps the furthest page and completes at the end", () => {
    expect(nextProgress(10, 3, null)).toEqual({ lastPage: 3, completed: false });
    expect(nextProgress(10, 2, { lastPage: 5, status: "started" })).toEqual({ lastPage: 5, completed: false });
    expect(nextProgress(10, 10, { lastPage: 5, status: "started" })).toEqual({ lastPage: 10, completed: true });
  });

  it("never un-completes", () => {
    expect(nextProgress(10, 1, { lastPage: 10, status: "completed" })).toEqual({ lastPage: 10, completed: true });
  });

  it("clamps to the page count", () => {
    expect(nextProgress(3, 9, null)).toEqual({ lastPage: 3, completed: true });
  });
});
