"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useEditorState } from "@tiptap/react";

const BUTTON_SIZE = 32;

/*
 * Phones have no hover, so the desktop "+" block handle never shows.
 * Instead, while the caret sits on an empty top-level line, a "+" sits at
 * the end of that line; tapping it opens the / block menu right there.
 */
export function MobileBlockInsert({ editor }) {
  const [rect, setRect] = useState(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { selection } = current.state;
      const { $from, empty } = selection;
      const onEmptyLine =
        empty && $from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;
      return {
        visible: current.isFocused && current.isEditable && onEmptyLine,
        pos: onEmptyLine ? $from.before() : null,
      };
    },
  });
  const visible = state?.visible;
  const pos = state?.pos;

  // Follow the line while the page scrolls or the keyboard resizes the viewport.
  useEffect(() => {
    if (!visible || pos == null) return;
    const update = () => {
      const dom = editor.view.nodeDOM(pos);
      setRect(dom instanceof Element ? dom.getBoundingClientRect() : null);
    };
    update();
    const viewport = window.visualViewport;
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, [editor, visible, pos]);

  if (!visible || !rect) return null;

  function openBlockMenu() {
    editor.chain().focus().insertContent("/").run();
  }

  return (
    <button
      aria-label="Insert block"
      className="fixed z-30 flex items-center justify-center rounded-full border bg-popover text-muted-foreground shadow-sm/5 active:bg-accent active:text-foreground md:hidden"
      // Keep the caret (and the on-screen keyboard) in the editor.
      onMouseDown={(event) => event.preventDefault()}
      onClick={openBlockMenu}
      style={{
        top: rect.top + Math.min(rect.height, 40) / 2 - BUTTON_SIZE / 2,
        left: rect.right - BUTTON_SIZE,
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
      }}
      title="Insert block"
      type="button"
    >
      <Icon className="size-5" icon="mdi:plus" />
    </button>
  );
}
