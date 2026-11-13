"use client";

const WIDTH_KEY = "qn:sidebar-width";
export const DEFAULT_SIDEBAR_WIDTH = 300;
const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
// The editor always keeps at least this much room.
const MIN_EDITOR_WIDTH = 420;

export function clampSidebarWidth(width) {
  const room = typeof window === "undefined" ? MAX_WIDTH : window.innerWidth - MIN_EDITOR_WIDTH;
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, room))));
}

export function readSidebarWidth() {
  try {
    // Older builds stored the width of the separate note list.
    const stored = Number(localStorage.getItem(WIDTH_KEY) ?? localStorage.getItem("qn:list-width"));
    return stored ? clampSidebarWidth(stored) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function saveSidebarWidth(width) {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch {}
}

/*
 * Drag the sidebar's right edge to resize it (desktop). Keyboard: focus
 * the edge and use ← / → (Shift for bigger steps), Home / End for the
 * limits; double-click resets.
 */
export function SidebarResizeHandle({ width, onChange }) {
  function set(next, commit) {
    const clamped = clampSidebarWidth(next);
    onChange(clamped);
    if (commit) saveSidebarWidth(clamped);
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (moveEvent) => {
      latest = startWidth + moveEvent.clientX - startX;
      set(latest, false);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      set(latest, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  function handleKeyDown(event) {
    const step = event.shiftKey ? 64 : 16;
    const next = { ArrowLeft: width - step, ArrowRight: width + step, Home: MIN_WIDTH, End: MAX_WIDTH }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    set(next, true);
  }

  return (
    <div
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemax={MAX_WIDTH}
      aria-valuemin={MIN_WIDTH}
      aria-valuenow={width}
      className="group absolute inset-y-0 -right-1.5 z-30 hidden w-3 cursor-col-resize touch-none outline-none md:block"
      onDoubleClick={() => set(DEFAULT_SIDEBAR_WIDTH, true)}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      role="separator"
      tabIndex={0}
      title="Drag to resize · double-click to reset"
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary group-active:bg-primary/64" />
    </div>
  );
}
