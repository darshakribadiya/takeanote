"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useEditorState } from "@tiptap/react";
import { useSecretsRevealed } from "@/hooks/use-secrets-revealed";
import { searchKey } from "@/lib/editor/search";
import { cn } from "@/lib/utils";

/*
 * Find (Ctrl+F) and replace (Ctrl+H) bar for the document. Enter / Shift+Enter
 * step through matches, Esc closes and puts the caret on the current match.
 * Hidden text is only searched while hidden text is shown.
 */
export function FindBar({ editor, withReplace, readOnly, focusKey, onClose }) {
  const [query, setQuery] = useState(() => selectedText(editor));
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(withReplace && !readOnly);
  const [seenKey, setSeenKey] = useState(focusKey);
  const revealed = useSecretsRevealed();
  const findRef = useRef(null);
  const replaceRef = useRef(null);
  const result = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = searchKey.getState(current.state);
      return { count: state?.matches.length ?? 0, current: state?.current ?? -1 };
    },
  }) ?? { count: 0, current: -1 };

  useEffect(() => {
    editor.commands.setSearch({ query, caseSensitive, includeHidden: revealed });
  }, [editor, query, caseSensitive, revealed]);

  // Ctrl+H while the bar is open also opens the replace row.
  if (seenKey !== focusKey) {
    setSeenKey(focusKey);
    if (withReplace && !readOnly) setShowReplace(true);
  }

  // Ctrl+F / Ctrl+H again while open: refocus the right box.
  useEffect(() => {
    const target = withReplace && !readOnly && query ? replaceRef.current : findRef.current;
    requestAnimationFrame(() => {
      target?.focus();
      target?.select();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, withReplace]);

  // Keep the current match on screen as it changes.
  const { current: currentMatch, count: matchCount } = result;
  useEffect(() => {
    if (currentMatch < 0) return;
    requestAnimationFrame(() => {
      editor.view.dom.querySelector(".search-match.is-current")?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [editor, currentMatch, matchCount]);

  useEffect(() => () => editor.commands.clearSearch(), [editor]);

  function close() {
    editor.commands.clearSearch({ selectCurrent: true });
    onClose();
    editor.commands.focus(undefined, { scrollIntoView: false });
  }

  function step(direction) {
    editor.commands.findNext(direction);
  }

  function onKeyDown(event, onEnter) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      onEnter(event);
    }
  }

  const status = !query ? "" : result.count ? `${result.current + 1} of ${result.count}` : "No results";

  return (
    <div
      aria-label="Find in note"
      className="flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col gap-1.5 rounded-xl border bg-popover/96 p-1.5 shadow-lg/5 backdrop-blur"
      role="search"
    >
      <div className="flex items-center gap-1">
        {!readOnly && (
          <IconButton label={showReplace ? "Hide replace" : "Show replace"} onClick={() => setShowReplace((value) => !value)}>
            <Icon icon={showReplace ? "mdi:chevron-down" : "mdi:chevron-right"} />
          </IconButton>
        )}
        <div className="flex h-8 min-w-0 flex-1 items-center rounded-md bg-muted/64 pe-1 focus-within:ring-2 focus-within:ring-ring/32">
          <input
            aria-label="Find"
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => onKeyDown(event, (keyEvent) => step(keyEvent.shiftKey ? -1 : 1))}
            placeholder="Find"
            ref={findRef}
            value={query}
          />
          <span className={cn("shrink-0 px-1 text-xs tabular-nums", result.count ? "text-muted-foreground" : "text-destructive-foreground")}>
            {status}
          </span>
          <button
            aria-label="Match case"
            aria-pressed={caseSensitive}
            className={cn(
              "inline-flex h-6 shrink-0 items-center rounded px-1 text-xs font-semibold hover:bg-accent",
              caseSensitive && "bg-accent text-accent-foreground",
            )}
            onClick={() => setCaseSensitive((value) => !value)}
            title="Match case"
            type="button"
          >
            Aa
          </button>
        </div>
        <IconButton disabled={!result.count} label="Previous match (Shift+Enter)" onClick={() => step(-1)}>
          <Icon icon="mdi:chevron-up" />
        </IconButton>
        <IconButton disabled={!result.count} label="Next match (Enter)" onClick={() => step(1)}>
          <Icon icon="mdi:chevron-down" />
        </IconButton>
        <IconButton label="Close (Esc)" onClick={close}>
          <Icon icon="mdi:close" />
        </IconButton>
      </div>

      {showReplace && !readOnly && (
        <div className="flex items-center gap-1 ps-9">
          <input
            aria-label="Replace with"
            className="h-8 min-w-0 flex-1 rounded-md bg-muted/64 px-2 text-sm outline-none focus:ring-2 focus:ring-ring/32"
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => onKeyDown(event, () => editor.commands.replaceMatch(replacement))}
            placeholder="Replace with"
            ref={replaceRef}
            value={replacement}
          />
          <TextButton disabled={!result.count} onClick={() => editor.commands.replaceMatch(replacement)}>
            Replace
          </TextButton>
          <TextButton disabled={!result.count} onClick={() => editor.commands.replaceAllMatches(replacement)}>
            All
          </TextButton>
        </div>
      )}
      {query && !revealed && <HiddenNote editor={editor} />}
    </div>
  );
}

// Tells people why words inside hidden text aren't found.
function HiddenNote({ editor }) {
  const hasHidden = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      let found = false;
      current.state.doc.descendants((node) => {
        if (found) return false;
        if (node.isText && node.marks.some((mark) => mark.type.name === "secret")) found = true;
        return !found;
      });
      return found;
    },
  });
  if (!hasHidden) return null;
  return <p className="px-2 text-xs text-muted-foreground">Hidden text isn&apos;t searched until it&apos;s shown.</p>;
}

// Selected text (one line, not too long) seeds the search box.
function selectedText(editor) {
  const { from, to, empty } = editor.state.selection;
  if (empty) return "";
  const text = editor.state.doc.textBetween(from, to, " ");
  return text.length <= 100 && !text.includes("\n") ? text : "";
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40 [&_svg]:size-4.5"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function TextButton({ onClick, disabled, children }) {
  return (
    <button
      className="inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
