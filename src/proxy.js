import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request) {
  return updateSession(request);
}

export const config = {
  // Skip static assets and images; they never need an auth session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
