"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useDocumentTitle, useNoteTitle } from "@/hooks/use-note-title";
import { isMac } from "@/lib/format";
import { setFocusMode, toggleFocusMode } from "@/lib/focus-mode";
import { CanvasEditor } from "./canvas/canvas-editor";
import { DocumentEditor } from "./document/document-editor";
import { CompactNoteTitle, NoteTitle, useTitleText } from "./note-title";

// How long the "Esc to exit" hint stays after entering focus mode.
const HINT_MS = 2500;

/*
 * The editing surface for one open note: paper document or canvas.
 * The two never mix; a note's kind is fixed when it is created.
 * Both have a title; until one is typed, the first line (document) or
 * first text on the board (canvas) stands in for it.
 *
 * Focus mode (Ctrl/⌘+Shift+F, Esc to leave) works for both kinds.
 */
export function NoteBody({ kind, session, user, readOnly, autoFocus, initialText, ensurePersisted, onError, onEditor, noteId }) {
  const scrollRef = useRef(null);
  const titles = useNoteTitle(session.doc, kind);
  useDocumentTitle(titles);
  const focus = useFocusMode();

  useHotkeys([
    { combo: "mod+shift+f", allowInInputs: true, handler: () => toggleFocusMode() },
    // Esc in a text field leaves the field first; the next Esc leaves focus mode.
    // Bound only while on, so Esc keeps closing dialogs and menus the rest of the time.
    { combo: "escape", handler: focus.active ? () => setFocusMode(false) : null },
  ]);

  // Leaving the note (or the page) always leaves focus mode.
  useEffect(() => () => setFocusMode(false), []);

  if (kind === "canvas") {
    return (
      <div className="relative min-h-0 flex-1">
        {focus.active && <FocusHint />}
        <CanvasTitlePrompt autoFocus={autoFocus === "title"} doc={session.doc} fallback={titles.fallback} readOnly={readOnly} />
        <CanvasEditor doc={session.doc} ensurePersisted={ensurePersisted} noteId={noteId} onError={onError} readOnly={readOnly} />
      </div>
    );
  }

  return (
    <div className="paper-desk relative min-h-0 flex-1 overflow-y-auto overscroll-contain" ref={scrollRef}>
      {focus.active && <FocusHint />}
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

/*
 * Canvas title flow: while the board has no title, a "Name this board"
 * field floats in the corner (focused on a new board). Enter or clicking
 * away saves it, and the field goes away; from then on the title lives in
 * the note's top bar (CanvasHeaderTitle), so the board stays clear.
 */
function CanvasTitlePrompt({ doc, autoFocus, fallback, readOnly }) {
  const title = useTitleText(doc);
  const [focused, setFocused] = useState(false);
  if (readOnly || (title && !focused)) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex px-3 pt-3 md:px-4">
      <div className="pointer-events-auto w-full max-w-md rounded-xl border bg-background/88 px-3 py-1.5 shadow-sm/5 backdrop-blur">
        <NoteTitle
          autoFocus={autoFocus}
          className="text-xl"
          doc={doc}
          fallback={fallback || "Name this board"}
          onBlur={() => setFocused(false)}
          onExit={() => document.activeElement?.blur()}
          onFocus={() => setFocused(true)}
        />
        {focused && <p className="pb-0.5 text-xs text-muted-foreground">Enter to save · it moves to the top bar</p>}
      </div>
    </div>
  );
}

// The canvas title in a toolbar, once it has one (click to rename).
export function CanvasHeaderTitle({ doc, readOnly, className }) {
  return <CompactNoteTitle className={className} doc={doc} hideWhenEmpty readOnly={readOnly} />;
}

// Brief note at the top of the screen on entering focus mode (mounted only while it's on).
function FocusHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), HINT_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3">
      <div className="focus-hint flex h-9 items-center gap-2 rounded-full border bg-popover/96 px-3.5 text-sm shadow-lg/5 backdrop-blur">
        <Icon className="size-4.5 text-muted-foreground" icon="mdi:fullscreen" />
        Focus mode · <kbd className="font-sans font-medium">Esc</kbd> or {isMac() ? "⌘⇧F" : "Ctrl+Shift+F"} to exit
      </div>
    </div>
  );
}
