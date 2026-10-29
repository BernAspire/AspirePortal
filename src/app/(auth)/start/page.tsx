import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { resolveActiveCentre } from "@/lib/auth/active-centre";
import {
  CENTRE_PICKER_PATH,
  NO_ACCESS_PATH,
  START_PATH,
  portalPathFor,
} from "@/lib/auth/routing";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Signing in" };

/** Sends a signed-in user to the right portal for their active centre. */
export default function StartPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Signing you in…</p>}>
      <RedirectToPortal />
    </Suspense>
  );
}

async function RedirectToPortal(): Promise<never> {
  const { memberships, cookieCentreId } = await requireUser(START_PATH);
  const result = resolveActiveCentre(memberships, cookieCentreId);
  switch (result.kind) {
    case "none":
      redirect(NO_ACCESS_PATH);
    case "choose":
      redirect(CENTRE_PICKER_PATH);
    case "active":
      redirect(portalPathFor(result.centre.roles));
  }
}
