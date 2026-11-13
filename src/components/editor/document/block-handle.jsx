"use client";

import { useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuSub, MenuSubPopup, MenuSubTrigger } from "@/components/ui/menu";
import { BLOCK_TYPES } from "@/lib/editor/formatting";

/*
 * Hover handle left of each block: "+" inserts a block below (opening
 * the / menu), the grip drags the block or opens block actions.
 */
export function BlockHandle({ editor }) {
  const target = useRef(null);
  // The handle hides once the pointer leaves the block; keep where it was.
  const anchorRect = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function current() {
    const { node, pos } = target.current ?? {};
    if (!node || pos == null) return null;
    return { node, pos, end: pos + node.nodeSize };
  }

  function insertBelow() {
    const block = current();
    if (!block) return;
    editor
      .chain()
      .insertContentAt(block.end, { type: "paragraph" })
      .setTextSelection(block.end + 1)
      .insertContent("/")
      .focus()
      .run();
  }

  function move(direction) {
    const block = current();
    if (!block) return;
    const $pos = editor.state.doc.resolve(block.pos);
    const index = $pos.index();
    const parent = $pos.parent;
    const neighbourIndex = index + direction;
    if (neighbourIndex < 0 || neighbourIndex >= parent.childCount) return;
    const neighbour = parent.child(neighbourIndex);
    const { tr } = editor.state;
    tr.delete(block.pos, block.end);
    const insertAt = direction < 0 ? block.pos - neighbour.nodeSize : block.pos + neighbour.nodeSize;
    tr.insert(insertAt, block.node);
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  }

  function turnInto(type) {
    const block = current();
    if (!block) return;
    type.run(editor.chain().focus().setTextSelection(block.pos + 1)).run();
  }

  function duplicate() {
    const block = current();
    if (block) editor.chain().focus().insertContentAt(block.end, block.node.toJSON()).run();
  }

  function remove() {
    const block = current();
    if (block) editor.chain().focus().deleteRange({ from: block.pos, to: block.end }).run();
  }

  return (
    <DragHandle
      className="block-handle"
      editor={editor}
      onNodeChange={({ node, pos }) => {
        if (!menuOpen) target.current = { node, pos };
      }}
    >
      <div className="flex items-center gap-0.5 pe-1">
        <button
          aria-label="Insert block below"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground/72 hover:bg-accent hover:text-foreground"
          onClick={insertBelow}
          title="Insert block below"
          type="button"
        >
          <Icon className="size-4.5" icon="mdi:plus" />
        </button>
        <Menu onOpenChange={setMenuOpen} open={menuOpen}>
          <button
            aria-label="Drag to move, click for options"
            className="flex h-6 w-5 cursor-grab items-center justify-center rounded-md text-muted-foreground/72 hover:bg-accent hover:text-foreground active:cursor-grabbing"
            data-drag-handle=""
            onClick={(event) => {
              anchorRect.current = event.currentTarget.getBoundingClientRect();
              setMenuOpen(true);
            }}
            title="Drag to move · click for options"
            type="button"
          >
            <Icon className="size-4.5" icon="mdi:drag-vertical" />
          </button>
          <MenuPopup align="start" anchor={{ getBoundingClientRect: () => anchorRect.current ?? new DOMRect() }} side="left">
            <MenuSub>
              <MenuSubTrigger>
                <Icon icon="mdi:swap-horizontal" />
                Turn into
              </MenuSubTrigger>
              <MenuSubPopup>
                {BLOCK_TYPES.map((type) => (
                  <MenuItem key={type.id} onClick={() => turnInto(type)}>
                    <Icon icon={type.icon} />
                    {type.label}
                  </MenuItem>
                ))}
              </MenuSubPopup>
            </MenuSub>
            <MenuItem onClick={() => move(-1)}>
              <Icon icon="mdi:arrow-up" />
              Move up
            </MenuItem>
            <MenuItem onClick={() => move(1)}>
              <Icon icon="mdi:arrow-down" />
              Move down
            </MenuItem>
            <MenuItem onClick={duplicate}>
              <Icon icon="mdi:content-copy" />
              Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={remove} variant="destructive">
              <Icon icon="mdi:delete-outline" />
              Delete
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </DragHandle>
  );
}
