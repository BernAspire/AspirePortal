import type { Metadata } from "next";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { getMyStudent } from "@/modules/crm";
import { getBookedSessions, getMyClasses } from "@/modules/scheduling";

import { ClassesSkeleton } from "../_components/class-ui";
import { MY_CLASSES_PATH } from "../_components/nav-config";

import { MyClassesView } from "./classes-view";

export const metadata: Metadata = { title: "My Classes" };

export default function MyClassesPage() {
  return (
    <Suspense fallback={<ClassesSkeleton label="your classes" />}>
      <MyClasses />
    </Suspense>
  );
}

async function MyClasses() {
  const { centre } = await requirePortal("student", MY_CLASSES_PATH);
  const student = await getMyStudent(centre.centreId);
  const now = new Date();
  const [classes, upcoming] = student
    ? await Promise.all([
        getMyClasses(centre.centreId, student.id),
        getBookedSessions(centre.centreId, student.id, now.toISOString()),
      ])
    : [[], []];
  return <MyClassesView classes={classes} upcoming={upcoming} now={now} centreName={centre.centreName} />;
}
