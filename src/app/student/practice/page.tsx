import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { formatSingapore } from "@/lib/time";
import { getCourses, getStudentCourses, getSubjects } from "@/modules/academics";
import { getMyStudent } from "@/modules/crm";
import { accuracyPercent, getRecentPractice, getSectionStats, startPractice, weakestFirst } from "@/modules/practice";
import { getActiveEntitlements } from "@/modules/programmes";
import { getCoursesWithQuestions, getPracticeTopics } from "@/modules/question-bank";

import { ClassesSkeleton, EmptyState } from "../_components/class-ui";
import { PRACTICE_PATH } from "../_components/nav-config";
import { homeCourses } from "../home-model";

import { PracticeSetup } from "./practice-setup";

export const metadata: Metadata = { title: "Practice" };

export default function PracticePage({ searchParams }: PageProps<"/student/practice">) {
  return (
    <Suspense fallback={<ClassesSkeleton label="practice" />}>
      <Practice searchParams={searchParams} />
    </Suspense>
  );
}

async function Practice({ searchParams }: { searchParams: PageProps<"/student/practice">["searchParams"] }) {
  const { centre } = await requirePortal("student", PRACTICE_PATH);
  const student = await getMyStudent(centre.centreId);
  if (!student) {
    return <EmptyState title="No practice yet">Your student record isn&apos;t set up. Please contact {centre.centreName}.</EmptyState>;
  }
  const [entitlements, studentCourses, params] = await Promise.all([
    getActiveEntitlements(centre.centreId, student.id),
    getStudentCourses(centre.centreId, student.id),
    searchParams,
  ]);
  const all = homeCourses(
    entitlements,
    await getCourses([...new Set(entitlements.flatMap((e) => e.courseIds))]),
    new Set(studentCourses.filter((c) => c.isCurrent).map((c) => c.courseId)),
  );
  const withQuestions = await getCoursesWithQuestions(centre.centreId, all.map((c) => c.courseId));
  const courses = all.filter((c) => withQuestions.has(c.courseId));
  const requested = typeof params.course === "string" ? params.course : undefined;
  const selected = courses.find((c) => c.courseId === requested) ?? courses[0];
  if (!selected) {
    return (
      <EmptyState title="No practice questions yet">
        Practice questions appear here for the courses in your programme once {centre.centreName} adds them.
      </EmptyState>
    );
  }

  const [topics, stats, recent, subjects] = await Promise.all([
    getPracticeTopics(centre.centreId, selected.courseId),
    getSectionStats(centre.centreId, selected.courseId),
    getRecentPractice(centre.centreId, student.id, selected.courseId),
    getSubjects([selected.subjectId]),
  ]);
  const sections = weakestFirst(
    topics.flatMap((t) =>
      t.sections.map((s) => {
        const st = stats.get(s.id) ?? { tried: 0, correct: 0 };
        return {
          id: s.id,
          title: s.title,
          topicTitle: t.title,
          questionCount: s.questionCount,
          tried: st.tried,
          correct: st.correct,
          accuracy: accuracyPercent(st.tried, st.correct),
        };
      }),
    ),
  );

  return (
    <PracticeSetup
      key={selected.courseId}
      courseId={selected.courseId}
      courseName={selected.courseName}
      subjectLabel={subjects[0]?.name ?? selected.courseName}
      courses={courses.map((c) => ({
        id: c.courseId,
        name: subjectsName(c.courseName),
        href: `${PRACTICE_PATH}?course=${c.courseId}`,
        selected: c.courseId === selected.courseId,
      }))}
      sections={sections}
      start={startPractice}
      historySlot={
        recent.length > 0 ? (
          <section aria-labelledby="recent" className="rounded-[14px] border border-border bg-card px-5 py-4">
            <h2 id="recent" className="font-display text-base font-semibold">
              Recent practice
            </h2>
            <ul className="mt-1 divide-y divide-border">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`${PRACTICE_PATH}/${r.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span>
                      {formatSingapore(r.createdAt, "EEE d MMM, h:mm aaa")} · {r.mode === "adaptive" ? "Adaptive" : "Manual"}
                    </span>
                    <span className="font-semibold">
                      {r.answered < r.total ? `${r.answered} of ${r.total} done` : `${r.correct}/${r.total} correct`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
    />
  );
}

/** Course tabs show the subject ("Primary 5 Mathematics" → "Mathematics"). */
function subjectsName(courseName: string): string {
  return courseName.replace(/^(Primary|Secondary)\s+\d+\s+|^JC\s*\d\s+/i, "");
}
