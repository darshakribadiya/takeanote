import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
 * Landing point for email links (magic link sign-in and the "add email"
 * confirmation for guest accounts). Supports both the PKCE `code` flow
 * and the `token_hash` flow used by custom email templates.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const supabase = await createClient();

  let error = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  }

  const destination = error ? `/?auth_error=${encodeURIComponent(error.message)}` : "/";
  return NextResponse.redirect(new URL(destination, origin));
}
