import { SESSION_MAX_AGE_SECONDS } from "@/constants";

// Auth cookies expire with the session instead of the library default (400 days).
export const COOKIE_OPTIONS = { maxAge: SESSION_MAX_AGE_SECONDS };

/*
 * True when the sign-in behind these JWT claims is older than the session
 * limit. `amr[].timestamp` is when the user actually signed in; it does not
 * move when the token is refreshed, so the limit is fixed from sign-in.
 */
export function isSessionExpired(claims) {
  const signedInAt = claims?.amr?.reduce((latest, entry) => Math.max(latest, entry.timestamp ?? 0), 0);
  if (!signedInAt) return false;
  return Date.now() / 1000 - signedInAt > SESSION_MAX_AGE_SECONDS;
}
