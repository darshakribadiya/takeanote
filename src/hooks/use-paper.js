"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_PAPER, readPaper } from "@/lib/editor/paper";
import { SETTINGS } from "@/lib/sync/doc-model";

const snapshots = new WeakMap();

/*
 * Paper settings from the note's Yjs `settings` map, shared live with
 * collaborators. `setPaper(patch)` writes only the keys that changed.
 */
export function usePaper(doc) {
  const map = doc.getMap(SETTINGS);

  const subscribe = useCallback(
    (listener) => {
      const handler = () => {
        snapshots.set(map, readPaper(map));
        listener();
      };
      map.observe(handler);
      return () => map.unobserve(handler);
    },
    [map],
  );

  const getSnapshot = useCallback(() => {
    if (!snapshots.has(map)) snapshots.set(map, readPaper(map));
    return snapshots.get(map);
  }, [map]);

  const paper = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PAPER);

  const setPaper = useCallback(
    (patch) => {
      doc.transact(() => {
        for (const [key, value] of Object.entries(patch)) {
          if (map.get(key) !== value) map.set(key, value);
        }
      });
    },
    [doc, map],
  );

  return [paper, setPaper];
}
