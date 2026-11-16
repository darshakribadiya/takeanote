import { useSyncExternalStore } from "react";
import { secretsRevealed, subscribeSecrets } from "@/lib/editor/secret-text";

// Whether hidden text is currently shown in this tab.
export function useSecretsRevealed() {
  return useSyncExternalStore(subscribeSecrets, secretsRevealed, () => false);
}
