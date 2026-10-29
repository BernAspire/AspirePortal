import type { Metadata } from "next";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { getMyStudent } from "@/modules/crm";
import { getBookedSessions } from "@/modules/scheduling";

import { ClassesSkeleton } from "../_components/class-ui";
import { TUTORIALS_PATH } from "../_components/nav-config";

import { TutorialsView } from "./tutorials-view";

export const metadata: Metadata = { title: "Tutorials" };

export default function TutorialsPage() {
  return (
    <Suspense fallback={<ClassesSkeleton label="your tutorials" />}>
      <Tutorials />
    </Suspense>
  );
}

async function Tutorials() {
  const { centre } = await requirePortal("student", TUTORIALS_PATH);
  const student = await getMyStudent(centre.centreId);
  const now = new Date();
  const all = student ? await getBookedSessions(centre.centreId, student.id) : [];
  return <TutorialsView all={all} now={now} centreName={centre.centreName} />;
}
