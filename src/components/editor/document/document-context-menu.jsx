"use client";

import { MenuSeparator } from "@/components/ui/menu";
import { copySelection, pasteInto as paste } from "@/lib/editor/clipboard";
import { activeBlockType, ALIGNMENTS, BLOCK_TYPES, MARKS } from "@/lib/editor/formatting";
import { SLASH_COMMANDS } from "@/lib/editor/slash-commands";
import { PointerMenu, PointerMenuItem, PointerSubMenu as SubMenu, ShowHiddenTextItem, usePointerMenu } from "../pointer-menu";
import { TABLE_ACTIONS } from "./table-menu";

// Blocks worth inserting from a right-click; text styles live under "Turn into".
const INSERT_IDS = ["todo", "table", "divider", "page-break", "image", "file", "date"];
const INSERTS = SLASH_COMMANDS.filter((command) => INSERT_IDS.includes(command.id));

/*
 * Right-click menu for the document body. Right-clicking outside the
 * current selection first moves the caret there, like a desktop editor.
 * Returns the `onContextMenu` handler for the editor and the menu element.
 */
export function useDocumentContextMenu({ editor, readOnly, actions, onError }) {
  const { menu, openAt, close } = usePointerMenu();

  function handleContextMenu(event) {
    // Shift keeps the browser menu (spelling suggestions); phones keep their long-press menu.
    if (!editor || event.shiftKey || event.nativeEvent.pointerType === "touch") return;
    const { from, to } = editor.state.selection;
    const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (hit && (hit.pos < from || hit.pos > to)) editor.commands.setTextSelection(hit.pos);
    openAt(event, snapshot(editor));
  }

  async function run(task, failure) {
    try {
      await task();
    } catch {
      onError?.({ title: failure, description: "Your browser blocked clipboard access. Use the keyboard shortcut instead." });
    }
  }

  const target = menu.target;
  const element = target && (
    <PointerMenu menu={menu} onClose={close}>
      {readOnly ? (
        <ReadOnlyItems editor={editor} hasSelection={target.hasSelection} run={run} />
      ) : (
        <EditableItems actions={actions} editor={editor} run={run} target={target} />
      )}
    </PointerMenu>
  );

  return { handleContextMenu, element };
}

// What the menu needs to know about the spot that was right-clicked.
function snapshot(editor) {
  return {
    hasSelection: !editor.state.selection.empty,
    inTable: editor.isActive("table"),
    href: editor.getAttributes("link").href ?? null,
    marks: Object.fromEntries(MARKS.map((mark) => [mark.id, editor.isActive(mark.id)])),
    secret: editor.isActive("secret"),
    block: activeBlockType(editor).id,
    align: ALIGNMENTS.find((item) => editor.isActive({ textAlign: item.id }))?.id ?? "left",
  };
}

function ReadOnlyItems({ editor, hasSelection, run }) {
  return (
    <>
      <PointerMenuItem
        disabled={!hasSelection}
        icon="mdi:content-copy"
        label="Copy"
        onClick={() => run(() => copySelection(editor), "Couldn't copy")}
        shortcut="Mod C"
      />
      <PointerMenuItem icon="mdi:select-all" label="Select all" onClick={() => editor.commands.selectAll()} shortcut="Mod A" />
      <ShowHiddenTextItem />
    </>
  );
}

function EditableItems({ editor, target, actions, run }) {
  const chain = () => editor.chain().focus();

  return (
    <>
      <PointerMenuItem
        disabled={!target.hasSelection}
        icon="mdi:content-cut"
        label="Cut"
        onClick={() =>
          run(async () => {
            await copySelection(editor);
            chain().deleteSelection().run();
          }, "Couldn't cut")
        }
        shortcut="Mod X"
      />
      <PointerMenuItem
        disabled={!target.hasSelection}
        icon="mdi:content-copy"
        label="Copy"
        onClick={() => run(() => copySelection(editor), "Couldn't copy")}
        shortcut="Mod C"
      />
      <PointerMenuItem
        icon="mdi:content-paste"
        label="Paste"
        onClick={() => run(() => paste(editor), "Couldn't paste")}
        shortcut="Mod V"
      />
      <PointerMenuItem
        icon="mdi:clipboard-text-outline"
        label="Paste as plain text"
        onClick={() => run(() => paste(editor, { plain: true }), "Couldn't paste")}
        shortcut="Mod Shift V"
      />

      <MenuSeparator />

      {target.hasSelection && (
        <SubMenu icon="mdi:format-text" label="Format">
          {MARKS.map((mark) => (
            <PointerMenuItem
              icon={target.marks[mark.id] ? "mdi:check" : mark.icon}
              key={mark.id}
              label={mark.label}
              onClick={() => mark.run(chain()).run()}
              shortcut={mark.shortcut}
            />
          ))}
          <PointerMenuItem
            icon={target.secret ? "mdi:check" : "mdi:dots-horizontal"}
            label="Hidden text"
            onClick={() => chain().toggleSecret().run()}
            shortcut="Mod Shift H"
          />
          <MenuSeparator />
          <PointerMenuItem
            icon="mdi:format-clear"
            label="Clear formatting"
            onClick={() => chain().unsetAllMarks().clearNodes().run()}
          />
        </SubMenu>
      )}
      {target.hasSelection && actions?.startComment && (
        <PointerMenuItem icon="mdi:comment-plus-outline" label="Comment" onClick={() => actions.startComment()} shortcut="Mod Alt M" />
      )}
      <SubMenu icon="mdi:swap-horizontal" label="Turn into">
        {BLOCK_TYPES.map((type) => (
          <PointerMenuItem
            icon={target.block === type.id ? "mdi:check" : type.icon}
            key={type.id}
            label={type.label}
            onClick={() => type.run(chain()).run()}
          />
        ))}
      </SubMenu>
      <SubMenu icon="mdi:format-align-left" label="Align">
        {ALIGNMENTS.map((item) => (
          <PointerMenuItem
            icon={target.align === item.id ? "mdi:check" : item.icon}
            key={item.id}
            label={item.label}
            onClick={() => chain().setTextAlign(item.id).run()}
            shortcut={item.shortcut}
          />
        ))}
      </SubMenu>
      <SubMenu icon="mdi:plus-box-outline" label="Insert">
        {INSERTS.map((command) => (
          <PointerMenuItem
            icon={command.icon}
            key={command.id}
            label={command.label}
            onClick={() => {
              const result = command.run(chain(), actions);
              if (result) result.run();
            }}
          />
        ))}
      </SubMenu>
      {target.inTable && (
        <SubMenu icon="mdi:table" label="Table">
          {TABLE_ACTIONS.map((action, index) =>
            action.divider ? (
              <MenuSeparator key={index} />
            ) : (
              <PointerMenuItem
                destructive={action.danger}
                icon={action.icon}
                key={action.label}
                label={action.label}
                onClick={() => action.run(chain()).run()}
              />
            ),
          )}
        </SubMenu>
      )}

      {target.href && (
        <>
          <MenuSeparator />
          <PointerMenuItem
            icon="mdi:open-in-new"
            label="Open link"
            onClick={() => window.open(target.href, "_blank", "noopener,noreferrer")}
          />
          <PointerMenuItem
            icon="mdi:link-variant-off"
            label="Remove link"
            onClick={() => chain().extendMarkRange("link").unsetLink().run()}
          />
        </>
      )}

      <MenuSeparator />
      <PointerMenuItem icon="mdi:select-all" label="Select all" onClick={() => chain().selectAll().run()} shortcut="Mod A" />
    </>
  );
}
