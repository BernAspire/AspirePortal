import type { Metadata } from "next";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { getCourses, getStudentCourses } from "@/modules/academics";
import { getMyStudent } from "@/modules/crm";
import { courseProgress, getCourseLessons, summariseLessons } from "@/modules/elearning";
import { getMyRewards, levelFor } from "@/modules/engagement";
import { accuracyPercent, getSectionStats, weakestFirst } from "@/modules/practice";
import { getActiveEntitlements } from "@/modules/programmes";
import { getPracticeTopics } from "@/modules/question-bank";
import { attendanceSummary, getBookedSessions } from "@/modules/scheduling";

import { ClassesSkeleton } from "../_components/class-ui";
import { LEARN_PATH, PRACTICE_PATH, PROGRESS_PATH, REWARDS_PATH } from "../_components/nav-config";
import { homeCourses } from "../home-model";

import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage({ searchParams }: PageProps<"/student/progress">) {
  return (
    <Suspense fallback={<ClassesSkeleton label="your progress" />}>
      <Progress searchParams={searchParams} />
    </Suspense>
  );
}

async function Progress({ searchParams }: { searchParams: PageProps<"/student/progress">["searchParams"] }) {
  const { centre } = await requirePortal("student", PROGRESS_PATH);
  const student = await getMyStudent(centre.centreId);
  const now = new Date();
  const [entitlements, studentCourses, params, rewards, sessions] = await Promise.all([
    student ? getActiveEntitlements(centre.centreId, student.id) : Promise.resolve([]),
    student ? getStudentCourses(centre.centreId, student.id) : Promise.resolve([]),
    searchParams,
    getMyRewards(centre.centreId).catch(() => null),
    student ? getBookedSessions(centre.centreId, student.id, undefined, now.toISOString()) : Promise.resolve([]),
  ]);
  const courses = homeCourses(
    entitlements,
    await getCourses([...new Set(entitlements.flatMap((e) => e.courseIds))]),
    new Set(studentCourses.filter((c) => c.isCurrent).map((c) => c.courseId)),
  );
  const requested = typeof params.course === "string" ? params.course : undefined;
  const selected = courses.find((c) => c.courseId === requested) ?? courses[0];

  const [lessonData, topics, stats] =
    selected && student
      ? await Promise.all([
          getCourseLessons(centre.centreId, selected.courseId, student.id),
          getPracticeTopics(centre.centreId, selected.courseId),
          getSectionStats(centre.centreId, selected.courseId),
        ])
      : [null, [], new Map<string, { tried: number; correct: number }>()];
  const lessons = lessonData
    ? courseProgress(summariseLessons(lessonData.lessons, lessonData.parts, lessonData.progress))
    : { percent: 0, lessonsDone: 0, lessons: 0 };
  const sections = weakestFirst(
    topics.flatMap((t) =>
      t.sections.map((s) => {
        const st = stats.get(s.id) ?? { tried: 0, correct: 0 };
        return { id: s.id, title: s.title, tried: st.tried, correct: st.correct, accuracy: accuracyPercent(st.tried, st.correct) };
      }),
    ),
  );
  const tried = sections.reduce((n, s) => n + s.tried, 0);
  const correct = sections.reduce((n, s) => n + s.correct, 0);
  const attendance = attendanceSummary(sessions, now);
  const level = levelFor(rewards?.totalXp ?? 0);

  return (
    <ProgressView
      courseName={selected?.courseName ?? null}
      centreName={centre.centreName}
      courses={courses.map((c) => ({
        id: c.courseId,
        name: c.courseName,
        href: `${PROGRESS_PATH}?course=${c.courseId}`,
        selected: c.courseId === selected?.courseId,
      }))}
      lessons={{ percent: lessons.percent, done: lessons.lessonsDone, total: lessons.lessons }}
      practice={{ accuracy: accuracyPercent(tried, correct), answered: tried }}
      attendance={{ rate: attendance.ratePercent, marked: attendance.marked }}
      level={{ level: level.level, name: level.name, streak: rewards?.currentStreak ?? 0 }}
      topics={sections}
      learnHref={selected ? `${LEARN_PATH}?course=${selected.courseId}` : LEARN_PATH}
      practiceHref={selected ? `${PRACTICE_PATH}?course=${selected.courseId}` : PRACTICE_PATH}
      rewardsHref={REWARDS_PATH}
    />
  );
}
