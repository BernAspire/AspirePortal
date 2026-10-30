import type { Metadata } from "next";
import { Suspense } from "react";

import { getMyRevisionOffers } from "@/modules/revision";

import { ClassesSkeleton } from "../_components/class-ui";
import { REVISION_PATH } from "../_components/nav-config";

import { RevisionHomeView } from "./home-view";
import { loadRevision } from "./revision-data";

export const metadata: Metadata = { title: "Smart Revision" };

export default function RevisionHomePage() {
  return (
    <Suspense fallback={<ClassesSkeleton label="your revision" />}>
      <RevisionHome />
    </Suspense>
  );
}

async function RevisionHome() {
  const ctx = await loadRevision(REVISION_PATH);
  const offers = ctx.revision ? await getMyRevisionOffers(ctx.centreId) : [];

  return <RevisionHomeView ctx={ctx} offers={offers} />;
}
