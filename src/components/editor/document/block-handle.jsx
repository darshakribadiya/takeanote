"use client";

import { useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuShortcut, MenuSub, MenuSubPopup, MenuSubTrigger } from "@/components/ui/menu";
import { BLOCK_TYPES, formatShortcut } from "@/lib/editor/formatting";
import { isMac } from "@/lib/format";

/*
 * Hover handle left of each block: "+" inserts a block below (opening
 * the / menu), the grip drags the block or opens block actions.
 */
export function BlockHandle({ editor }) {
  const target = useRef(null);
  // The handle hides once the pointer leaves the block; keep where it was.
  const anchorRect = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const mac = isMac();

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
    if (block) editor.chain().moveBlock(direction, block.pos).focus(undefined, { scrollIntoView: false }).run();
  }

  function turnInto(type) {
    const block = current();
    if (!block) return;
    type.run(editor.chain().focus().setTextSelection(block.pos + 1)).run();
  }

  function duplicate() {
    const block = current();
    if (block) editor.chain().duplicateBlock(block.pos).focus(undefined, { scrollIntoView: false }).run();
  }

  function remove() {
    const block = current();
    if (block) editor.chain().focus().deleteRange({ from: block.pos, to: block.end }).run();
  }

  return (
    <DragHandle
      className="block-handle"
      editor={editor}
      getReferencedVirtualElement={() => firstLineAnchor(editor, target.current)}
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
              <MenuShortcut>{formatShortcut("Alt ↑", mac)}</MenuShortcut>
            </MenuItem>
            <MenuItem onClick={() => move(1)}>
              <Icon icon="mdi:arrow-down" />
              Move down
              <MenuShortcut>{formatShortcut("Alt ↓", mac)}</MenuShortcut>
            </MenuItem>
            <MenuItem onClick={duplicate}>
              <Icon icon="mdi:content-copy" />
              Duplicate
              <MenuShortcut>{formatShortcut("Mod D", mac)}</MenuShortcut>
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

const HANDLE_HEIGHT = 24;

/*
 * Anchor the handle on the middle of the block's first line, so it sits
 * level with a big heading or a tall image instead of their top edge.
 * Example: H1 with a 40px line at y=100 -> anchor box y=108..132.
 */
function firstLineAnchor(editor, block) {
  if (!block?.node || block.pos == null) return null;
  const dom = editor.view.nodeDOM(block.pos);
  if (!(dom instanceof Element)) return null;
  const blockRect = dom.getBoundingClientRect();
  const line = firstLineRect(dom);
  if (!line) return null;
  // A tall image centres on its visible part so the handle stays on screen.
  const visibleTop = Math.max(line.top, 0);
  const visibleBottom = Math.min(line.bottom, window.innerHeight);
  const center = visibleBottom > visibleTop ? (visibleTop + visibleBottom) / 2 : (line.top + line.bottom) / 2;
  const top = center - HANDLE_HEIGHT / 2;
  const rect = new DOMRect(blockRect.left, top, blockRect.width, HANDLE_HEIGHT);
  return { getBoundingClientRect: () => rect };
}

function firstLineRect(dom) {
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) || ["IMG", "VIDEO", "IFRAME", "HR"].includes(node.nodeName)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  });
  const leaf = walker.nextNode();
  if (!leaf) {
    // Empty block: the line box is the block's own content box.
    const style = getComputedStyle(dom);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const top = dom.getBoundingClientRect().top + parseFloat(style.paddingTop || 0);
    return { top, bottom: top + lineHeight, height: lineHeight };
  }
  if (leaf.nodeType !== Node.TEXT_NODE) return leaf.getBoundingClientRect();
  const range = document.createRange();
  range.setStart(leaf, 0);
  range.setEnd(leaf, Math.min(1, leaf.length));
  return range.getClientRects()[0] ?? null;
}
