"use client";

import { MenuCheckboxItem, MenuSeparator } from "@/components/ui/menu";
import { alignNodes, patchNodes, reorder, SHAPES } from "@/lib/editor/canvas-model";
import { PointerMenu, PointerMenuItem, PointerSubMenu as SubMenu, ShowHiddenTextItem } from "../pointer-menu";
import { TextBoxItems } from "./text-box-menu";

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

export const ARRANGE_ACTIONS = [
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
 * clicked: "nodes" (the current selection), "text-edit" (inside a text box
 * being typed in), "edge" or "pane" (empty board, with the flow-space
 * `point` that was clicked).
 */
export function CanvasContextMenu({ menu, onClose, doc, readOnly, selection, board }) {
  const kind = menu.target?.kind;
  const editingNode = kind === "text-edit" ? board.nodeById(menu.target.nodeId) : null;
  return (
    <PointerMenu menu={menu} onClose={onClose}>
      {editingNode && !readOnly && (
        <TextBoxItems doc={doc} editing getEditor={board.getEditor} nodes={[editingNode]} onError={board.onError} />
      )}
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
  const textNodes = nodes.filter((node) => ["text", "sticky", "shape"].includes(node.type));
  const allSecret = textNodes.length > 0 && textNodes.every((node) => node.data.secret);
  // Text and box options show when every selected item is a text box or shape.
  const textBoxes = nodes.every((node) => node.type === "text" || node.type === "shape") ? nodes : [];
  const shapes = nodes.every((node) => node.type === "shape") ? nodes : [];
  if (!ids.length) return null;

  return (
    <>
      {shapes.length > 0 && <ChangeShape doc={doc} nodes={shapes} />}
      {textBoxes.length > 0 && (
        <>
          <TextBoxItems doc={doc} getEditor={board.getEditor} nodes={textBoxes} onError={board.onError} />
          <MenuSeparator />
        </>
      )}
      {single && ["text", "sticky", "shape"].includes(single.type) && (
        <PointerMenuItem icon="mdi:pencil-outline" label="Edit text" onClick={() => board.editNode(single.id)} shortcut="Enter" />
      )}
      {single?.type === "frame" && (
        <PointerMenuItem icon="mdi:rename-outline" label="Rename group" onClick={() => board.renameGroup(single.id)} />
      )}
      <PointerMenuItem icon="mdi:content-cut" label="Cut" onClick={board.cutSelection} shortcut="Mod X" />
      <PointerMenuItem icon="mdi:content-copy" label="Copy" onClick={board.copySelection} shortcut="Mod C" />
      <PointerMenuItem icon="mdi:content-paste" label="Paste" onClick={() => board.pasteAt()} shortcut="Mod V" />
      <PointerMenuItem icon="mdi:content-duplicate" label="Duplicate" onClick={board.duplicateSelection} shortcut="Mod D" />
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
          <SubMenu icon="mdi:shape-plus-outline" label="Add shape here">
            {Object.entries(SHAPES).map(([key, shape]) => (
              <PointerMenuItem
                icon={shape.icon}
                key={key}
                label={shape.label}
                onClick={() => board.addShape(key, point)}
                shortcut={key === "process" ? "R" : key === "decision" ? "D" : undefined}
              />
            ))}
          </SubMenu>
          <PointerMenuItem icon="mdi:content-paste" label="Paste here" onClick={() => board.pasteAt(point)} shortcut="Mod V" />
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
      <MenuCheckboxItem checked={board.prefs.guides} onCheckedChange={(value) => board.setPref("guides", value)}>
        Alignment guides
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

// Swap the outline of the selected shapes; text and style stay.
function ChangeShape({ doc, nodes }) {
  const current = nodes.every((node) => node.data.shape === nodes[0].data.shape) ? nodes[0].data.shape : null;
  return (
    <SubMenu icon="mdi:shape-outline" label="Change shape">
      {Object.entries(SHAPES).map(([key, shape]) => (
        <PointerMenuItem
          icon={current === key ? "mdi:check" : shape.icon}
          key={key}
          label={shape.label}
          onClick={() =>
            patchNodes(
              doc,
              nodes.map((node) => node.id),
              { shape: key },
            )
          }
        />
      ))}
    </SubMenu>
  );
}
