import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only same-site paths, so the link can't bounce the user to another site.
function safeNext(next) {
  return next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/*
 * Landing point for email links (signup confirmation, password reset and
 * the "add email" confirmation for guest accounts). Supports both the PKCE
 * `code` flow and the `token_hash` flow used by custom email templates.
 * `next` is where to go after the link signs the user in.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = type === "recovery" ? "/reset-password" : safeNext(searchParams.get("next"));
  const supabase = await createClient();

  let error = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    error = { message: "This link is incomplete. Request a new one." };
  }

  const destination = error ? `/?auth_error=${encodeURIComponent(error.message)}` : next;
  return NextResponse.redirect(new URL(destination, origin));
}
