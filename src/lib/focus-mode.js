/*
 * Focus mode: the open note fills the screen without the sidebar, note
 * toolbar or tags. The whole page goes full screen (not just the editor),
 * so menus and popovers, which render at the end of <body>, keep working.
 * Where the browser has no full screen (iPhone Safari), the chrome is
 * still hidden.
 *
 * Attributes on <html>, used by CSS in globals.css:
 *   data-focus-mode   focus mode is on
 *   data-focus-dim    documents dim every paragraph but the current one
 */

const DIM_KEY = "qn:focus-dim";

let active = false;
let usingFullscreen = false;
let dim = readDim();
const listeners = new Set();

function readDim() {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(DIM_KEY) !== "0";
  } catch {
    return true;
  }
}

function notify() {
  snapshot = { active, dim };
  listeners.forEach((listener) => listener());
}

let snapshot = { active, dim };
export function focusModeSnapshot() {
  return snapshot;
}

export function subscribeFocusMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function setFocusMode(on) {
  if (on === active) return;
  active = on;
  const root = document.documentElement;
  root.toggleAttribute("data-focus-mode", on);
  root.toggleAttribute("data-focus-dim", on && dim);
  notify();
  try {
    if (on && !document.fullscreenElement && root.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: "hide" });
      usingFullscreen = true;
    } else if (!on && document.fullscreenElement && usingFullscreen) {
      usingFullscreen = false;
      await document.exitFullscreen();
    }
  } catch {
    // Full screen refused (iframe, permissions): focus mode still hides the chrome.
    usingFullscreen = false;
  }
}

export function toggleFocusMode() {
  return setFocusMode(!active);
}

export function setFocusDim(on) {
  dim = on;
  try {
    localStorage.setItem(DIM_KEY, on ? "1" : "0");
  } catch {}
  document.documentElement.toggleAttribute("data-focus-dim", active && on);
  notify();
}

// The browser's own Esc (or F11) leaves full screen: leave focus mode with it.
if (typeof document !== "undefined") {
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && usingFullscreen) {
      usingFullscreen = false;
      setFocusMode(false);
    }
  });
}
