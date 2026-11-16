import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/constants";
import { COOKIE_OPTIONS } from "@/lib/supabase/session";

let browserClient;

// One client per tab so auth state and realtime sockets are shared.
export function createClient() {
  browserClient ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: COOKIE_OPTIONS,
  });
  return browserClient;
}
