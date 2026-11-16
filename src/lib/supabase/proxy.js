import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/constants";
import { COOKIE_OPTIONS, isSessionExpired } from "@/lib/supabase/session";

/*
 * Refreshes the auth token on every request and forwards the new cookies
 * to both the request (for Server Components) and the response (for the
 * browser). A sign-in older than SESSION_DAYS is signed out here. No
 * redirects: the client shows the sign-in screen when there is no session.
 */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Must run right after client creation; getClaims validates and refreshes the JWT.
  const { data } = await supabase.auth.getClaims();
  if (isSessionExpired(data?.claims)) await supabase.auth.signOut({ scope: "local" });

  return response;
}
