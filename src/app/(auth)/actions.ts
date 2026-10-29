"use server";

import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ACTIVE_CENTRE_COOKIE } from "@/lib/auth/active-centre";
import { safeNextPath, SIGN_IN_PATH, START_PATH } from "@/lib/auth/routing";
import { getMyMemberships, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import {
  codeSchema,
  emailSchema,
  type SignInState,
} from "./sign-in/schema";

/**
 * Sign-in is by a one-time code sent to the user's email.
 *
 * - Accounts are created by the centre, never by signing in
 *   (`shouldCreateUser: false`).
 * - The response is the same whether or not the email has an account, so the
 *   form cannot be used to discover who is enrolled.
 * - Nothing personal is logged.
 */

function isRateLimited(error: AuthError | null): boolean {
  return Boolean(error && (error.status === 429 || error.code?.startsWith("over_")));
}

/** Supabase unreachable or failing (network error or 5xx), as opposed to a refusal. */
function isServiceFailure(error: AuthError | null): boolean {
  return Boolean(
    error && (isAuthRetryableFetchError(error) || (error.status !== undefined && error.status >= 500)),
  );
}

const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";
const UNAVAILABLE = "We couldn't reach the sign-in service. Please try again in a moment.";

export async function requestCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const next = safeNextPath(formData.get("next"));
  if (formData.get("intent") === "change-email") {
    return { step: "email", next };
  }
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { step: "email", next, error: "Enter a valid email address." };
  }
  const email = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (isRateLimited(error)) {
    return { step: "email", next, email, error: TOO_MANY };
  }
  if (isServiceFailure(error)) {
    return { step: "email", next, email, error: UNAVAILABLE };
  }
  // Any other refusal (including "no such user") gets the same response as
  // success, so the form doesn't reveal whether an email is registered.
  return { step: "code", next, email, sentAt: Date.now() };
}

export async function verifyCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const next = safeNextPath(formData.get("next"));
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return { step: "email", next, error: "Enter your email again." };
  }
  const email = parsedEmail.data;

  const parsedCode = codeSchema.safeParse(formData.get("code"));
  if (!parsedCode.success) {
    return { step: "code", next, email, error: "Enter the code from your email (numbers only)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: parsedCode.data,
    type: "email",
  });

  if (error) {
    return {
      step: "code",
      next,
      email,
      error: isRateLimited(error)
        ? TOO_MANY
        : isServiceFailure(error)
          ? UNAVAILABLE
          : "That code is wrong or has expired. Check the latest email, or send a new code.",
    };
  }

  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_CENTRE_COOKIE);
  redirect(SIGN_IN_PATH);
}

const chooseCentreSchema = z.object({
  centreId: z.uuid(),
  next: z.unknown(),
});

/** Remembers the centre the user picked. Only centres they belong to are accepted. */
export async function chooseCentre(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const parsed = chooseCentreSchema.safeParse({
    centreId: formData.get("centreId"),
    next: formData.get("next"),
  });
  if (!parsed.success) redirect(START_PATH);

  const memberships = await getMyMemberships();
  if (!memberships.some((m) => m.centreId === parsed.data.centreId)) {
    redirect(START_PATH);
  }

  (await cookies()).set(ACTIVE_CENTRE_COOKIE, parsed.data.centreId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect(safeNextPath(parsed.data.next));
}
