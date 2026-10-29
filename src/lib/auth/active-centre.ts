/**
 * Choosing which centre a user is working in. Pure functions; no framework imports.
 *
 * The choice is remembered in a cookie, but the cookie only narrows scope:
 * it is honoured only if it names a centre where the user has an active
 * membership right now (CLAUDE.md, tenancy rule 4). Row-level security is
 * still what stops cross-centre reads.
 */

import type { MembershipRole } from "./routing";

export const ACTIVE_CENTRE_COOKIE = "aspire_centre";

export interface CentreMembership {
  readonly centreId: string;
  readonly centreName: string;
  readonly role: MembershipRole;
}

export interface CentreChoice {
  readonly centreId: string;
  readonly centreName: string;
  readonly roles: readonly MembershipRole[];
}

/** Groups memberships by centre, sorted by centre name. */
export function centresFrom(memberships: readonly CentreMembership[]): CentreChoice[] {
  const byCentre = new Map<string, { centreName: string; roles: MembershipRole[] }>();
  for (const m of memberships) {
    const entry = byCentre.get(m.centreId);
    if (entry) {
      if (!entry.roles.includes(m.role)) entry.roles.push(m.role);
    } else {
      byCentre.set(m.centreId, { centreName: m.centreName, roles: [m.role] });
    }
  }
  return [...byCentre.entries()]
    .map(([centreId, { centreName, roles }]) => ({ centreId, centreName, roles }))
    .sort((a, b) => a.centreName.localeCompare(b.centreName, "en-SG"));
}

export type ActiveCentreResult =
  | { readonly kind: "none" }
  | { readonly kind: "choose"; readonly centres: readonly CentreChoice[] }
  | { readonly kind: "active"; readonly centre: CentreChoice };

/**
 * Decides the active centre:
 * - no memberships → none
 * - cookie names a centre the user belongs to → that centre
 * - exactly one centre → that centre
 * - otherwise → the user must choose
 */
export function resolveActiveCentre(
  memberships: readonly CentreMembership[],
  cookieCentreId: string | undefined,
  filter?: (centre: CentreChoice) => boolean,
): ActiveCentreResult {
  const centres = centresFrom(memberships).filter((c) => (filter ? filter(c) : true));
  if (centres.length === 0) return { kind: "none" };

  if (cookieCentreId) {
    const chosen = centres.find((c) => c.centreId === cookieCentreId);
    if (chosen) return { kind: "active", centre: chosen };
  }

  if (centres.length === 1) return { kind: "active", centre: centres[0] };
  return { kind: "choose", centres };
}
