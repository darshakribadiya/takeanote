import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/constants";

let browserClient;

// One client per tab so auth state and realtime sockets are shared.
export function createClient() {
  browserClient ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return browserClient;
}
