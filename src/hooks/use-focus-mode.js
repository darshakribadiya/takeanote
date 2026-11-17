import { useSyncExternalStore } from "react";
import { focusModeSnapshot, subscribeFocusMode } from "@/lib/focus-mode";

const SERVER = { active: false, dim: true };

// { active, dim } for focus mode (see lib/focus-mode.js).
export function useFocusMode() {
  return useSyncExternalStore(subscribeFocusMode, focusModeSnapshot, () => SERVER);
}
