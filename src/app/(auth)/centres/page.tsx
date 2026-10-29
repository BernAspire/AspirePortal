import type { Metadata } from "next";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { centresFrom } from "@/lib/auth/active-centre";
import { CENTRE_PICKER_PATH, NO_ACCESS_PATH, START_PATH, safeNextPath } from "@/lib/auth/routing";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

import { chooseCentre } from "../actions";

export const metadata: Metadata = { title: "Choose a centre" };

export default function CentresPage({ searchParams }: PageProps<"/centres">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Choose a centre</h1>
        </CardTitle>
        <CardDescription>Your account belongs to more than one centre.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your centres…</p>}>
          <CentreList searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function CentreList({
  searchParams,
}: {
  searchParams: PageProps<"/centres">["searchParams"];
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext, START_PATH);
  const { memberships } = await requireUser(CENTRE_PICKER_PATH);
  const centres = centresFrom(memberships);
  if (centres.length === 0) redirect(NO_ACCESS_PATH);

  return (
    <ul className="grid gap-2">
      {centres.map((centre) => (
        <li key={centre.centreId}>
          <form action={chooseCentre}>
            <input type="hidden" name="centreId" value={centre.centreId} />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" className="h-auto w-full justify-start py-3">
              {centre.centreName}
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
