"use client";

import { useEffect, useMemo, useState } from "react";
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
import { searchNoteIds } from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { setTheme } from "@/lib/theme";
import { useWorkspace } from "./workspace";

/*
 * One box for everything: find a note, or run an action. Notes match on
 * title and preview at once; full-text hits on note bodies join in once
 * the debounced server search answers.
 */
export function CommandPalette({ open, onOpenChange }) {
  const [search, setSearch] = useState("");
  const [bodyMatches, setBodyMatches] = useState({ query: "", ids: new Set() });
  const { newNote, selectNote, setView, setReadMode, openShortcuts, openAllNotes } = useWorkspace();
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
      { value: "view:all", label: "Go to All notes", icon: "mdi:note-multiple-outline", run: openAllNotes },
      { value: "view:favorites", label: "Go to Favorites", icon: "mdi:star-outline", run: () => setView("favorites") },
      { value: "view:recent", label: "Go to Recent", icon: "mdi:clock-outline", run: () => setView("recent") },
      { value: "view:shared", label: "Go to Shared with me", icon: "mdi:account-multiple-outline", run: () => setView("shared") },
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
      noteId: note.id,
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
  }, [notes, folders, tags, newNote, selectNote, setView, setReadMode, openShortcuts, openAllNotes]);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(async () => {
      const ids = await searchNoteIds(trimmed);
      setBodyMatches({ query: trimmed, ids: new Set(ids) });
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const matchedIds = bodyMatches.query === search.trim() ? bodyMatches.ids : null;

  // Every typed word must appear in the label or preview; body hits always pass.
  function filter(item, query) {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    if (item.noteId && matchedIds?.has(item.noteId)) return true;
    const haystack = `${item.label} ${item.hint ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  }

  function changeOpen(next) {
    if (!next) setSearch("");
    onOpenChange(next);
  }

  function handleSelect(item) {
    changeOpen(false);
    item.run();
  }

  return (
    <CommandDialog onOpenChange={changeOpen} open={open}>
      <CommandDialogPopup>
        <Command filter={filter} itemToStringValue={(item) => item.label} items={groups} onValueChange={setSearch}>
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
