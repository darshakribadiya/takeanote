/*
 * Notes created on this device whose database row may not exist yet
 * (created offline, or the tab closed before the first save). Their
 * content is safe in IndexedDB; this registry remembers the row fields
 * so the next boot can insert them.
 *
 * Shape: { [noteId]: { kind, folder_id, is_favorite, created_at } }
 */

const KEY = "qn:pending-notes";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function write(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: the note still saves while this tab is open.
  }
}

export function listPending() {
  return read();
}

export function rememberPending(note) {
  const entries = read();
  entries[note.id] = {
    kind: note.kind,
    folder_id: note.folder_id ?? null,
    is_favorite: Boolean(note.is_favorite),
    created_at: note.created_at,
  };
  write(entries);
}

export function forgetPending(noteId) {
  const entries = read();
  if (!(noteId in entries)) return;
  delete entries[noteId];
  write(entries);
}
