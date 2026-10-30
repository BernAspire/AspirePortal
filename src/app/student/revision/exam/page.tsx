import type { Metadata } from "next";
import { Suspense } from "react";

import { ClassesSkeleton } from "../../_components/class-ui";
import { REVISION_PATH } from "../../_components/nav-config";
import { loadRevision } from "../revision-data";

import { ExamView } from "./exam-view";

export const metadata: Metadata = { title: "Before-Exam Mode" };
const PATH = `${REVISION_PATH}/exam`;

export default function ExamPage() {
  return (
    <Suspense fallback={<ClassesSkeleton label="Before-Exam Mode" />}>
      <ExamMode />
    </Suspense>
  );
}

async function ExamMode() {
  const ctx = await loadRevision(PATH);

  return <ExamView ctx={ctx} />;
}
