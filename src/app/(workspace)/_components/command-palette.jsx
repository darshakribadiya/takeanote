"use client";

import { useMemo } from "react";
import { Icon } from "@iconify/react";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { altKey, modKey, noteTitle, notePreview } from "@/lib/format";
import { useStore } from "@/lib/notes/store";
import { setTheme } from "@/lib/theme";
import { useWorkspace } from "./workspace";

/*
 * One box for everything: jump to any note by title, or run an action.
 * Items are { value, label, ... } so Base UI filters on the label text.
 */
export function CommandPalette({ open, onOpenChange }) {
  const { newNote, selectNote, setView, setReadMode, openShortcuts } = useWorkspace();
  const notes = useStore((s) => s.notes);
  const folders = useStore((s) => s.folders);
  const tags = useStore((s) => s.tags);

  const groups = useMemo(() => {
    const live = Object.values(notes)
      .filter((note) => !note.deleted_at)
      .sort((a, b) => b.last_accessed_at.localeCompare(a.last_accessed_at));

    const actions = [
      { value: "new", label: "New note", icon: "mdi:note-plus-outline", shortcut: `${altKey()} N`, run: () => newNote() },
      {
        value: "new-canvas",
        label: "New canvas",
        icon: "mdi:vector-square",
        shortcut: `${altKey()} ⇧ N`,
        run: () => newNote({ kind: "canvas" }),
      },
      { value: "read", label: "Toggle read-only mode", icon: "mdi:eye-outline", shortcut: `${modKey()} E`, run: () => setReadMode((v) => !v) },
      {
        value: "theme",
        label: "Toggle dark mode",
        icon: "mdi:theme-light-dark",
        run: () => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark"),
      },
      { value: "shortcuts", label: "Keyboard shortcuts", icon: "mdi:keyboard-outline", shortcut: "?", run: openShortcuts },
    ];

    const places = [
      { value: "view:all", label: "Go to All notes", icon: "mdi:note-multiple-outline", run: () => setView("all") },
      { value: "view:favorites", label: "Go to Favorites", icon: "mdi:star-outline", run: () => setView("favorites") },
      { value: "view:recent", label: "Go to Recent", icon: "mdi:clock-outline", run: () => setView("recent") },
      { value: "view:archive", label: "Go to Archive", icon: "mdi:archive-outline", run: () => setView("archive") },
      { value: "view:trash", label: "Go to Trash", icon: "mdi:delete-outline", run: () => setView("trash") },
      ...Object.values(folders).map((folder) => ({
        value: `folder:${folder.id}`,
        label: `Folder: ${folder.name}`,
        icon: "mdi:folder-outline",
        run: () => setView(`folder:${folder.id}`),
      })),
      ...Object.values(tags).map((tag) => ({
        value: `tag:${tag.id}`,
        label: `Tag: #${tag.name}`,
        icon: "mdi:tag-outline",
        run: () => setView(`tag:${tag.id}`),
      })),
    ];

    const noteItems = live.map((note) => ({
      value: `note:${note.id}`,
      label: noteTitle(note),
      hint: notePreview(note),
      icon: note.archived_at ? "mdi:archive-outline" : note.kind === "canvas" ? "mdi:vector-square" : "mdi:note-text-outline",
      run: () => selectNote(note.id),
    }));

    return [
      { value: "Notes", items: noteItems },
      { value: "Actions", items: actions },
      { value: "Go to", items: places },
    ].filter((group) => group.items.length);
  }, [notes, folders, tags, newNote, selectNote, setView, setReadMode, openShortcuts]);

  function handleSelect(item) {
    onOpenChange(false);
    item.run();
  }

  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandDialogPopup>
        <Command itemToStringValue={(item) => item.label} items={groups}>
          <CommandInput placeholder="Search notes or type a command…" />
          <CommandPanel>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandList>
              {(group, index) => (
                <CommandGroup items={group.items} key={group.value}>
                  {index > 0 && <CommandSeparator />}
                  <CommandGroupLabel>{group.value}</CommandGroupLabel>
                  <CommandCollection>
                    {(item) => (
                      <CommandItem key={item.value} onClick={() => handleSelect(item)} value={item}>
                        <Icon className="text-muted-foreground" icon={item.icon} />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                          {item.hint && <span className="ms-2 text-muted-foreground">{item.hint}</span>}
                        </span>
                        {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
