"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { NoteSync } from "@/lib/sync/note-sync";
import { registerOpenDoc } from "@/lib/sync/open-docs";

const CURSOR_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#0ea5e9", "#d946ef", "#84cc16", "#f97316"];

// Stable color per user so collaborators recognise each other's cursors.
export function colorFor(id = "") {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

/*
 * One Y.Doc + Awareness + NoteSync per mounted note. Remount (new `key`)
 * to open another note; options are read once.
 */
export function useNoteSync({ noteId, kind, canEdit, isOwner, user, ensurePersisted, shouldPersist, onLocalText }) {
  const [session] = useState(() => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalStateField("user", {
      name: user?.email ?? (user?.is_anonymous === false ? "Someone" : "Guest"),
      color: colorFor(user?.id),
    });
    const sync = new NoteSync({
      noteId,
      kind,
      doc,
      awareness,
      canEdit,
      isOwner,
      ensurePersisted,
      shouldPersist,
      onLocalText,
    });
    return { doc, awareness, sync };
  });

  const state = useSyncExternalStore(session.sync.subscribe, session.sync.getSnapshot, session.sync.getSnapshot);

  useEffect(() => {
    session.sync.start();
    const unregister = registerOpenDoc(noteId, session.doc);
    return () => {
      unregister();
      session.sync.stop();
    };
  }, [session, noteId]);

  return { ...session, state };
}
