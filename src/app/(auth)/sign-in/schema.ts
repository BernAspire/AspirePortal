import { z } from "zod";

/** Normalised email: trimmed and lower-cased. */
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((value) => value.toLowerCase());

/**
 * Supabase email codes are 6 digits by default (configurable up to 10).
 * Spaces are allowed in input and removed, since people often type "123 456".
 */
export const codeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6,10}$/));

export type SignInState =
  | { readonly step: "email"; readonly next: string; readonly email?: string; readonly error?: string }
  | {
      readonly step: "code";
      readonly next: string;
      readonly email: string;
      readonly error?: string;
      /** Changes on every send, so the code form resets for a new code. */
      readonly sentAt?: number;
    };

/** Student usernames: 3–32 characters, lower-case letters, digits, dot, dash, underscore. */
export const usernameSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/));

/** PINs are 6–8 digits (Supabase requires passwords of at least 6 characters). */
export const pinSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6,8}$/));

/** The never-delivered address behind a student login (matches app.student_login_domain()). */
export const STUDENT_LOGIN_DOMAIN = "students.aspireportal.invalid";

export function studentLoginEmail(username: string): string {
  return `${username}@${STUDENT_LOGIN_DOMAIN}`;
}

export type PinSignInState = {
  readonly next: string;
  readonly username?: string;
  readonly error?: string;
};
