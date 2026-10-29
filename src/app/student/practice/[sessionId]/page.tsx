import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { getCourses } from "@/modules/academics";
import { getPracticeSession, submitPracticeAnswer } from "@/modules/practice";
import { getQuestionVersions } from "@/modules/question-bank";

import { ClassesSkeleton } from "../../_components/class-ui";
import { PRACTICE_PATH } from "../../_components/nav-config";

import { PracticeRunner, type RunnerQuestion } from "./practice-runner";

export const metadata: Metadata = { title: "Practice" };

export default function PracticeSessionPage({ params }: PageProps<"/student/practice/[sessionId]">) {
  return (
    <Suspense fallback={<ClassesSkeleton label="your practice" />}>
      <Session params={params} />
    </Suspense>
  );
}

async function Session({ params }: { params: PageProps<"/student/practice/[sessionId]">["params"] }) {
  const { sessionId } = await params;
  const { centre } = await requirePortal("student", `${PRACTICE_PATH}/${sessionId}`);
  const data = await getPracticeSession(centre.centreId, sessionId);
  if (!data) notFound();

  const [versions, courses] = await Promise.all([
    getQuestionVersions(
      centre.centreId,
      data.items.map((i) => ({ questionId: i.questionId, version: i.version })),
    ),
    getCourses([data.session.courseId]),
  ]);
  const questions: RunnerQuestion[] = data.items.flatMap((i) => {
    const v = versions.get(`${i.questionId}:${i.version}`);
    return v
      ? [{ position: i.position, sectionTitle: v.sectionTitle, difficulty: v.difficulty, marks: v.marks, strategy: v.strategy, ref: v.ref, content: v.content }]
      : [];
  });

  return (
    <PracticeRunner
      sessionId={data.session.id}
      courseName={courses[0]?.name ?? "Practice"}
      questions={questions}
      initialResults={[...data.results.values()]}
      setupHref={`${PRACTICE_PATH}?course=${data.session.courseId}`}
      submit={submitPracticeAnswer}
    />
  );
}
