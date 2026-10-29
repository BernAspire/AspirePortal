import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STUDENT_HOME_PATH } from "@/lib/auth/routing";
import { requirePortal } from "@/lib/auth/session";
import { formatDateOnly } from "@/lib/time";
import { getCourses, getLevelName, getStudentCourses } from "@/modules/academics";
import { getMyStudent } from "@/modules/crm";
import { getActiveEntitlements, PROGRAMME_KIND_LABELS } from "@/modules/programmes";

import { homeCourses, type HomeCourse } from "./home-model";
import { HomeSkeleton } from "./home-skeleton";

export const metadata: Metadata = { title: "Home" };

export default function StudentHomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <StudentHome />
    </Suspense>
  );
}

async function StudentHome() {
  const { centre } = await requirePortal("student", STUDENT_HOME_PATH);
  const student = await getMyStudent(centre.centreId);

  if (!student) {
    return (
      <Notice title="Your account isn't linked to a student yet">
        Please ask {centre.centreName} to finish setting up your account.
      </Notice>
    );
  }

  const [entitlements, studentCourses, levelName] = await Promise.all([
    getActiveEntitlements(centre.centreId, student.id),
    getStudentCourses(centre.centreId, student.id),
    getLevelName(student.levelId),
  ]);
  const courseIds = [...new Set(entitlements.flatMap((e) => e.courseIds))];
  const courses = homeCourses(
    entitlements,
    await getCourses(courseIds),
    new Set(studentCourses.filter((c) => c.isCurrent).map((c) => c.courseId)),
  );

  return (
    <div className="grid gap-6">
      <section className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {student.displayName}</h1>
        <p className="text-sm text-muted-foreground">
          {[levelName, centre.centreName].filter(Boolean).join(" · ")}
        </p>
      </section>

      <section aria-labelledby="courses-heading" className="grid gap-3">
        <h2 id="courses-heading" className="text-lg font-semibold">
          Your courses
        </h2>
        {courses.length === 0 ? (
          <Notice title="No active programmes">
            You don&apos;t have access to any courses right now. If you think this is wrong,
            please contact {centre.centreName}.
          </Notice>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {courses.map((course) => (
              <li key={course.courseId}>
                <CourseCard course={course} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CourseCard({ course }: { course: HomeCourse }) {
  return (
    <Card className="h-full gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <h3>{course.courseName}</h3>
          {course.isCurrent ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              Current
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>Access until {formatDateOnly(course.accessUntil)}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {course.programmes.map((p) => (
            <li key={`${p.name}-${p.kind}`} className="rounded-md border px-2 py-0.5">
              {PROGRAMME_KIND_LABELS[p.kind]}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>
          <h2 className="text-base">{title}</h2>
        </CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}
