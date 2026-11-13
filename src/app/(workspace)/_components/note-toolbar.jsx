"use client";

import { Icon } from "@iconify/react";
import { AutosaveMenuItem, SaveControls } from "@/components/save-controls";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { altKey, modKey } from "@/lib/format";
import {
  archiveNote,
  moveToFolder,
  purgeNote,
  restoreNote,
  toggleFavorite,
  togglePinned,
  unarchiveNote,
} from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { SharePopover } from "./share-popover";
import { useWorkspace } from "./workspace";

const NO_FOLDER = "none";

export function NoteToolbar({ note, kind, status, peers, autosave, onAutosaveChange, actions, shareOpen, onShareOpenChange, onTrash }) {
  const { readMode, setReadMode, selectNote, toast } = useWorkspace();
  const folders = useStore((s) => s.folders);
  const trashed = Boolean(note.deleted_at);
  const folder = note.folder_id ? folders[note.folder_id] : null;

  async function run(action, failure, success) {
    try {
      const result = await action();
      if (success) toast.add({ title: success, type: "success", timeout: 2000 });
      return result;
    } catch (error) {
      toast.add({ title: failure, description: error.message, type: "error" });
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b px-2 md:px-4">
      <Button aria-label="Back to list" className="md:hidden" onClick={() => selectNote(null)} size="icon" variant="ghost">
        <Icon icon="mdi:arrow-left" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-3 ps-1">
        {folder && (
          <span className="inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground max-sm:hidden">
            <Icon className="size-4 shrink-0" icon="mdi:folder-outline" />
            <span className="truncate">{folder.name}</span>
          </span>
        )}
        <SaveControls
          autosave={autosave}
          canEdit={!trashed}
          onSave={() => run(actions.save, "Couldn't save", "Saved")}
          status={status}
        />
        {peers > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="People editing now">
            <Icon className="size-4" icon="mdi:account-multiple-outline" />
            {peers + 1} here
          </span>
        )}
      </div>

      {!trashed && (
        <>
          <ToolbarTooltip label={readMode ? "Edit" : "Read only"} shortcut={`${modKey()} E`}>
            <Toggle aria-label="Read-only mode" onPressedChange={setReadMode} pressed={readMode} size="sm">
              <Icon icon={readMode ? "mdi:eye-outline" : "mdi:pencil-outline"} />
            </Toggle>
          </ToolbarTooltip>

          <ToolbarTooltip label={note.is_favorite ? "Unfavorite" : "Favorite"} shortcut={`${altKey()} F`}>
            <Toggle
              aria-label="Favorite"
              onPressedChange={() => run(() => toggleFavorite(note), "Couldn't update favorite")}
              pressed={note.is_favorite}
              size="sm"
            >
              <Icon className={note.is_favorite ? "text-secondary-500" : undefined} icon="mdi:star-outline" />
            </Toggle>
          </ToolbarTooltip>

          <SharePopover note={note} onOpenChange={onShareOpenChange} open={shareOpen} />
        </>
      )}

      <Menu>
        <MenuTrigger render={<Button aria-label="More actions" size="icon-sm" variant="ghost" />}>
          <Icon icon="mdi:dots-horizontal" />
        </MenuTrigger>
        <MenuPopup align="end">
          {trashed ? (
            <>
              <MenuItem onClick={() => run(() => restoreNote(note), "Couldn't restore", "Note restored")}>
                <Icon icon="mdi:restore" />
                Restore
              </MenuItem>
              <MenuItem
                onClick={() => run(() => purgeNote(note).then(() => selectNote(null)), "Couldn't delete")}
                variant="destructive"
              >
                <Icon icon="mdi:delete-forever-outline" />
                Delete forever
              </MenuItem>
            </>
          ) : (
            <>
              <AutosaveMenuItem
                autosave={autosave}
                onChange={(value) => run(() => onAutosaveChange(value), "Couldn't change autosave")}
              />
              <MenuSeparator />
              <MenuItem onClick={() => run(() => togglePinned(note), "Couldn't update pin")}>
                <Icon icon={note.is_pinned ? "mdi:pin-off-outline" : "mdi:pin-outline"} />
                {note.is_pinned ? "Unpin" : "Pin to top"}
              </MenuItem>
              <MenuSub>
                <MenuSubTrigger>
                  <Icon icon="mdi:folder-move-outline" />
                  Move to folder
                </MenuSubTrigger>
                <MenuSubPopup>
                  <MenuRadioGroup
                    onValueChange={(value) =>
                      run(() => moveToFolder(note, value === NO_FOLDER ? null : value), "Couldn't move note")
                    }
                    value={note.folder_id ?? NO_FOLDER}
                  >
                    <MenuRadioItem value={NO_FOLDER}>No folder</MenuRadioItem>
                    {Object.values(folders).map((item) => (
                      <MenuRadioItem key={item.id} value={item.id}>
                        {item.name}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuSubPopup>
              </MenuSub>
              <MenuItem
                onClick={() =>
                  run(async () => selectNote(await actions.duplicate()), "Couldn't duplicate", "Duplicated")
                }
              >
                <Icon icon="mdi:content-copy" />
                Duplicate
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => run(actions.copyText, "Couldn't copy", "Copied to clipboard")}>
                <Icon icon="mdi:clipboard-text-outline" />
                Copy text
              </MenuItem>
              <MenuSub>
                <MenuSubTrigger>
                  <Icon icon="mdi:export-variant" />
                  Export
                </MenuSubTrigger>
                <MenuSubPopup>
                  <MenuItem onClick={actions.downloadMarkdown}>
                    <Icon icon="mdi:language-markdown-outline" />
                    Markdown (.md)
                  </MenuItem>
                  {kind === "document" && (
                    <>
                      <MenuItem onClick={actions.downloadHtml}>
                        <Icon icon="mdi:language-html5" />
                        Web page (.html)
                      </MenuItem>
                      <MenuItem onClick={actions.print}>
                        <Icon icon="mdi:printer-outline" />
                        Print or save as PDF
                        <MenuShortcut>{modKey()} P</MenuShortcut>
                      </MenuItem>
                    </>
                  )}
                </MenuSubPopup>
              </MenuSub>
              <MenuSeparator />
              {note.archived_at ? (
                <MenuItem onClick={() => run(() => unarchiveNote(note), "Couldn't unarchive", "Unarchived")}>
                  <Icon icon="mdi:archive-arrow-up-outline" />
                  Unarchive
                </MenuItem>
              ) : (
                <MenuItem
                  onClick={() =>
                    run(() => archiveNote(note).then(() => selectNote(null)), "Couldn't archive", "Archived")
                  }
                >
                  <Icon icon="mdi:archive-outline" />
                  Archive
                </MenuItem>
              )}
              <MenuItem onClick={onTrash} variant="destructive">
                <Icon icon="mdi:delete-outline" />
                Move to Trash
                <MenuShortcut>{modKey()}⇧⌫</MenuShortcut>
              </MenuItem>
            </>
          )}
        </MenuPopup>
      </Menu>
    </header>
  );
}

function ToolbarTooltip({ label, shortcut, children }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipPopup>
        {label}
        {shortcut && <span className="ms-2 text-muted-foreground">{shortcut}</span>}
      </TooltipPopup>
    </Tooltip>
  );
}
