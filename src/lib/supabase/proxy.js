import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/constants";

/*
 * Refreshes the auth token on every request and forwards the new cookies
 * to both the request (for Server Components) and the response (for the
 * browser). No redirects here: first-time visitors get an anonymous
 * session on the client so they can start writing instantly.
 */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
  await supabase.auth.getClaims();

  return response;
}
