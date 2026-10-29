import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SIGN_IN_PATH, START_PATH, isProtectedPath } from "@/lib/auth/routing";
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
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims.sub);

  // Optimistic redirects only, to save a round trip. Every protected page and
  // action still checks the user itself; this is not the security boundary.
  const { pathname, search } = request.nextUrl;
  if (!signedIn && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = SIGN_IN_PATH;
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return redirectKeepingCookies(url, response);
  }
  if (signedIn && pathname === SIGN_IN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = START_PATH;
    url.search = "";
    return redirectKeepingCookies(url, response);
  }

  return response;
}

/** A redirect that carries any refreshed auth cookies and cache headers. */
function redirectKeepingCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}
