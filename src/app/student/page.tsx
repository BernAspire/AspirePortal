import type { Metadata } from "next";
import { Suspense } from "react";

import { STUDENT_HOME_PATH } from "@/lib/auth/routing";
import { requirePortal } from "@/lib/auth/session";
import { formatSingapore, inSingapore, singaporeDate } from "@/lib/time";
import { getCourses, getLevelName, getStudentCourses, getSubjects } from "@/modules/academics";
import { getBranch, getMyStudent } from "@/modules/crm";
import { getContinueLearning } from "@/modules/elearning";
import { getActiveEntitlements } from "@/modules/programmes";

import { HomeView } from "./_components/home-view";
import { LEARN_PATH } from "./_components/nav-config";
import { greetingFor, homeCourses, homeProgrammes, selectedSubjectId } from "./home-model";
import { HomeSkeleton } from "./home-skeleton";

export const metadata: Metadata = { title: "Home" };

export default function StudentHomePage({ searchParams }: PageProps<"/student">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <StudentHome searchParams={searchParams} />
    </Suspense>
  );
}

async function StudentHome({ searchParams }: { searchParams: PageProps<"/student">["searchParams"] }) {
  const { centre } = await requirePortal("student", STUDENT_HOME_PATH);
  const student = await getMyStudent(centre.centreId);

  if (!student) {
    return (
      <section className="rounded-[14px] border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">Your account isn&apos;t linked to a student yet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Please ask {centre.centreName} to finish setting up your account.
        </p>
      </section>
    );
  }

  const now = new Date();
  const today = singaporeDate(now);
  const [entitlements, studentCourses, levelName, branch, params, continueLearning] = await Promise.all([
    getActiveEntitlements(centre.centreId, student.id),
    getStudentCourses(centre.centreId, student.id),
    getLevelName(student.levelId),
    student.defaultBranchId ? getBranch(centre.centreId, student.defaultBranchId) : Promise.resolve(null),
    searchParams,
    getContinueLearning(centre.centreId, student.id),
  ]);

  const courseIds = [...new Set(entitlements.flatMap((e) => e.courseIds))];
  const allCourses = homeCourses(
    entitlements,
    await getCourses(courseIds),
    new Set(studentCourses.filter((c) => c.isCurrent).map((c) => c.courseId)),
  );
  const subjects = await getSubjects([...new Set(allCourses.map((c) => c.subjectId))]);
  const requested = typeof params.subject === "string" ? params.subject : undefined;
  const subjectId = selectedSubjectId(
    subjects.map((s) => s.id),
    allCourses,
    requested,
  );
  const courses = subjectId ? allCourses.filter((c) => c.subjectId === subjectId) : allCourses;
  const current = allCourses.find((c) => c.isCurrent) ?? null;

  return (
    <HomeView
      greeting={greetingFor(inSingapore(now).getHours())}
      displayName={student.displayName}
      dateLine={[formatSingapore(now, "EEEE, d MMM"), levelName].filter(Boolean).join(" · ")}
      centreName={centre.centreName}
      subjects={subjects.map((s) => ({
        id: s.id,
        name: s.name,
        href: `${STUDENT_HOME_PATH}?subject=${s.id}`,
        selected: s.id === subjectId,
      }))}
      currentCourseName={current?.courseName ?? null}
      courses={courses}
      programmes={homeProgrammes(entitlements, today)}
      branch={branch ? { ...branch, isDefault: true } : null}
      learnHref={LEARN_PATH}
      continueLearning={
        continueLearning
          ? {
              eyebrow: `WEEK ${continueLearning.lessonPosition} · ${continueLearning.partTitle.toUpperCase()} · ${continueLearning.page} OF ${continueLearning.pageCount}`,
              title: continueLearning.lessonTitle,
              percent: Math.round((continueLearning.page / Math.max(continueLearning.pageCount, 1)) * 100),
              href: `${LEARN_PATH}/${continueLearning.lessonId}?part=${continueLearning.partPosition}&page=${continueLearning.page}`,
            }
          : null
      }
    />
  );
}
