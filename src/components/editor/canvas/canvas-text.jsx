"use client";

import { useEffect, useRef } from "react";
import { Collaboration } from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useSecretsRevealed } from "@/hooks/use-secrets-revealed";
import { SecretText, toBraille } from "@/lib/editor/secret-text";
import { nodeField } from "@/lib/sync/doc-model";
import { cn } from "@/lib/utils";

// Bounds for auto-fit text, in px at 100% zoom.
const MIN_FIT_PX = 8;
const MAX_FIT_PX = 200;

/*
 * Rich text inside one canvas node, bound to its own Yjs fragment
 * (`node:<id>`). Read-only until the node is in edit mode, so a drag on
 * the node moves it instead of selecting text.
 *
 * `autoFit`: the font size follows the box: the largest size at which the
 * text still fits, re-measured when the box is resized or the text changes.
 * `secret`: the whole box shows as Braille patterns (except while it is
 * being edited, or when "Show hidden text" is on).
 */
export function CanvasText({ doc, nodeId, editing, readOnly, placeholder, onExit, className, autoFit, secret }) {
  const boxRef = useRef(null);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: false,
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true },
          codeBlock: false,
          horizontalRule: false,
          trailingNode: false,
        }),
        Collaboration.configure({ document: doc, field: nodeField(nodeId) }),
        Placeholder.configure({ placeholder }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TextStyle,
        Color,
        SecretText,
      ],
      editable: false,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: "canvas-prose", "aria-label": "Canvas text" },
        handleKeyDown: (_view, event) => {
          if (event.key !== "Escape") return false;
          onExit?.();
          return true;
        },
      },
    },
    [doc, nodeId],
  );

  const active = editing && !readOnly;
  const masked = secret && !active;
  const revealed = useSecretsRevealed();
  const braille = useEditorState({
    editor,
    selector: ({ editor: current }) => (masked && current ? toBraille(current.getText({ blockSeparator: "\n" })) : ""),
  });
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(active);
    if (active) editor.commands.focus("end");
  }, [editor, active]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (!autoFit || !editor) {
      box.style.removeProperty("--canvas-font-size");
      return;
    }
    let frame = 0;
    const refit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitTextToBox(box));
    };
    const observer = new ResizeObserver(refit);
    observer.observe(box);
    editor.on("update", refit);
    refit();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      editor.off("update", refit);
    };
    // Re-measure when the Braille copy replaces the text or the text comes back.
  }, [autoFit, editor, masked, revealed]);

  return (
    <div className={cn("h-full min-h-0", masked && "secret-box")} ref={boxRef}>
      {masked && (
        <div aria-hidden="true" className="secret-braille canvas-prose whitespace-pre-line">
          {braille}
        </div>
      )}
      <EditorContent
        className={cn("h-full min-h-0 overflow-hidden", active && "nodrag nopan nowheel cursor-text overflow-auto", className)}
        editor={editor}
      />
    </div>
  );
}

/*
 * Binary search for the largest font size whose text fits the box. Sizes
 * are set on the box as `--canvas-font-size`, which `.canvas-prose` reads.
 * Example: a 240×80 box holding "Hello" -> about 40px; double the box -> about 80px.
 */
function fitTextToBox(box) {
  // The visible one: the editor, or its Braille copy while the box is hidden.
  const prose = [...box.querySelectorAll(".canvas-prose")].find((element) => element.getClientRects().length);
  if (!prose || !box.clientWidth || !box.clientHeight) return;
  let low = MIN_FIT_PX;
  let high = MAX_FIT_PX;
  while (high - low > 0.5) {
    const size = (low + high) / 2;
    box.style.setProperty("--canvas-font-size", `${size}px`);
    const fits = prose.scrollHeight <= box.clientHeight && prose.scrollWidth <= box.clientWidth;
    if (fits) low = size;
    else high = size;
  }
  box.style.setProperty("--canvas-font-size", `${Math.floor(low)}px`);
}
