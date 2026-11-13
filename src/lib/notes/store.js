import { useSyncExternalStore } from "react";

/*
 * One module-level store for the whole workspace. Components subscribe to
 * a single slice with useStore(selector); selectors must return a value
 * that already lives in state (not a freshly built array) so React can
 * compare snapshots by reference. Derive lists with useMemo instead.
 */

const initialState = {
  status: "booting", // booting | ready | signin | error
  error: null,
  user: null,
  sync: "connecting", // connecting | live
  online: true,
  notes: {}, // id -> note (list columns; `content` once opened)
  folders: {}, // id -> folder
  tags: {}, // id -> tag
  noteTags: {}, // noteId -> [tagId]
};

let state = initialState;
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(updater) {
  const next = typeof updater === "function" ? updater(state) : updater;
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore(selector) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(initialState),
  );
}

export function resetStore() {
  state = initialState;
  listeners.forEach((listener) => listener());
}

// ---------------------------------------------------------------------------
// Pure state updaters
// ---------------------------------------------------------------------------

export function upsertNote(note) {
  setState((s) => ({ notes: { ...s.notes, [note.id]: { ...s.notes[note.id], ...note } } }));
}

export function removeNote(id) {
  setState((s) => {
    const notes = { ...s.notes };
    const noteTags = { ...s.noteTags };
    delete notes[id];
    delete noteTags[id];
    return { notes, noteTags };
  });
}

export function upsertFolder(folder) {
  setState((s) => ({ folders: { ...s.folders, [folder.id]: { ...s.folders[folder.id], ...folder } } }));
}

export function removeFolder(id) {
  setState((s) => {
    const folders = { ...s.folders };
    delete folders[id];
    // Mirrors `on delete set null` so notes move back to "All notes" instantly.
    const notes = Object.fromEntries(
      Object.entries(s.notes).map(([key, note]) => [key, note.folder_id === id ? { ...note, folder_id: null } : note]),
    );
    return { folders, notes };
  });
}

export function upsertTag(tag) {
  setState((s) => ({ tags: { ...s.tags, [tag.id]: { ...s.tags[tag.id], ...tag } } }));
}

export function removeTag(id) {
  setState((s) => {
    const tags = { ...s.tags };
    delete tags[id];
    const noteTags = Object.fromEntries(
      Object.entries(s.noteTags).map(([noteId, ids]) => [noteId, ids.filter((tagId) => tagId !== id)]),
    );
    return { tags, noteTags };
  });
}

export function addNoteTag(noteId, tagId) {
  setState((s) => {
    const current = s.noteTags[noteId] ?? [];
    if (current.includes(tagId)) return {};
    return { noteTags: { ...s.noteTags, [noteId]: [...current, tagId] } };
  });
}

export function removeNoteTag(noteId, tagId) {
  setState((s) => ({
    noteTags: { ...s.noteTags, [noteId]: (s.noteTags[noteId] ?? []).filter((id) => id !== tagId) },
  }));
}

export function indexById(rows) {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

export function groupNoteTags(rows) {
  const grouped = {};
  for (const row of rows) {
    (grouped[row.note_id] ??= []).push(row.tag_id);
  }
  return grouped;
}
