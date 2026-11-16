export const APP_NAME = "Take a Note";
export const APP_DESCRIPTION = "Capture, organize and share a thought in seconds.";
// Longer pitch for search results and link previews.
export const APP_SUMMARY =
  "Take a Note is a fast, free note-taking app: write documents on real paper sizes, sketch flowcharts on a canvas, and share notes by link or email with live collaboration.";

// Public address of the site, for canonical URLs, sitemaps and share links.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3005").replace(/\/$/, "");

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Milliseconds of typing inactivity before an autosave fires.
export const AUTOSAVE_DEBOUNCE_MS = 600;

// Days a deleted note stays in Trash before it can be purged.
export const TRASH_RETENTION_DAYS = 30;

// A sign-in lasts this long, then the user must sign in again.
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export const MIN_PASSWORD_LENGTH = 8;
