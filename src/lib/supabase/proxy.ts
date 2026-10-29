import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { hasPublicEnv, publicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase auth session on each request and writes any updated
 * cookies to both the request (for Server Components) and the response.
 *
 * This is session upkeep only. It does not decide who may see what: that is
 * enforced by row-level security and by server-side checks in each portal.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!hasPublicEnv()) {
    // No Supabase project configured (e.g. a fresh clone). Pages that need
    // data will throw a clear error from publicEnv(); public pages still work.
    return response;
  }

  const env = publicEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Prevents CDNs from caching a response that sets auth cookies.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not add code between client creation and this call: it validates the
  // JWT and triggers the refresh that keeps users signed in.
  await supabase.auth.getClaims();

  return response;
}
