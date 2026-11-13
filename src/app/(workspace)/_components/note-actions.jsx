"use client";

import { Icon } from "@iconify/react";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubPopup,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "@/components/ui/menu";
import { exportStoredNote } from "@/components/editor/stored-export";
import {
  archiveNote,
  duplicateNote,
  moveToFolder,
  purgeNote,
  restoreNote,
  toggleFavorite,
  togglePinned,
  trashNote,
  unarchiveNote,
} from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { useWorkspace } from "./workspace";

const NO_FOLDER = "none";

const MENU_PARTS = {
  Item: MenuItem,
  Separator: MenuSeparator,
  Sub: MenuSub,
  SubTrigger: MenuSubTrigger,
  SubPopup: MenuSubPopup,
  RadioGroup: MenuRadioGroup,
  RadioItem: MenuRadioItem,
};

const CONTEXT_PARTS = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubPopup: ContextMenuSubPopup,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
};

/*
 * What can be done to a note straight from the sidebar: rename, pin,
 * favourite, duplicate, export, move, archive, delete. Shared by the
 * row's "…" menu and its right-click menu.
 */
function useNoteActions(note, { onRename }) {
  const { selectedId, selectNote, toast } = useWorkspace();

  async function run(action, failure, success) {
    try {
      const result = await action();
      if (success) toast.add({ title: success, type: "success", timeout: 2000 });
      return result;
    } catch (error) {
      toast.add({ title: failure, description: error.message, type: "error" });
    }
  }

  function leaveIfOpen() {
    if (selectedId === note.id) selectNote(null);
  }

  return {
    rename: onRename,
    pin: () => run(() => togglePinned(note), "Couldn't update pin"),
    favorite: () => run(() => toggleFavorite(note), "Couldn't update favorite"),
    duplicate: () =>
      run(
        async () => {
          const id = await duplicateNote(note);
          selectNote(id);
        },
        "Couldn't duplicate",
        "Duplicated",
      ),
    exportAs: (format) => run(() => exportStoredNote(note, format), "Couldn't export"),
    move: (folderId) => run(() => moveToFolder(note, folderId), "Couldn't move note"),
    archive: () =>
      note.archived_at
        ? run(() => unarchiveNote(note), "Couldn't unarchive", "Unarchived")
        : run(
            async () => {
              await archiveNote(note);
              leaveIfOpen();
            },
            "Couldn't archive",
            "Archived",
          ),
    trash: () =>
      run(async () => {
        await trashNote(note);
        leaveIfOpen();
        if (note._local) return;
        const id = toast.add({
          title: "Moved to Trash",
          type: "success",
          actionProps: {
            children: "Undo",
            onClick: () => {
              toast.close(id);
              restoreNote(note);
            },
          },
        });
      }, "Couldn't delete note"),
    restore: () => run(() => restoreNote(note), "Couldn't restore", "Restored"),
    purge: () =>
      run(async () => {
        await purgeNote(note);
        leaveIfOpen();
      }, "Couldn't delete"),
  };
}

function ActionItems({ note, actions, parts }) {
  const { Item, Separator, Sub, SubTrigger, SubPopup, RadioGroup, RadioItem } = parts;
  const folders = useStore((s) => s.folders);

  if (note.deleted_at) {
    return (
      <>
        <Item onClick={actions.restore}>
          <Icon icon="mdi:restore" />
          Restore
        </Item>
        <Item onClick={actions.purge} variant="destructive">
          <Icon icon="mdi:delete-forever-outline" />
          Delete forever
        </Item>
      </>
    );
  }

  return (
    <>
      <Item onClick={actions.rename}>
        <Icon icon="mdi:pencil-outline" />
        Rename
      </Item>
      <Item onClick={actions.pin}>
        <Icon icon={note.is_pinned ? "mdi:pin-off-outline" : "mdi:pin-outline"} />
        {note.is_pinned ? "Unpin" : "Pin to top"}
      </Item>
      <Item onClick={actions.favorite}>
        <Icon icon={note.is_favorite ? "mdi:star-off-outline" : "mdi:star-outline"} />
        {note.is_favorite ? "Remove from favorites" : "Add to favorites"}
      </Item>
      <Item disabled={note._local} onClick={actions.duplicate}>
        <Icon icon="mdi:content-copy" />
        Duplicate
      </Item>
      <Sub>
        <SubTrigger disabled={note._local}>
          <Icon icon="mdi:export-variant" />
          Export
        </SubTrigger>
        <SubPopup>
          <Item onClick={() => actions.exportAs("md")}>
            <Icon icon="mdi:language-markdown-outline" />
            Markdown (.md)
          </Item>
          <Item onClick={() => actions.exportAs("html")}>
            <Icon icon="mdi:language-html5" />
            Web page (.html)
          </Item>
          <Item onClick={() => actions.exportAs("print")}>
            <Icon icon="mdi:printer-outline" />
            Print or save as PDF
          </Item>
        </SubPopup>
      </Sub>
      <Sub>
        <SubTrigger>
          <Icon icon="mdi:folder-move-outline" />
          Move to folder
        </SubTrigger>
        <SubPopup>
          <RadioGroup onValueChange={(value) => actions.move(value === NO_FOLDER ? null : value)} value={note.folder_id ?? NO_FOLDER}>
            <RadioItem value={NO_FOLDER}>No folder</RadioItem>
            {Object.values(folders).map((folder) => (
              <RadioItem key={folder.id} value={folder.id}>
                {folder.name}
              </RadioItem>
            ))}
          </RadioGroup>
        </SubPopup>
      </Sub>
      <Separator />
      <Item onClick={actions.archive}>
        <Icon icon={note.archived_at ? "mdi:archive-arrow-up-outline" : "mdi:archive-outline"} />
        {note.archived_at ? "Unarchive" : "Archive"}
      </Item>
      <Item onClick={actions.trash} variant="destructive">
        <Icon icon="mdi:delete-outline" />
        Move to Trash
      </Item>
    </>
  );
}

// "…" button menu. `trigger` is the element that opens it.
export function NoteActionsMenu({ note, onRename, trigger }) {
  const actions = useNoteActions(note, { onRename });
  return (
    <Menu>
      {trigger}
      <MenuPopup align="start" className="w-56" side="right">
        <ActionItems actions={actions} note={note} parts={MENU_PARTS} />
      </MenuPopup>
    </Menu>
  );
}

// Right-click (or long-press) menu around a row.
export function NoteContextMenu({ note, onRename, children }) {
  const actions = useNoteActions(note, { onRename });
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuPopup className="w-56">
        <ActionItems actions={actions} note={note} parts={CONTEXT_PARTS} />
      </ContextMenuPopup>
    </ContextMenu>
  );
}
