import { useCallback, useSyncExternalStore } from "react";
import { observeThreads, readThreads } from "@/lib/editor/comments";

const snapshots = new WeakMap();
const EMPTY = new Map();

// Comment threads of a note (id -> thread with its comments), live from Yjs.
export function useCommentThreads(doc) {
  const subscribe = useCallback(
    (listener) =>
      observeThreads(doc, () => {
        snapshots.set(doc, readThreads(doc));
        listener();
      }),
    [doc],
  );

  const getSnapshot = useCallback(() => {
    if (!snapshots.has(doc)) snapshots.set(doc, readThreads(doc));
    return snapshots.get(doc);
  }, [doc]);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
