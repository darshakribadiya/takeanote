"use client";

import { useRef } from "react";
import { useDocumentTitle, useNoteTitle } from "@/hooks/use-note-title";
import { CanvasEditor } from "./canvas/canvas-editor";
import { DocumentEditor } from "./document/document-editor";
import { NoteTitle } from "./note-title";

/*
 * The editing surface for one open note: paper document or canvas.
 * The two never mix; a note's kind is fixed when it is created.
 * Both have a title; until one is typed, the first line (document) or
 * first text on the board (canvas) stands in for it.
 */
export function NoteBody({ kind, session, user, readOnly, autoFocus, initialText, ensurePersisted, onError, onEditor, noteId }) {
  const scrollRef = useRef(null);
  const titles = useNoteTitle(session.doc, kind);
  useDocumentTitle(titles);

  if (kind === "canvas") {
    return (
      <div className="relative min-h-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex px-3 pt-3 md:px-4">
          <div className="pointer-events-auto w-full max-w-md rounded-xl bg-background/80 px-3 py-1.5 backdrop-blur">
            <NoteTitle
              autoFocus={autoFocus === "title"}
              className="text-xl"
              doc={session.doc}
              fallback={titles.fallback}
              onExit={() => document.activeElement?.blur()}
              readOnly={readOnly}
            />
          </div>
        </div>
        <CanvasEditor doc={session.doc} ensurePersisted={ensurePersisted} noteId={noteId} onError={onError} readOnly={readOnly} />
      </div>
    );
  }

  return (
    <div className="paper-desk min-h-0 flex-1 overflow-y-auto overscroll-contain" ref={scrollRef}>
      <DocumentEditor
        autoFocus={autoFocus}
        awareness={session.awareness}
        doc={session.doc}
        ensurePersisted={ensurePersisted}
        initialText={initialText}
        noteId={noteId}
        onEditor={onEditor}
        onError={onError}
        readOnly={readOnly}
        scrollRef={scrollRef}
        titleFallback={titles.fallback}
        user={user}
      />
    </div>
  );
}
