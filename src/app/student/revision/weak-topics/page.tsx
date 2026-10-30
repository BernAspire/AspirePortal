import type { Metadata } from "next";
import { Suspense } from "react";

import { ClassesSkeleton } from "../../_components/class-ui";
import { REVISION_PATH } from "../../_components/nav-config";
import { loadRevision } from "../revision-data";

import { WeakTopicsView } from "./weak-view";

export const metadata: Metadata = { title: "Weak Topics" };
const PATH = `${REVISION_PATH}/weak-topics`;

export default function WeakTopicsPage({ searchParams }: PageProps<"/student/revision/weak-topics">) {
  return (
    <Suspense fallback={<ClassesSkeleton label="your weak topics" />}>
      <WeakTopics searchParams={searchParams} />
    </Suspense>
  );
}

async function WeakTopics({ searchParams }: { searchParams: PageProps<"/student/revision/weak-topics">["searchParams"] }) {
  const [ctx, params] = await Promise.all([loadRevision(PATH), searchParams]);

  return <WeakTopicsView ctx={ctx} params={params} />;
}
