"use client";

import { useEffect, useEffectEvent } from "react";

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/*
 * Bindings: [{ combo, handler, allowInInputs }]
 * combo examples: "mod+k", "alt+n", "?", "j", "mod+shift+backspace"
 * `mod` is Cmd on macOS and Ctrl elsewhere. Letter keys match by physical
 * key so Option+N on macOS still triggers "alt+n" instead of typing "˜".
 */
export function useHotkeys(bindings) {
  const onKeyDown = useEffectEvent((event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const typing = isTypingTarget(event.target);
    for (const binding of bindings) {
      if (!binding.handler || (typing && !binding.allowInInputs)) continue;
      if (matches(event, binding.combo)) {
        event.preventDefault();
        binding.handler(event);
        return;
      }
    }
  });

  useEffect(() => {
    const listener = (event) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}

const isMacPlatform = () => /Mac|iPhone|iPad/.test(navigator.platform);

function matches(event, combo) {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop();
  const wantsMod = parts.includes("mod");
  const wantsShift = parts.includes("shift");
  const wantsAlt = parts.includes("alt");
  const mod = isMacPlatform() ? event.metaKey : event.ctrlKey;

  if (wantsMod !== mod || wantsAlt !== event.altKey) return false;
  // "?" is itself a shifted key, so only enforce Shift for letter combos.
  if (/^[a-z0-9]$|^(backspace|enter|arrowup|arrowdown|escape|\.|\/|\\)$/.test(key) && wantsShift !== event.shiftKey) {
    return false;
  }
  if (/^[a-z]$/.test(key)) return event.code === `Key${key.toUpperCase()}`;
  return event.key.toLowerCase() === key;
}
