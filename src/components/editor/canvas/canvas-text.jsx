"use client";

import { useEffect } from "react";
import { Collaboration } from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { nodeField } from "@/lib/sync/doc-model";
import { cn } from "@/lib/utils";

/*
 * Rich text inside one canvas node, bound to its own Yjs fragment
 * (`node:<id>`). Read-only until the node is in edit mode, so a drag on
 * the node moves it instead of selecting text.
 */
export function CanvasText({ doc, nodeId, editing, readOnly, placeholder, onExit, className }) {
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
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(active);
    if (active) editor.commands.focus("end");
  }, [editor, active]);

  return (
    <EditorContent
      className={cn("h-full min-h-0 overflow-hidden", active && "nodrag nopan nowheel cursor-text overflow-auto", className)}
      editor={editor}
    />
  );
}
