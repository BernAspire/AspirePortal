import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import {
  ACTIVE_CENTRE_COOKIE,
  resolveActiveCentre,
  type CentreChoice,
  type CentreMembership,
} from "./active-centre";
import {
  CENTRE_PICKER_PATH,
  NO_ACCESS_PATH,
  SIGN_IN_PATH,
  type MembershipRole,
} from "./routing";

/**
 * Data access layer for "who is signed in and where".
 *
 * Every read uses the user's own Supabase session, so row-level security
 * decides what comes back. Results are memoised per request with React
 * `cache`, never across requests or users.
 *
 * Anything that calls these reads cookies, so it must render inside a
 * <Suspense> boundary (Cache Components).
 */

export interface CurrentUser {
  readonly id: string;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  // getClaims verifies the JWT; never trust getSession() on the server.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const sub = data.claims.sub;
  return typeof sub === "string" && sub.length > 0 ? { id: sub } : null;
});

const membershipRow = z.object({
  centre_id: z.uuid(),
  role: z.enum(["owner", "admin", "staff", "teacher", "guardian", "student"]),
});

const centreRow = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(["active", "suspended", "archived"]),
});

/** Active memberships in active centres, read through RLS. */
export const getMyMemberships = cache(async (): Promise<CentreMembership[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("centre_memberships")
    .select("centre_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) throw new Error("Could not load your memberships.");
  const memberships = z.array(membershipRow).parse(rows);
  if (memberships.length === 0) return [];

  const centreIds = [...new Set(memberships.map((m) => m.centre_id))];
  const { data: centreRows, error: centreError } = await supabase
    .from("centres")
    .select("id, name, status")
    .in("id", centreIds);
  if (centreError) throw new Error("Could not load your centres.");
  const centres = new Map(
    z
      .array(centreRow)
      .parse(centreRows)
      .filter((c) => c.status === "active")
      .map((c) => [c.id, c.name] as const),
  );

  return memberships.flatMap((m) => {
    const centreName = centres.get(m.centre_id);
    return centreName ? [{ centreId: m.centre_id, centreName, role: m.role }] : [];
  });
});

async function activeCentreCookie(): Promise<string | undefined> {
  const value = (await cookies()).get(ACTIVE_CENTRE_COOKIE)?.value;
  return value && z.uuid().safeParse(value).success ? value : undefined;
}

export interface PortalContext {
  readonly user: CurrentUser;
  readonly centre: CentreChoice;
}

/**
 * Requires a signed-in user with `role` in some centre, and resolves which
 * centre they are working in. Redirects to sign-in, the centre picker or the
 * no-access page as needed. Use at the top of every portal page and action.
 */
export async function requirePortal(role: MembershipRole, returnTo: string): Promise<PortalContext> {
  const user = await getCurrentUser();
  if (!user) redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(returnTo)}`);

  const memberships = await getMyMemberships();
  const result = resolveActiveCentre(memberships, await activeCentreCookie(), (c) =>
    c.roles.includes(role),
  );

  switch (result.kind) {
    case "none":
      redirect(NO_ACCESS_PATH);
    case "choose":
      redirect(`${CENTRE_PICKER_PATH}?next=${encodeURIComponent(returnTo)}`);
    case "active":
      return { user, centre: result.centre };
  }
}

/** For pages outside a portal (start, centre picker): signed-in user and their centres. */
export async function requireUser(returnTo: string): Promise<{
  user: CurrentUser;
  memberships: CentreMembership[];
  cookieCentreId: string | undefined;
}> {
  const user = await getCurrentUser();
  if (!user) redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(returnTo)}`);
  return { user, memberships: await getMyMemberships(), cookieCentreId: await activeCentreCookie() };
}
