import type { Metadata } from "next";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";

import { cn } from "@/lib/utils";

import { ClassesSkeleton } from "../../_components/class-ui";
import { REVISION_PATH } from "../../_components/nav-config";
import { focus, RevisionEmpty, RevisionHeader, RevisionNav } from "../revision-ui";

export const metadata: Metadata = { title: "Revision Materials" };

const KINDS = ["All", "Study Guide", "Formula Sheet", "Flashcards", "Mind Map"];

/** Revision materials come later (owner decision 30 Oct 2026); the tab shows the planned kinds. */
export default function MaterialsPage() {
  return (
    <Suspense fallback={<ClassesSkeleton label="revision materials" />}>
      <Materials />
    </Suspense>
  );
}

async function Materials() {
  await requirePortal("student", `${REVISION_PATH}/materials`);
  return (
    <div className="flex flex-col gap-[18px]">
      <RevisionNav active="materials" />
      <RevisionHeader title="Revision Materials" />
      <div className="flex flex-wrap gap-2" aria-label="Kinds of material">
        {KINDS.map((k, i) => (
          <span
            key={k}
            aria-current={i === 0 ? "true" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-4 text-[13px] font-semibold",
              focus,
              i === 0 ? "border-[#E3A008] bg-[#FFF6DA] text-[#7A4B00]" : "border-border bg-white text-[#3D4146]",
            )}
          >
            {k}
          </span>
        ))}
      </div>
      <RevisionEmpty icon={<span className="text-4xl">📚</span>}>No revision materials available yet.</RevisionEmpty>
    </div>
  );
}
