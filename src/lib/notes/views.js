import { collapse, noteTitle } from "@/lib/format";

/*
 * A view is a string so it can live in the URL and localStorage.
 * Examples: "all", "favorites", "recent", "archive", "trash",
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
  return { all: "All notes", favorites: "Favorites", recent: "Recent", archive: "Archive", trash: "Trash" }[kind];
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

/*
 * Local search matches title and preview instantly; `serverMatches`
 * (full-text hits on note bodies) widens the result once it arrives.
 */
export function selectNotes({ notes, noteTags, view, query, serverMatches }) {
  const parsed = parseView(view);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = Object.values(notes).filter((note) => {
    if (!belongsToView(note, parsed, noteTags)) return false;
    if (!terms.length) return true;
    if (serverMatches?.has(note.id)) return true;
    const haystack = `${noteTitle(note)} ${collapse(note._liveExcerpt ?? note.excerpt ?? "")}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  list.sort(compare(parsed));
  return parsed.kind === "recent" ? list.slice(0, RECENT_LIMIT) : list;
}

export function countNotes(notes, view, noteTags) {
  const parsed = parseView(view);
  let count = 0;
  for (const note of Object.values(notes)) if (belongsToView(note, parsed, noteTags)) count += 1;
  return count;
}
