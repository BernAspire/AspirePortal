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
