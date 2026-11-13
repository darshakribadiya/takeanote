"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useEditorState } from "@tiptap/react";
import { MARKS } from "@/lib/editor/formatting";
import { cn } from "@/lib/utils";

/*
 * Touch devices: a formatting strip docked above the on-screen keyboard
 * while the editor has focus. Hidden the rest of the time.
 */
export function MobileToolbar({ editor, onPickFile }) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      focused: current.isFocused,
      editable: current.isEditable,
      marks: Object.fromEntries(MARKS.map((mark) => [mark.id, current.isActive(mark.id)])),
      heading: current.isActive("heading"),
      bullet: current.isActive("bulletList"),
      task: current.isActive("taskList"),
      canUndo: current.can().undo?.() ?? false,
      canRedo: current.can().redo?.() ?? false,
    }),
  });

  // Keep the strip on top of the keyboard (iOS resizes only the visual viewport).
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setKeyboardOffset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  if (!state?.focused || !state.editable) return null;
  const chain = () => editor.chain().focus();

  const buttons = [
    { label: "Undo", icon: "mdi:undo", run: () => chain().undo().run(), disabled: !state.canUndo },
    { label: "Redo", icon: "mdi:redo", run: () => chain().redo().run(), disabled: !state.canRedo },
    { divider: true },
    ...MARKS.slice(0, 4).map((mark) => ({
      label: mark.label,
      icon: mark.icon,
      active: state.marks[mark.id],
      run: () => mark.run(chain()).run(),
    })),
    { divider: true },
    { label: "Heading", icon: "mdi:format-header-pound", active: state.heading, run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: "Bulleted list", icon: "mdi:format-list-bulleted", active: state.bullet, run: () => chain().toggleBulletList().run() },
    { label: "Checklist", icon: "mdi:checkbox-marked-outline", active: state.task, run: () => chain().toggleTaskList().run() },
    { label: "Indent", icon: "mdi:format-indent-increase", run: () => (editor.isActive("listItem") ? chain().sinkListItem("listItem").run() : chain().indent().run()) },
    { label: "Outdent", icon: "mdi:format-indent-decrease", run: () => (editor.isActive("listItem") ? chain().liftListItem("listItem").run() : chain().outdent().run()) },
    { label: "Image", icon: "mdi:image-outline", run: () => onPickFile("image/*") },
    { label: "Done", icon: "mdi:keyboard-close-outline", run: () => editor.commands.blur() },
  ];

  return (
    <div
      className="fixed inset-x-0 z-40 border-t bg-popover/96 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      role="toolbar"
      aria-label="Formatting"
      style={{ bottom: keyboardOffset }}
    >
      <div className="flex items-center gap-0.5 overflow-x-auto px-1 py-1">
        {buttons.map((button, index) =>
          button.divider ? (
            <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-border" key={index} />
          ) : (
            <button
              aria-label={button.label}
              aria-pressed={button.active === undefined ? undefined : button.active}
              className={cn(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-lg disabled:opacity-40",
                button.active && "bg-accent text-accent-foreground",
              )}
              disabled={button.disabled}
              key={button.label}
              onClick={button.run}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <Icon className="size-5" icon={button.icon} />
            </button>
          ),
        )}
      </div>
    </div>
  );
}
