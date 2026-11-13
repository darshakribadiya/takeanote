/*
 * Yjs documents of the notes open right now in this tab, by note id.
 * Sidebar actions (rename, duplicate, export) use the live document when
 * the note is open, so unsaved keystrokes are included and a rename
 * flows through the normal sync (log + realtime broadcast).
 */
const openDocs = new Map();

export function registerOpenDoc(noteId, doc) {
  openDocs.set(noteId, doc);
  return () => {
    if (openDocs.get(noteId) === doc) openDocs.delete(noteId);
  };
}

export function getOpenDoc(noteId) {
  return openDocs.get(noteId) ?? null;
}
