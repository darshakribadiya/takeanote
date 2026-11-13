/*
 * Display title for a note: explicit title, else its first line of text.
 * Example: { title: "", content: "Call Sam\nabout invoice" } -> "Call Sam"
 */
export function noteTitle(note) {
  const title = (note?._liveTitle ?? note?.title)?.trim();
  if (title) return title;
  const source = note?._liveExcerpt ?? note?.content ?? note?.excerpt ?? "";
  const firstLine = source.trim().split("\n")[0]?.trim();
  return firstLine ? firstLine.slice(0, 80) : "Untitled";
}

/*
 * Preview line under the title. Skips the first line when it already
 * served as the title so the list does not repeat itself.
 */
export function notePreview(note) {
  const raw = (note?._liveExcerpt ?? note?.excerpt ?? note?.content?.slice(0, 200) ?? "").trim();
  const hasTitle = Boolean((note?._liveTitle ?? note?.title)?.trim());
  const body = hasTitle ? raw : raw.split("\n").slice(1).join(" ");
  return collapse(body);
}

// Mirrors the database `excerpt` column: left(content, 200).
export function makeExcerpt(content) {
  return content.slice(0, 200);
}

export function collapse(text) {
  return text.replace(/\s+/g, " ").trim();
}

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// Example: 40s ago -> "just now", 3h ago -> "3 hours ago", 9 days ago -> "Nov 4"
export function relativeTime(iso) {
  if (!iso) return "";
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relativeFormatter.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 7) return relativeFormatter.format(Math.round(seconds / 86400), "day");
  return dateFormatter.format(new Date(iso));
}

export function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

// Example: modKey() -> "⌘" on macOS, "Ctrl" elsewhere
export function modKey() {
  return isMac() ? "⌘" : "Ctrl";
}

export function altKey() {
  return isMac() ? "⌥" : "Alt";
}
