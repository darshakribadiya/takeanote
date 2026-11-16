"use client";

import { Icon } from "@iconify/react";
import { BubbleMenu } from "@tiptap/react/menus";

// Shared with the right-click menu (document-context-menu.jsx).
export const TABLE_ACTIONS = [
  { label: "Row above", icon: "mdi:table-row-plus-before", run: (c) => c.addRowBefore() },
  { label: "Row below", icon: "mdi:table-row-plus-after", run: (c) => c.addRowAfter() },
  { label: "Column left", icon: "mdi:table-column-plus-before", run: (c) => c.addColumnBefore() },
  { label: "Column right", icon: "mdi:table-column-plus-after", run: (c) => c.addColumnAfter() },
  { divider: true },
  { label: "Delete row", icon: "mdi:table-row-remove", run: (c) => c.deleteRow() },
  { label: "Delete column", icon: "mdi:table-column-remove", run: (c) => c.deleteColumn() },
  { label: "Merge or split cells", icon: "mdi:table-merge-cells", run: (c) => c.mergeOrSplit() },
  { label: "Toggle header row", icon: "mdi:table-headers-eye", run: (c) => c.toggleHeaderRow() },
  { divider: true },
  { label: "Delete table", icon: "mdi:table-remove", run: (c) => c.deleteTable(), danger: true },
];

function tableElement(editor) {
  const { node } = editor.view.domAtPos(editor.state.selection.from);
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element?.closest("table") ?? null;
}

// Row / column tools, shown under the table the caret is in.
export function TableMenu({ editor }) {
  return (
    <BubbleMenu
      className="z-30 flex max-w-[calc(100vw-1rem)] items-center gap-0.5 overflow-x-auto rounded-xl border bg-popover p-1 shadow-lg/5"
      editor={editor}
      getReferencedVirtualElement={() => {
        const table = tableElement(editor);
        return table ? { getBoundingClientRect: () => table.getBoundingClientRect() } : null;
      }}
      options={{ placement: "bottom", offset: 8, flip: false, shift: { padding: 8 } }}
      pluginKey="tableMenu"
      shouldShow={({ editor: current }) => current.isEditable && current.isActive("table")}
    >
      {TABLE_ACTIONS.map((action, index) =>
        action.divider ? (
          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" key={index} />
        ) : (
          <button
            aria-label={action.label}
            className={
              action.danger
                ? "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-destructive-foreground hover:bg-destructive/8"
                : "inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent"
            }
            key={action.label}
            onClick={() => action.run(editor.chain().focus()).run()}
            onMouseDown={(event) => event.preventDefault()}
            title={action.label}
            type="button"
          >
            <Icon className="size-4.5" icon={action.icon} />
          </button>
        ),
      )}
    </BubbleMenu>
  );
}
