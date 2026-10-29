import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { getCourses } from "@/modules/academics";
import { getMyStudent } from "@/modules/crm";
import {
  getLesson,
  resumePage,
  saveLessonProgress,
  signDownloadUrl,
  signPageUrls,
  type LessonPart,
} from "@/modules/elearning";

import { LEARN_PATH } from "../../_components/nav-config";

import { PageViewer } from "./page-viewer";

export const metadata: Metadata = { title: "Lesson" };

export default function LessonPage({ params, searchParams }: PageProps<"/student/learn/[lessonId]">) {
  return (
    <Suspense fallback={<LessonSkeleton />}>
      <Lesson params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Lesson({
  params,
  searchParams,
}: {
  params: PageProps<"/student/learn/[lessonId]">["params"];
  searchParams: PageProps<"/student/learn/[lessonId]">["searchParams"];
}) {
  const [{ lessonId }, query] = await Promise.all([params, searchParams]);
  const { centre } = await requirePortal("student", `${LEARN_PATH}/${lessonId}`);
  const student = await getMyStudent(centre.centreId);
  if (!student) notFound();

  // RLS returns the lesson only if it is published and the student's programme covers it today.
  const data = await getLesson(centre.centreId, lessonId, student.id);
  if (!data || data.parts.length === 0) notFound();
  const { lesson, parts, progress } = data;
  const [course] = await getCourses([lesson.courseId]);

  const requestedPart = Number(typeof query.part === "string" ? query.part : NaN);
  const part =
    parts.find((p) => p.position === requestedPart) ??
    parts.find((p) => progress.get(p.id)?.status !== "completed") ??
    parts[0];

  const requestedPage = Number(typeof query.page === "string" ? query.page : NaN);
  const startPage = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : resumePage(part, progress.get(part.id));

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <Link href={`${LEARN_PATH}?course=${lesson.courseId}`} className="font-semibold text-brand-ink hover:underline">
          ‹ {course?.name ?? "Learn"}
        </Link>
      </nav>
      <header>
        <p className="text-xs font-bold tracking-[.06em] text-[#7A4B00]">WEEK {lesson.position}</p>
        <h1 className="text-2xl font-semibold leading-tight">{lesson.title}</h1>
      </header>

      {parts.length > 1 ? (
        <nav aria-label="Lesson parts" className="flex flex-wrap gap-2 border-b border-border">
          {parts.map((p) => {
            const done = progress.get(p.id)?.status === "completed";
            return (
              <Link
                key={p.id}
                href={`?part=${p.position}`}
                aria-current={p.id === part.id ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[15px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  p.id === part.id ? "border-brand font-semibold" : "border-transparent text-[#3D4146] hover:text-foreground",
                )}
              >
                {p.title}
                {done ? (
                  <span className="text-[#1F9D55]" aria-label="completed">
                    ✓
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <PartContent key={part.id} part={part} startPage={startPage} fileName={`${course?.name ?? "Lesson"} - Week ${lesson.position} - ${lesson.title}`} />
    </div>
  );
}

async function PartContent({ part, startPage, fileName }: { part: LessonPart; startPage: number; fileName: string }) {
  if (part.kind === "document" && part.pages.length > 0) {
    const [urls, downloadUrl] = await Promise.all([
      signPageUrls(part.pages.map((p) => p.path)),
      signDownloadUrl(part, `${fileName} - ${part.title}.pdf`),
    ]);
    const noun = part.title.toLowerCase().includes("slide") ? "slide" : "page";
    return (
      <PageViewer
        partId={part.id}
        noun={noun}
        startPage={Math.min(startPage, part.pages.length)}
        downloadUrl={downloadUrl}
        save={saveLessonProgress}
        pages={part.pages.map((p, i) => ({
          url: urls.get(p.path) ?? null,
          role: p.role,
          title: p.title ?? `${noun === "slide" ? "Slide" : "Page"} ${i + 1}`,
        }))}
      />
    );
  }

  if (part.kind === "video" && part.videoUrl) {
    return (
      <section className="rounded-[14px] border border-border bg-card p-5">
        <a
          href={part.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold hover:bg-brand-strong"
        >
          Watch the video
        </a>
      </section>
    );
  }

  if (part.kind === "reading" && part.bodyMd) {
    return (
      <section className="rounded-[14px] border border-border bg-card p-5 text-[15px] leading-relaxed whitespace-pre-line">
        {part.bodyMd}
      </section>
    );
  }

  return (
    <section className="rounded-[14px] border border-border bg-card p-5 text-sm text-muted-foreground">
      This part isn&apos;t available yet.
    </section>
  );
}

function LessonSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">Loading the lesson…</span>
      <div className="h-4 w-40 animate-pulse rounded bg-muted" aria-hidden />
      <div className="h-8 w-72 animate-pulse rounded bg-muted" aria-hidden />
      <div className="aspect-video w-full animate-pulse rounded-[14px] bg-muted" aria-hidden />
    </div>
  );
}
