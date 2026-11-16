"use client";

import { MenuCheckboxItem, MenuSeparator } from "@/components/ui/menu";
import { alignNodes, patchNodes, reorder } from "@/lib/editor/canvas-model";
import { PointerMenu, PointerMenuItem, PointerSubMenu as SubMenu, ShowHiddenTextItem } from "../pointer-menu";

// Shared with the selection toolbar. `min`: how many boxes the action needs.
export const ALIGN_ACTIONS = [
  { mode: "left", label: "Align left", icon: "mdi:align-horizontal-left" },
  { mode: "center", label: "Align centers", icon: "mdi:align-horizontal-center" },
  { mode: "right", label: "Align right", icon: "mdi:align-horizontal-right" },
  { mode: "top", label: "Align top", icon: "mdi:align-vertical-top" },
  { mode: "middle", label: "Align middles", icon: "mdi:align-vertical-center" },
  { mode: "bottom", label: "Align bottom", icon: "mdi:align-vertical-bottom" },
  { mode: "spread-x", label: "Spread horizontally", icon: "mdi:distribute-horizontal-center", min: 3 },
  { mode: "spread-y", label: "Spread vertically", icon: "mdi:distribute-vertical-center", min: 3 },
];

const ARRANGE_ACTIONS = [
  { direction: "front", label: "Bring to front", icon: "mdi:arrange-bring-to-front", shortcut: "Mod Shift ]" },
  { direction: "forward", label: "Bring forward", icon: "mdi:arrange-bring-forward", shortcut: "Mod ]" },
  { direction: "backward", label: "Send backward", icon: "mdi:arrange-send-backward", shortcut: "Mod [" },
  { direction: "back", label: "Send to back", icon: "mdi:arrange-send-to-back", shortcut: "Mod Shift [" },
];

const ADD_HERE = [
  { type: "text", label: "Text", icon: "mdi:format-text", shortcut: "T" },
  { type: "sticky", label: "Sticky note", icon: "mdi:note-outline", shortcut: "S" },
  { type: "frame", label: "Group", icon: "mdi:group", shortcut: "G" },
];

/*
 * Right-click menu for the board. `menu.target.kind` says what was
 * clicked: "nodes" (the current selection), "edge" or "pane" (empty
 * board, with the flow-space `point` that was clicked).
 */
export function CanvasContextMenu({ menu, onClose, doc, readOnly, selection, board }) {
  const kind = menu.target?.kind;
  return (
    <PointerMenu menu={menu} onClose={onClose}>
      {kind === "nodes" && !readOnly && <NodeItems board={board} doc={doc} selection={selection} />}
      {kind === "edge" && !readOnly && (
        <PointerMenuItem destructive icon="mdi:delete-outline" label="Delete arrow" onClick={board.deleteSelection} shortcut="Backspace" />
      )}
      {(kind === "pane" || readOnly) && <PaneItems board={board} point={menu.target?.point} readOnly={readOnly} />}
      <ShowHiddenTextItem />
    </PointerMenu>
  );
}

