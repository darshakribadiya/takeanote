"use client";

import { useEffect, useRef } from "react";
import { Collaboration } from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useSecretsRevealed } from "@/hooks/use-secrets-revealed";
import { MarkdownPaste } from "@/lib/editor/extensions";
import { SecretText, toBraille } from "@/lib/editor/secret-text";
import { nodeField } from "@/lib/sync/doc-model";
import { cn } from "@/lib/utils";

// Font size range while a text box is being resized, in px at 100% zoom.
const MIN_FIT_PX = 8;
const MAX_FIT_PX = 200;

/*
 * Rich text inside one canvas node, bound to its own Yjs fragment
 * (`node:<id>`). Read-only until the node is in edit mode, so a drag on
 * the node moves it instead of selecting text.
 *
 * `variant`:
 *   "text"      a text box. Typing keeps the font size and grows the box
 *               (wider first, taller once a line reaches ~40em) through
 *               `onGrow({ width, height })`. While `resizing` (the user drags
 *               an edge) the font scales to fill the box instead, and the
 *               final size is reported once through `onFontFit(px)`.
 *   "shape"     the label inside a flowchart shape: centred, wraps inside
 *               the shape, never grows the box or scrolls.
 *   "document"  a sticky note: a small markdown document with code blocks,
 *               rules and markdown paste, at a fixed size, scrolling when
 *               longer than the note.
 * `onEditor(editor)`: lets the board's right-click menu format this text;
 * returns an unregister function. `measureKey` changes with the font, so
 * a bigger size or a wider font grows the box too.
 * `secret`: the whole box shows as Braille patterns (except while it is
 * being edited, or when "Show hidden text" is on).
 */
export function CanvasText({
  doc,
  nodeId,
  editing,
  readOnly,
  placeholder,
  onExit,
  className,
  secret,
  variant = "text",
  resizing = false,
  onGrow,
  onFontFit,
  onEditor,
  measureKey,
}) {
  const isDocument = variant === "document";
  const isShape = variant === "shape";
  // Typing grows the box and dragging an edge scales the font: plain text boxes only.
  const sizesItself = variant === "text";
  const proseClass = isDocument
    ? "canvas-prose canvas-doc"
    : isShape
      ? "canvas-prose canvas-shape-label"
      : "canvas-prose canvas-label";
  const boxRef = useRef(null);
  // Latest callbacks for the measuring effects, without re-subscribing on every render.
  const callbacks = useRef({ onGrow, onFontFit });
  useEffect(() => {
    callbacks.current = { onGrow, onFontFit };
  });

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: false,
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true },
          ...(isDocument ? {} : { codeBlock: false, horizontalRule: false }),
          trailingNode: false,
        }),
        Collaboration.configure({ document: doc, field: nodeField(nodeId) }),
        Placeholder.configure({ placeholder }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TextStyle,
        Color,
        SecretText,
        ...(isDocument ? [Markdown, MarkdownPaste] : []),
      ],
      editable: false,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: proseClass, "aria-label": isDocument ? "Sticky note" : "Canvas text" },
        handleKeyDown: (_view, event) => {
          if (event.key !== "Escape") return false;
          onExit?.();
          return true;
        },
      },
    },
    [doc, nodeId, isDocument],
  );

  const active = editing && !readOnly;
  const masked = secret && !active;
  const revealed = useSecretsRevealed();
  const braille = useEditorState({
    editor,
    selector: ({ editor: current }) => (masked && current ? toBraille(current.getText({ blockSeparator: "\n" })) : ""),
  });

  useEffect(() => {
    if (editor && onEditor) return onEditor(editor);
  }, [editor, onEditor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(active);
    if (active) editor.commands.focus("end");
  }, [editor, active]);

  // Typing: keep the font, grow the box to fit the text.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !editor || !sizesItself || resizing) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const need = overflow(box);
        if (need.width > 0 || need.height > 0) callbacks.current.onGrow?.(need);
      });
    };
    editor.on("update", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      editor.off("update", measure);
    };
    // Re-measure when the Braille copy replaces the text or the text comes back.
  }, [editor, sizesItself, resizing, masked, revealed, measureKey]);

  // Resizing: scale the font to fill the box, then report the final size once.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !editor || !sizesItself || !resizing) return;
    const observer = new ResizeObserver(() => fitTextToBox(box));
    observer.observe(box);
    return () => {
      observer.disconnect();
      const px = Number.parseFloat(box.style.getPropertyValue("--canvas-font-size"));
      if (px) callbacks.current.onFontFit?.(px);
      // Keep the fitted size on screen until the saved size has rendered.
      requestAnimationFrame(() => requestAnimationFrame(() => box.style.removeProperty("--canvas-font-size")));
    };
  }, [editor, sizesItself, resizing]);

  return (
    <div className={cn("h-full min-h-0", isShape && "flex items-center", masked && "secret-box")} ref={boxRef}>
      {masked && (
        <div aria-hidden="true" className={cn("secret-braille whitespace-pre-line", proseClass)}>
          {braille}
        </div>
      )}
      <EditorContent
        className={cn(
          isShape ? "max-h-full w-full overflow-hidden" : "h-full min-h-0 overflow-hidden",
          // A long sticky note scrolls inside itself; text boxes grow instead, so never a scrollbar.
          isDocument && "nowheel overflow-y-auto",
          active && cn("nodrag nopan nowheel cursor-text", isDocument && "overflow-auto"),
          className,
        )}
        editor={editor}
      />
    </div>
  );
}

// The visible text: the editor, or its Braille copy while the box is hidden.
function visibleProse(box) {
  return [...box.querySelectorAll(".canvas-prose")].find((element) => element.getClientRects().length);
}

/*
 * How much bigger the box must get to show all of its text. `.canvas-label`
 * is as wide as its longest line (up to ~40em), so a long line shows up as
 * extra width and wrapped lines as extra height.
 * Example: a 160×40 box whose line is now 230px wide -> { width: 70, height: 0 }
 */
function overflow(box) {
  const prose = visibleProse(box);
  if (!prose || !box.clientWidth || !box.clientHeight) return { width: 0, height: 0 };
  return {
    width: Math.ceil(prose.offsetWidth - box.clientWidth),
    height: Math.ceil(prose.offsetHeight - box.clientHeight),
  };
}

/*
 * Binary search for the largest font size whose text fits the box. Sizes
 * are set on the box as `--canvas-font-size`, which `.canvas-prose` reads.
 * Example: a 240×80 box holding "Hello" -> about 40px; double the box -> about 80px.
 */
function fitTextToBox(box) {
  const prose = visibleProse(box);
  if (!prose || !box.clientWidth || !box.clientHeight) return;
  let low = MIN_FIT_PX;
  let high = MAX_FIT_PX;
  while (high - low > 0.5) {
    const size = (low + high) / 2;
    box.style.setProperty("--canvas-font-size", `${size}px`);
    const fits = prose.offsetHeight <= box.clientHeight && prose.offsetWidth <= box.clientWidth;
    if (fits) low = size;
    else high = size;
  }
  box.style.setProperty("--canvas-font-size", `${Math.floor(low)}px`);
}
