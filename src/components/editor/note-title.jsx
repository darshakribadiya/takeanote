"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@iconify/react";
import { setTextMinimal, TITLE } from "@/lib/sync/doc-model";
import { cn } from "@/lib/utils";

/*
 * Title bound to the note's Yjs `title` text. Edits are written as the
 * smallest splice so a collaborator's caret in the title stays put.
 * When empty it shows `fallback` (first line / first canvas text) greyed
 * out: that is the name the note goes by until someone types a title.
 */
// The note's title text, live (empty string when it has none).
export function useTitleText(doc) {
  const ytext = doc.getText(TITLE);
  const subscribe = useCallback(
    (listener) => {
      ytext.observe(listener);
      return () => ytext.unobserve(listener);
    },
    [ytext],
  );
  return useSyncExternalStore(subscribe, () => ytext.toString(), () => "");
}

export function NoteTitle({ doc, readOnly, autoFocus, onExit, className, inputRef, fallback, onFocus, onBlur }) {
  const ytext = doc.getText(TITLE);
  const title = useTitleText(doc);
  // When the title opens focused (e.g. carried over from the blank page), the caret starts at its end.
  const placedCaret = useRef(false);

  const baseClass = "w-full bg-transparent font-heading text-[2em] leading-tight font-semibold tracking-tight wrap-break-word";

  if (readOnly) {
    return <h1 className={cn(baseClass, !title && "text-muted-foreground/64", className)}>{title || fallback || "Untitled"}</h1>;
  }

  return (
    <textarea
      aria-label="Title"
      autoFocus={autoFocus}
      className={cn(baseClass, "field-sizing-content resize-none outline-none placeholder:text-muted-foreground/40", className)}
      onChange={(event) => setTextMinimal(ytext, event.target.value.replace(/\n/g, " "))}
      onBlur={onBlur}
      onFocus={(event) => {
        onFocus?.(event);
        if (!autoFocus || placedCaret.current) return;
        placedCaret.current = true;
        const end = event.currentTarget.value.length;
        event.currentTarget.setSelectionRange(end, end);
      }}
      onKeyDown={(event) => {
        const atEnd = event.currentTarget.selectionStart === event.currentTarget.value.length;
        if (event.key === "Enter" || (event.key === "ArrowDown" && atEnd) || (event.key === "Tab" && !event.shiftKey)) {
          event.preventDefault();
          onExit?.();
        }
      }}
      placeholder={fallback || "Untitled"}
      ref={inputRef}
      rows={1}
      spellCheck
      value={title}
    />
  );
}

/*
 * One-line title for a toolbar (canvas notes keep the board clear).
 * Shows the title; click (or Enter on it) to rename in place. Enter or
 * leaving the field keeps the change, Esc puts the old title back.
 */
export function CompactNoteTitle({ doc, readOnly, className, hideWhenEmpty }) {
  const ytext = doc.getText(TITLE);
  const title = useTitleText(doc);
  const [editing, setEditing] = useState(false);
  const before = useRef("");
  // Clearing the title while renaming keeps the field until the rename ends.
  if (hideWhenEmpty && !title && !editing) return null;

  if (readOnly || !editing) {
    const label = title || "Untitled";
    if (readOnly) return <h1 className={cn("min-w-0 truncate text-sm font-semibold", className)}>{label}</h1>;
    return (
      <button
        className={cn(
          "group inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm font-semibold hover:bg-accent",
          className,
        )}
        onClick={() => {
          before.current = title;
          setEditing(true);
        }}
        title="Rename"
        type="button"
      >
        <span className="truncate">{label}</span>
        <Icon className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" icon="mdi:pencil-outline" />
      </button>
    );
  }

  return (
    <input
      aria-label="Title"
      autoFocus
      className={cn("h-8 w-56 min-w-0 rounded-md bg-muted/64 px-2 text-sm font-semibold outline-none ring-2 ring-ring/32", className)}
      maxLength={200}
      onBlur={() => setEditing(false)}
      onChange={(event) => setTextMinimal(ytext, event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.preventDefault();
          setTextMinimal(ytext, before.current);
          event.currentTarget.blur();
        }
      }}
      placeholder="Untitled"
      value={title}
    />
  );
}
