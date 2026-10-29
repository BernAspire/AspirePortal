import { z } from "zod";

/**
 * Public environment variables (safe to expose to the browser).
 *
 * Read with literal `process.env.NEXT_PUBLIC_*` access so Next.js can inline
 * them into client bundles. Validated lazily, at first use, so `next build`
 * works without a Supabase project configured.
 *
 * The service-role key is deliberately NOT here. It will live in a separate
 * `server-only` module, used only by webhooks, jobs and the PDF worker
 * (CLAUDE.md, tenancy rule 5).
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${missing}. Copy .env.example to .env.local and fill them in.`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function hasPublicEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
