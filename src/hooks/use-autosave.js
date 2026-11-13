"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AUTOSAVE, SETTINGS } from "@/lib/sync/doc-model";

/*
 * The note's autosave setting, live: a collaborator flipping it updates
 * every open copy. Returns [enabled, setEnabled].
 */
export function useAutosave(session) {
  const settings = session.doc.getMap(SETTINGS);

  const subscribe = useCallback(
    (listener) => {
      const handler = (event) => event.keysChanged.has(AUTOSAVE) && listener();
      settings.observe(handler);
      return () => settings.unobserve(handler);
    },
    [settings],
  );

  const enabled = useSyncExternalStore(
    subscribe,
    () => settings.get(AUTOSAVE) !== false,
    () => true,
  );

  const setEnabled = useCallback((value) => session.sync.setAutosave(value), [session]);
  return [enabled, setEnabled];
}
