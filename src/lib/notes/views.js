
/*
 * A view is a string so it can live in the URL and localStorage.
 * Examples: "all", "favorites", "recent", "shared", "archive", "trash",
 * "folder:<uuid>", "tag:<uuid>"
 */
export const DEFAULT_VIEW = "all";
const RECENT_LIMIT = 30;

export function parseView(view) {
  const [kind, id] = view.split(":");
  return { kind, id };
}

export function viewLabel(view, { folders, tags }) {
  const { kind, id } = parseView(view);
  if (kind === "folder") return folders[id]?.name ?? "Folder";
  if (kind === "tag") return tags[id] ? `#${tags[id].name}` : "Tag";
  return {
    all: "All notes",
    favorites: "Favorites",
    recent: "Recent",
    shared: "Shared with me",
    archive: "Archive",
    trash: "Trash",
  }[kind];
}

function isLive(note) {
  return !note.deleted_at && !note.archived_at;
}

function belongsToView(note, { kind, id }, noteTags) {
  switch (kind) {
    case "favorites":
      return isLive(note) && note.is_favorite;
    case "recent":
      return !note.deleted_at;
    case "archive":
      return !note.deleted_at && Boolean(note.archived_at);
    case "trash":
      return Boolean(note.deleted_at);
    // Other people's notes; the sidebar lists them from listSharedWithMe().
    case "shared":
      return false;
    case "folder":
      return isLive(note) && note.folder_id === id;
    case "tag":
      return isLive(note) && (noteTags[note.id] ?? []).includes(id);
    default:
      return isLive(note);
  }
}

function compare(view) {
  if (view.kind === "recent") return (a, b) => b.last_accessed_at.localeCompare(a.last_accessed_at);
  if (view.kind === "trash") return (a, b) => b.deleted_at.localeCompare(a.deleted_at);
  return (a, b) =>
    Number(b.is_pinned) - Number(a.is_pinned) || b.content_updated_at.localeCompare(a.content_updated_at);
}

// The notes of one view, sorted. Searching happens in the command palette.
export function selectNotes({ notes, noteTags, view }) {
  const parsed = parseView(view);
  const list = Object.values(notes).filter((note) => belongsToView(note, parsed, noteTags));
  list.sort(compare(parsed));
  return parsed.kind === "recent" ? list.slice(0, RECENT_LIMIT) : list;
}

export function countNotes(notes, view, noteTags) {
  const parsed = parseView(view);
  let count = 0;
  for (const note of Object.values(notes)) if (belongsToView(note, parsed, noteTags)) count += 1;
  return count;
}

// ---------------------------------------------------------------------------
// Date sections for the sidebar list
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;

// Which timestamp a view sorts by. Example: "recent" -> last_accessed_at
export function viewDateField(kind) {
  if (kind === "recent") return "last_accessed_at";
  if (kind === "trash") return "deleted_at";
  return "content_updated_at";
}

/*
 * Splits an already-sorted list into labelled sections: pinned notes first
 * (except in Recent and Trash, which are purely by date), then by age.
 * Example: [pinned A, today B, March C] ->
 *   [{ key: "pinned", label: "Pinned", notes: [A] }, { key: "today", … [B] }, { key: "older", … [C] }]
 */
export function groupNotesByDate(notes, kind, now = new Date()) {
  const field = viewDateField(kind);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sections = [
    { key: "pinned", label: "Pinned", notes: [] },
    { key: "today", label: "Today", notes: [] },
    { key: "yesterday", label: "Yesterday", notes: [] },
    { key: "week", label: "Previous 7 days", notes: [] },
    { key: "month", label: "Earlier this month", notes: [] },
    { key: "older", label: "Older", notes: [] },
  ];
  const byKey = Object.fromEntries(sections.map((section) => [section.key, section]));
  const pinsFirst = kind !== "recent" && kind !== "trash";

  for (const note of notes) {
    if (pinsFirst && note.is_pinned) {
      byKey.pinned.notes.push(note);
      continue;
    }
    const time = new Date(note[field] ?? note.created_at).getTime();
    const key =
      time >= startOfToday
        ? "today"
        : time >= startOfToday - DAY_MS
          ? "yesterday"
          : time >= startOfToday - 7 * DAY_MS
            ? "week"
            : time >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()
              ? "month"
              : "older";
    byKey[key].notes.push(note);
  }
  return sections.filter((section) => section.notes.length);
}
