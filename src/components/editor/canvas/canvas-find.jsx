"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useReactFlow, useViewport, ViewportPortal } from "@xyflow/react";
import { useSecretsRevealed } from "@/hooks/use-secrets-revealed";
import { findOnBoard, nodesMap } from "@/lib/editor/canvas-model";
import { cn } from "@/lib/utils";

// Never zoom further out than this to show a match.
const MIN_FOCUS_ZOOM = 0.6;

/*
 * Search state for the board: the query, the results (re-run whenever
 * the board or any text on it changes) and which result is current.
 */
export function useBoardSearch(doc, open) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [index, setIndex] = useState(0);
  const [version, setVersion] = useState(0);
  const revealed = useSecretsRevealed();

  // Text lives in per-node fragments, so listen to the whole document.
  useEffect(() => {
    if (!open) return;
    const bump = () => setVersion((value) => value + 1);
    doc.on("afterTransaction", bump);
    return () => doc.off("afterTransaction", bump);
  }, [doc, open]);

  const results = useMemo(
    () => (open && query ? findOnBoard(doc, query, { caseSensitive, reveal: revealed }) : []),
    // `version` re-runs the search after edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, open, query, caseSensitive, revealed, version],
  );
  const current = results.length ? Math.min(index, results.length - 1) : -1;

  return {
    query,
    setQuery: (value) => {
      setQuery(value);
      setIndex(0);
    },
    caseSensitive,
    setCaseSensitive,
    results,
    current,
    step: (direction) => results.length && setIndex((current + direction + results.length) % results.length),
    hasHidden: !revealed,
  };
}

// Node and edge ids to mark on the board: { nodes: Map(id -> isCurrent), edges: Map }.
export function searchMarks(search) {
  const nodes = new Map();
  const edges = new Map();
  search.results.forEach((result, index) => (result.kind === "node" ? nodes : edges).set(result.id, index === search.current));
  return { nodes, edges };
}

export function CanvasFindBar({ doc, search, focusKey, onClose }) {
  const flow = useReactFlow();
  const inputRef = useRef(null);
  const { results, current } = search;
  const result = results[current];

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [focusKey]);

  // Bring the current result into view.
  useEffect(() => {
    if (!result) return;
    let x = result.x;
    let y = result.y;
    if (result.kind === "node") {
      const value = nodesMap(doc).get(result.id);
      if (value) {
        x = value.x + value.w / 2;
        y = value.y + value.h / 2;
      }
    }
    flow.setCenter(x, y, { zoom: Math.max(flow.getZoom(), MIN_FOCUS_ZOOM), duration: 250 });
    // Only when the current result changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.kind, result?.id]);

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose(result);
    } else if (event.key === "Enter") {
      event.preventDefault();
      search.step(event.shiftKey ? -1 : 1);
    }
  }

  const status = !search.query ? "" : results.length ? `${current + 1} of ${results.length}` : "No results";

  return (
    <div
      aria-label="Find on board"
      className="flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col gap-1 rounded-xl border bg-popover/96 p-1.5 shadow-lg/5 backdrop-blur"
      role="search"
    >
      <div className="flex items-center gap-1">
        <div className="flex h-8 min-w-0 flex-1 items-center rounded-md bg-muted/64 pe-1 focus-within:ring-2 focus-within:ring-ring/32">
          <Icon className="ms-2 size-4 shrink-0 text-muted-foreground" icon="mdi:magnify" />
          <input
            aria-label="Find on board"
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
            onChange={(event) => search.setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Find on board"
            ref={inputRef}
            value={search.query}
          />
          <span className={cn("shrink-0 px-1 text-xs tabular-nums", results.length ? "text-muted-foreground" : "text-destructive-foreground")}>
            {status}
          </span>
          <button
            aria-label="Match case"
            aria-pressed={search.caseSensitive}
            className={cn(
              "inline-flex h-6 shrink-0 items-center rounded px-1 text-xs font-semibold hover:bg-accent",
              search.caseSensitive && "bg-accent text-accent-foreground",
            )}
            onClick={() => search.setCaseSensitive(!search.caseSensitive)}
            title="Match case"
            type="button"
          >
            Aa
          </button>
        </div>
        <BarButton disabled={!results.length} label="Previous (Shift+Enter)" onClick={() => search.step(-1)}>
          <Icon icon="mdi:chevron-up" />
        </BarButton>
        <BarButton disabled={!results.length} label="Next (Enter)" onClick={() => search.step(1)}>
          <Icon icon="mdi:chevron-down" />
        </BarButton>
        <BarButton label="Close (Esc)" onClick={() => onClose(result)}>
          <Icon icon="mdi:close" />
        </BarButton>
      </div>
      {search.query && search.hasHidden && (
        <p className="px-2 text-xs text-muted-foreground">Hidden text isn&apos;t searched until it&apos;s shown.</p>
      )}
    </div>
  );
}

/*
 * Alignment guides while dragging, drawn in board coordinates so they
 * line up at any zoom; 1 screen pixel wide.
 */
export function GuideLines({ guides }) {
  const { zoom } = useViewport();
  if (!guides.length) return null;
  const thickness = 1 / zoom;
  return (
    <ViewportPortal>
      {guides.map((guide) => (
        <div
          aria-hidden="true"
          className="canvas-guide"
          key={`${guide.axis}:${guide.at}`}
          style={
            guide.axis === "x"
              ? { left: guide.at - thickness / 2, top: guide.from, width: thickness, height: guide.to - guide.from }
              : { top: guide.at - thickness / 2, left: guide.from, height: thickness, width: guide.to - guide.from }
          }
        />
      ))}
    </ViewportPortal>
  );
}

function BarButton({ label, onClick, disabled, children }) {
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