function NodeItems({ doc, selection, board }) {
  const { ids, nodes } = selection;
  const single = nodes.length === 1 ? nodes[0] : null;
  const hasFrames = nodes.some((node) => node.type === "frame");
  const allLocked = nodes.length > 0 && nodes.every((node) => node.data.locked);
  const textNodes = nodes.filter((node) => node.type === "text" || node.type === "sticky");
  const allSecret = textNodes.length > 0 && textNodes.every((node) => node.data.secret);
  if (!ids.length) return null;

  return (
    <>
      {single && (single.type === "text" || single.type === "sticky") && (
        <PointerMenuItem icon="mdi:pencil-outline" label="Edit text" onClick={() => board.editNode(single.id)} shortcut="Enter" />
      )}
      <PointerMenuItem icon="mdi:content-copy" label="Duplicate" onClick={board.duplicateSelection} shortcut="Mod D" />
      {hasFrames ? (
        <PointerMenuItem icon="mdi:ungroup" label="Ungroup" onClick={board.ungroupSelection} shortcut="Mod Shift G" />
      ) : (
        <PointerMenuItem icon="mdi:group" label="Group" onClick={board.groupSelection} shortcut="Mod G" />
      )}

      <MenuSeparator />

      {ids.length > 1 && (
        <SubMenu icon="mdi:align-horizontal-left" label="Align">
          {ALIGN_ACTIONS.filter((action) => ids.length >= (action.min ?? 2)).map((action) => (
            <PointerMenuItem
              icon={action.icon}
              key={action.mode}
              label={action.label}
              onClick={() => alignNodes(doc, ids, action.mode)}
            />
          ))}
        </SubMenu>
      )}
      <SubMenu icon="mdi:layers-outline" label="Arrange">
        {ARRANGE_ACTIONS.map((action) => (
          <PointerMenuItem
            icon={action.icon}
            key={action.direction}
            label={action.label}
            onClick={() => reorder(doc, ids, action.direction)}
            shortcut={action.shortcut}
          />
        ))}
      </SubMenu>
      <PointerMenuItem
        icon={allLocked ? "mdi:lock-open-variant-outline" : "mdi:lock-outline"}
        label={allLocked ? "Unlock" : "Lock"}
        onClick={board.toggleLock}
        shortcut="Mod Shift L"
      />
      <PointerMenuItem icon="mdi:eye-off-outline" label="Hide" onClick={() => patchNodes(doc, ids, { hidden: true })} />
      {textNodes.length > 0 && (
        <PointerMenuItem
          icon={allSecret ? "mdi:check" : "mdi:dots-horizontal"}
          label="Hidden text"
          onClick={() => patchNodes(doc, textNodes.map((node) => node.id), { secret: !allSecret })}
        />
      )}

      <MenuSeparator />
      <PointerMenuItem
        destructive
        disabled={allLocked}
        icon="mdi:delete-outline"
        label="Delete"
        onClick={board.deleteSelection}
        shortcut="Backspace"
      />
    </>
  );
}

function PaneItems({ board, point, readOnly }) {
  return (
    <>
      {!readOnly && (
        <>
          <SubMenu icon="mdi:plus-box-outline" label="Add here">
            {ADD_HERE.map((tool) => (
              <PointerMenuItem
                icon={tool.icon}
                key={tool.type}
                label={tool.label}
                onClick={() => board.addAt(tool.type, point)}
                shortcut={tool.shortcut}
              />
            ))}
            <PointerMenuItem icon="mdi:image-plus-outline" label="Image or file…" onClick={() => board.pickFiles(point)} />
          </SubMenu>
          <PointerMenuItem disabled={!board.canUndo} icon="mdi:undo" label="Undo" onClick={board.undo} shortcut="Mod Z" />
          <PointerMenuItem disabled={!board.canRedo} icon="mdi:redo" label="Redo" onClick={board.redo} shortcut="Mod Shift Z" />
          <PointerMenuItem disabled={board.empty} icon="mdi:select-all" label="Select all" onClick={board.selectAll} />
          <MenuSeparator />
        </>
      )}
      <PointerMenuItem icon="mdi:fit-to-screen-outline" label="Zoom to fit" onClick={board.fitView} />
      <PointerMenuItem icon="mdi:magnify-scan" label="Zoom to 100%" onClick={board.resetZoom} />
      <MenuSeparator />
      <MenuCheckboxItem checked={board.prefs.snap} onCheckedChange={(value) => board.setPref("snap", value)}>
        Snap to grid
      </MenuCheckboxItem>
      <MenuCheckboxItem
        checked={board.prefs.minimap}
        className="max-md:hidden"
        onCheckedChange={(value) => board.setPref("minimap", value)}
      >
        Mini map
      </MenuCheckboxItem>
      <MenuCheckboxItem checked={board.prefs.layers} onCheckedChange={(value) => board.setPref("layers", value)}>
        Layers panel
      </MenuCheckboxItem>
    </>
  );
}
