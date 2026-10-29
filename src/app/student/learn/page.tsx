import type { Metadata } from "next";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { getCourses, getStudentCourses } from "@/modules/academics";
import { getMyStudent } from "@/modules/crm";
import { courseProgress, getCourseLessons, partDescription, summariseLessons } from "@/modules/elearning";
import { getActiveEntitlements } from "@/modules/programmes";

import { LEARN_PATH } from "../_components/nav-config";
import { homeCourses } from "../home-model";
import { HomeSkeleton } from "../home-skeleton";

import { LearnView } from "./learn-view";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage({ searchParams }: PageProps<"/student/learn">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Learn searchParams={searchParams} />
    </Suspense>
  );
}

async function Learn({ searchParams }: { searchParams: PageProps<"/student/learn">["searchParams"] }) {
  const { centre } = await requirePortal("student", LEARN_PATH);
  const student = await getMyStudent(centre.centreId);
  if (!student) {
    return <LearnView courseName={null} courses={[]} progress={{ percent: 0, lessonsDone: 0, lessons: 0 }} lessons={[]} centreName={centre.centreName} />;
  }

  const [entitlements, studentCourses, params] = await Promise.all([
    getActiveEntitlements(centre.centreId, student.id),
    getStudentCourses(centre.centreId, student.id),
    searchParams,
  ]);
  const courses = homeCourses(
    entitlements,
    await getCourses([...new Set(entitlements.flatMap((e) => e.courseIds))]),
    new Set(studentCourses.filter((c) => c.isCurrent).map((c) => c.courseId)),
  );
  const requested = typeof params.course === "string" ? params.course : undefined;
  const selected = courses.find((c) => c.courseId === requested) ?? courses[0];

  if (!selected) {
    return <LearnView courseName={null} courses={[]} progress={{ percent: 0, lessonsDone: 0, lessons: 0 }} lessons={[]} centreName={centre.centreName} />;
  }

  const { lessons, parts, progress } = await getCourseLessons(centre.centreId, selected.courseId, student.id);
  const summaries = summariseLessons(lessons, parts, progress);

  return (
    <LearnView
      courseName={selected.courseName}
      centreName={centre.centreName}
      courses={courses.map((c) => ({
        id: c.courseId,
        name: c.courseName,
        href: `${LEARN_PATH}?course=${c.courseId}`,
        selected: c.courseId === selected.courseId,
      }))}
      progress={courseProgress(summaries)}
      lessons={summaries.map((s) => ({
        id: s.lesson.id,
        position: s.lesson.position,
        title: s.lesson.title,
        status: s.status,
        partsLine: s.parts.map(partDescription).join(" · ") || "No parts yet",
        href: `${LEARN_PATH}/${s.lesson.id}`,
      }))}
    />
  );
}
