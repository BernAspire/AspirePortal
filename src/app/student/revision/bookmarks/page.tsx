import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { cn } from "@/lib/utils";
import { listCurrentQuestions, QuestionBlocks, questionLabel } from "@/modules/question-bank";
import { getBookmarks, setBookmark, startBookmarkPractice } from "@/modules/revision";

import { ClassesSkeleton, EmptyState } from "../../_components/class-ui";
import { REVISION_PATH } from "../../_components/nav-config";
import { ActionButton, PractiseBookmarksButton } from "../revision-client";
import { loadRevision, subjectOf } from "../revision-data";
import { focus, panel, RevisionEmpty, RevisionHeader, RevisionNav } from "../revision-ui";

export const metadata: Metadata = { title: "Bookmark Review" };
const PATH = `${REVISION_PATH}/bookmarks`;

export default function BookmarksPage({ searchParams }: PageProps<"/student/revision/bookmarks">) {
  return (
    <Suspense fallback={<ClassesSkeleton label="your bookmarks" />}>
      <Bookmarks searchParams={searchParams} />
    </Suspense>
  );
}

async function Bookmarks({ searchParams }: { searchParams: PageProps<"/student/revision/bookmarks">["searchParams"] }) {
  const [ctx, params] = await Promise.all([loadRevision(PATH), searchParams]);
  const r = ctx.revision;
  if (!r || !ctx.student) return <EmptyState title="No bookmarks yet">Your student record isn&apos;t set up. Please contact {ctx.centreName}.</EmptyState>;

  const bookmarks = await getBookmarks(ctx.centreId, ctx.student.id);
  const unresolved = bookmarks.filter((b) => !b.resolved);
  // Current versions of the bookmarked questions the student can still read.
  const views = await listCurrentQuestions(ctx.centreId, unresolved.map((b) => b.questionId));
  const sectionId = typeof params.section === "string" ? params.section : null;
  const section = r.sections.find((s) => s.sectionId === sectionId) ?? null;
  const shown = views.filter((v) => !section || v.sectionId === section.sectionId);
  const byCourse = [...new Set(shown.map((v) => v.courseId))];

  return (
    <div className="flex flex-col gap-[18px]">
      <RevisionNav active="bookmarks" />
      <RevisionHeader title="Bookmark Review">
        <div className="text-right">
          <div className="font-bold">{unresolved.length} unresolved</div>
          <div className="text-[13px] text-[#3D4146]">{bookmarks.length - unresolved.length} resolved</div>
        </div>
      </RevisionHeader>

      {section ? (
        <p className="text-sm">
          Showing <strong>{section.title}</strong> ·{" "}
          <Link href={PATH} className={cn("font-semibold text-[#8A5A00]", focus)}>
            show all
          </Link>
        </p>
      ) : null}

      {shown.length === 0 ? (
        <RevisionEmpty icon={<span className="text-4xl">🔖</span>}>
          No unresolved bookmarks. You&apos;re all caught up!
          <span className="text-sm">Tap the bookmark on a practice question to save it for later.</span>
        </RevisionEmpty>
      ) : (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            {byCourse.map((courseId) => (
              <PractiseBookmarksButton
                key={courseId}
                courseId={courseId}
                sectionId={section?.sectionId ?? null}
                label={`Practise ${byCourse.length > 1 ? subjectOf(ctx.courseNames.get(courseId) ?? "") + " " : ""}bookmarks`}
                start={startBookmarkPractice}
              />
            ))}
          </div>
          <ul className="flex flex-col gap-3">
            {shown.map((v) => (
              <li key={v.id} className={cn(panel, "flex flex-col gap-3 px-5 py-4")}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2 font-semibold text-[#3D4146]">
                    <span className="rounded-md bg-foreground px-2 py-0.5 text-sm font-bold text-white">{questionLabel(v.ref)}</span>
                    {v.sectionTitle}
                  </span>
                  <ActionButton
                    run={setBookmark.bind(null, { questionId: v.id, on: false })}
                    label="Remove bookmark"
                    pendingLabel="Removing…"
                    className="text-[13px] font-semibold text-[#9B1C1C] underline-offset-4 hover:underline"
                  />
                </div>
                <QuestionBlocks blocks={v.content.blocks} className="text-base" />
              </li>
            ))}
          </ul>
          <p className="text-center text-xs text-muted-foreground">A bookmark is resolved when you answer that question correctly in practice.</p>
        </>
      )}
    </div>
  );
}
