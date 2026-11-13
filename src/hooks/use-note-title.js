"use client";

import { useEffect, useState } from "react";
import { APP_NAME } from "@/constants";
import { fallbackTitle, TITLE } from "@/lib/sync/doc-model";

// Recomputing on every keystroke is wasted work; a short pause is enough.
const FALLBACK_DELAY_MS = 250;

/*
 * Live title of an open note: the explicit title and the fallback taken
 * from the first line (document) or first text (canvas).
 * Example: no title, body "Trip ideas…" -> { title: "", fallback: "Trip ideas…" }
 */
export function useNoteTitle(doc, kind) {
  const [state, setState] = useState(() => ({
    title: doc.getText(TITLE).toString(),
    fallback: fallbackTitle(doc, kind),
  }));

  useEffect(() => {
    let timer = 0;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = { title: doc.getText(TITLE).toString(), fallback: fallbackTitle(doc, kind) };
        setState((current) => (current.title === next.title && current.fallback === next.fallback ? current : next));
      }, FALLBACK_DELAY_MS);
    };
    update();
    doc.on("update", update);
    return () => {
      clearTimeout(timer);
      doc.off("update", update);
    };
  }, [doc, kind]);

  return state;
}

// Browser tab shows the note's (fallback) title while it is open.
export function useDocumentTitle({ title, fallback }) {
  const label = title.trim() || fallback || "Untitled";
  useEffect(() => {
    const previous = document.title;
    document.title = `${label} · ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [label]);
}
