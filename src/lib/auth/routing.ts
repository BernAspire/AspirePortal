/**
 * Pure routing rules for sign-in and portal selection. No framework imports,
 * so they can be unit-tested directly.
 */

export const SIGN_IN_PATH = "/sign-in";
export const START_PATH = "/start";
export const CENTRE_PICKER_PATH = "/centres";
export const NO_ACCESS_PATH = "/no-access";
export const STUDENT_HOME_PATH = "/student";

/** Paths that need a signed-in user. The proxy redirects early; pages re-check. */
export const PROTECTED_PREFIXES = [STUDENT_HOME_PATH, START_PATH, CENTRE_PICKER_PATH] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Returns `value` if it is a same-site relative path, otherwise `fallback`.
 * Prevents open redirects via `?next=https://evil.example` or `//evil.example`.
 */
export function safeNextPath(value: unknown, fallback: string = START_PATH): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Reject control characters and backslashes, which some browsers treat as "/".
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  // Don't bounce back to sign-in after signing in.
  if (value === SIGN_IN_PATH || value.startsWith(`${SIGN_IN_PATH}?`)) return fallback;
  return value;
}

export type MembershipRole = "owner" | "admin" | "staff" | "teacher" | "guardian" | "student";

/**
 * Where a signed-in user lands, given their roles in the active centre.
 * Only the student portal exists so far; everyone else sees "no access yet".
 */
export function portalPathFor(roles: readonly MembershipRole[]): string {
  if (roles.includes("student")) return STUDENT_HOME_PATH;
  return NO_ACCESS_PATH;
}
