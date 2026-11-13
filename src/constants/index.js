export const APP_NAME = "Quick Notes";
export const APP_DESCRIPTION = "Capture, organize and share a thought in seconds.";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Milliseconds of typing inactivity before an autosave fires.
export const AUTOSAVE_DEBOUNCE_MS = 600;

// Days a deleted note stays in Trash before it can be purged.
export const TRASH_RETENTION_DAYS = 30;
