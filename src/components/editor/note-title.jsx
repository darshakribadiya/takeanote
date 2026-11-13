"use client";

import { useCallback, useSyncExternalStore } from "react";
import { setTextMinimal, TITLE } from "@/lib/sync/doc-model";
import { cn } from "@/lib/utils";

/*
 * Title bound to the note's Yjs `title` text. Edits are written as the
 * smallest splice so a collaborator's caret in the title stays put.
 * When empty it shows `fallback` (first line / first canvas text) greyed
 * out: that is the name the note goes by until someone types a title.
 */
export function NoteTitle({ doc, readOnly, autoFocus, onExit, className, inputRef, fallback }) {
  const ytext = doc.getText(TITLE);
  const subscribe = useCallback(
    (listener) => {
      ytext.observe(listener);
      return () => ytext.unobserve(listener);
    },
    [ytext],
  );
  const title = useSyncExternalStore(subscribe, () => ytext.toString(), () => "");

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
