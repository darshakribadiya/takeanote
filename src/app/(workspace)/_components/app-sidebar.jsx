"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";
import { altKey, modKey, notePreview, noteTitle, relativeTime } from "@/lib/format";
import {
  createFolder,
  createTag,
  deleteFolder,
  deleteTag,
  emptyTrash,
  listSharedWithMe,
  renameFolder,
  renameNote,
} from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { countNotes, parseView, selectNotes, viewLabel } from "@/lib/notes/views";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { NoteActionsMenu, NoteContextMenu } from "./note-actions";
import { lookFor, NotesPanel } from "./notes-panel";
import { SidebarResizeHandle } from "./sidebar-resize";
import { useWorkspace } from "./workspace";

// Expand in place: their notes list right under the row.
const QUICK_VIEWS = [
  { view: "favorites", label: "Favorites", icon: "mdi:star-outline", empty: "Star a note to keep it here." },
  { view: "recent", label: "Recent", icon: "mdi:clock-outline", empty: "Notes you open show up here." },
  { view: "shared", label: "Shared with me", icon: "mdi:account-multiple-outline", empty: "Notes people share with your email show up here." },
];

// Switch the list at the bottom of the sidebar.
const SECONDARY_VIEWS = [
  { view: "archive", label: "Archive", icon: "mdi:archive-outline" },
  { view: "trash", label: "Trash", icon: "mdi:delete-outline" },
];

const EMPTY_TEXT = {
  unfiled: "Notes outside folders show up here. Press N to start one.",
  archive: "Archived notes show up here.",
  trash: "Trash is empty.",
};

// Rows shown in an expanded section before "Show all".
const NESTED_LIMIT = 8;
const SECTIONS_KEY = "qn:sidebar-sections";
const EXPANDED_KEY = "qn:sidebar-expanded";

function readSections() {
  try {
    return { folders: true, tags: true, ...JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}") };
  } catch {
    return { folders: true, tags: true };
  }
}

// Rows the person expanded ("favorites", "folder:<id>", …). Everything starts collapsed.
function readExpanded() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

/*
 * The one sidebar, laid out like a file tree:
 *
 *   All notes               opens the All notes page
 *   ▸ Favorites / Recent / Shared with me   expand their notes in place
 *   Folders  ▸ each folder (count) expands its notes
 *   Tags     ▸ each tag (count) expands its notes
 *   Notes    notes in no folder (or Archive / Trash when picked below)
 *   Archive, Trash
 *
 * Expanded rows are independent and remembered. Going to a view from
 * elsewhere (command palette, a tag chip) expands that row too.
 * Resizable on desktop; a slide-over sheet on phones.
 */
export function AppSidebar({ notes, width, onWidthChange }) {
  const { view, setView, selectedId, selectNote, newNote, openPalette, openAllNotes, page, toast } = useWorkspace();
  const { isMobile, setOpenMobile } = useSidebar();
  const status = useStore((s) => s.status);
  const allNotes = useStore((s) => s.notes);
  const noteTags = useStore((s) => s.noteTags);
  const folderMap = useStore((s) => s.folders);
  const tagMap = useStore((s) => s.tags);
  const [creating, setCreating] = useState(null); // "folder" | "tag" | null
  const [renamingId, setRenamingId] = useState(null); // folder or note id
  const [sections, setSections] = useState(readSections);
  const [expanded, setExpanded] = useState(readExpanded);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [shared, setShared] = useState(null);
  const { kind } = parseView(view);
  // Archive and Trash take over the bottom list; otherwise it shows notes in no folder.
  const panelKind = kind === "archive" || kind === "trash" ? kind : "unfiled";

  // Keep the open note in view as it changes (keyboard j/k, palette, links).
  useEffect(() => {
    if (selectedId) document.getElementById(`note-item-${selectedId}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, view]);

  // A view picked elsewhere (palette, tag chip) expands its row; bring that row into view.
  useEffect(() => {
    document.getElementById(`sidebar-row-${view}`)?.scrollIntoView({ block: "nearest" });
  }, [view]);

  // Notes shared with this email: loaded for the count, refreshed when that row opens.
  const sharedOpen = expanded.has("shared") || view === "shared";
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    listSharedWithMe()
      .then((rows) => !cancelled && setShared(rows))
      .catch(() => !cancelled && setShared((current) => current ?? []));
    return () => {
      cancelled = true;
    };
  }, [status, sharedOpen]);

  const folders = useMemo(
    () => Object.values(folderMap).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [folderMap],
  );
  const tags = useMemo(() => Object.values(tagMap).sort((a, b) => a.name.localeCompare(b.name)), [tagMap]);

  // Every list the tree can show, sorted like their views.
  const lists = useMemo(() => {
    const pick = (key) => selectNotes({ notes: allNotes, noteTags, view: key });
    const result = { favorites: pick("favorites"), recent: pick("recent"), unfiled: pick("unfiled") };
    for (const folder of folders) result[`folder:${folder.id}`] = pick(`folder:${folder.id}`);
    for (const tag of tags) result[`tag:${tag.id}`] = pick(`tag:${tag.id}`);
    return result;
  }, [allNotes, noteTags, folders, tags]);
  const trashCount = useMemo(() => countNotes(allNotes, "trash", noteTags), [allNotes, noteTags]);
  const panelNotes = panelKind === "unfiled" ? lists.unfiled : notes;

  // A row is open when the person expanded it, or when it is the current view.
  function isOpen(key) {
    return expanded.has(key) || view === key;
  }

  function setOpen(key, open) {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
    // Closing the current view's row lets it go back to the default.
    if (!open && view === key) setView("all");
  }

  // Folders also become the current view while open, so new notes land in them.
  function toggleFolder(folderId) {
    const key = `folder:${folderId}`;
    const open = !isOpen(key);
    setOpen(key, open);
    if (open) setView(key);
  }

  function go(nextView) {
    setView(nextView);
  }

  function showAllNotes() {
    openAllNotes();
    if (isMobile) setOpenMobile(false);
  }

  function open(noteId) {
    selectNote(noteId);
    if (isMobile) setOpenMobile(false);
  }

  function toggleSection(key, value) {
    setSections((current) => {
      const next = { ...current, [key]: value };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  async function run(action, failure) {
    try {
      await action();
    } catch (error) {
      toast.add({ title: failure, description: error.message, type: "error" });
    }
  }

  function submitNew(name) {
    const type = creating;
    setCreating(null);
    if (!name.trim()) return;
    if (type === "folder") {
      run(async () => {
        const folder = await createFolder(name);
        setOpen(`folder:${folder.id}`, true);
        go(`folder:${folder.id}`);
      }, "Couldn't create folder");
    } else {
      run(async () => setOpen(`tag:${(await createTag(name)).id}`, true), "Couldn't create tag");
    }
  }

  function startCreating(type) {
    toggleSection(type === "folder" ? "folders" : "tags", true);
    setCreating(type);
  }

  async function handleEmptyTrash() {
    setConfirmEmpty(false);
    await run(async () => {
      await emptyTrash();
      toast.add({ title: "Trash emptied", type: "success" });
    }, "Couldn't empty trash");
  }

  /*
   * One note row. `anchor` marks the note's home row (its folder, or the
   * bottom list), the one scrolled to when the note opens; the same note
   * can also show under Favorites, Recent or a tag.
   */
  function renderNote(note, { compact = false, anchor = false, showTime = null } = {}) {
    return (
      <NoteRow
        active={note.id === selectedId}
        anchor={anchor}
        compact={compact}
        key={note.id}
        note={note}
        onOpen={() => open(note.id)}
        onRename={() => setRenamingId(note.id)}
        onRenameDone={(title) => {
          setRenamingId(null);
          if (title !== null && title.trim() !== noteTitle(note)) {
            run(() => renameNote(note, title), "Couldn't rename note");
          }
        }}
        renaming={renamingId === note.id}
        showTime={showTime}
      />
    );
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarResizeHandle onChange={onWidthChange} width={width} />
      <SidebarHeader className="gap-3">
        <Logo className="px-1 pt-1" />
        <div className="flex gap-1.5">
          <Button className="min-w-0 flex-1 justify-between" onClick={() => newNote()}>
            <span className="inline-flex items-center gap-2">
              <Icon icon="mdi:note-plus-outline" />
              New note
            </span>
            <KbdGroup className="max-sm:hidden">
              <Kbd className="bg-white/16 text-current">{altKey()}</Kbd>
              <Kbd className="bg-white/16 text-current">N</Kbd>
            </KbdGroup>
          </Button>
          <Button
            aria-label="New canvas"
            onClick={() => newNote({ kind: "canvas" })}
            size="icon"
            title={`New canvas (${altKey()} Shift N)`}
            variant="outline"
          >
            <Icon icon="mdi:vector-square" />
          </Button>
        </div>
        <Button className="w-full justify-between text-muted-foreground" onClick={openPalette} variant="outline">
          <span className="inline-flex items-center gap-2">
            <Icon icon="mdi:magnify" />
            Search
          </span>
          <KbdGroup className="max-sm:hidden">
            <Kbd>{modKey()}</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </SidebarHeader>

      <SidebarContent className="h-auto min-h-full">
        <SidebarGroup>
          <SidebarMenu>
            <ViewItem
              active={page === "notes"}
              item={{ view: "all", label: "All notes", icon: "mdi:note-multiple-outline" }}
              onSelect={showAllNotes}
            />
            {QUICK_VIEWS.map((item) => (
              <TreeRow
                className={cn(view === item.view && lookFor(item.view).active)}
                count={item.view === "recent" ? 0 : item.view === "shared" ? (shared?.length ?? 0) : lists[item.view].length}
                icon={item.icon}
                id={`sidebar-row-${item.view}`}
                key={item.view}
                label={item.label}
                onOpenChange={(value) => setOpen(item.view, value)}
                open={isOpen(item.view)}
              >
                {item.view === "shared" ? (
                  <SidebarMenu>
                    <SharedRows emptyText={item.empty} notes={shared} />
                  </SidebarMenu>
                ) : (
                  <NestedNotes
                    emptyText={item.empty}
                    notes={lists[item.view]}
                    renderRow={(note) =>
                      renderNote(note, { compact: true, showTime: item.view === "recent" ? note.last_accessed_at : null })
                    }
                  />
                )}
              </TreeRow>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <TreeSection
          addLabel="New folder"
          emptyHint={
            <SidebarMenuItem>
              <SidebarMenuButton className="text-muted-foreground" onClick={() => startCreating("folder")} size="sm">
                <Icon icon="mdi:folder-plus-outline" />
                Create a folder
              </SidebarMenuButton>
            </SidebarMenuItem>
          }
          extra={creating === "folder" && <NameInput onDone={submitNew} placeholder="Folder name" />}
          hasItems={folders.length > 0}
          onAdd={() => startCreating("folder")}
          onOpenChange={(value) => toggleSection("folders", value)}
          open={sections.folders}
          title="Folders"
        >
          {folders.map((folder) => {
            const key = `folder:${folder.id}`;
            if (renamingId === folder.id) {
              return (
                <SidebarMenuItem key={folder.id}>
                  <NameInput
                    defaultValue={folder.name}
                    onDone={(name) => {
                      setRenamingId(null);
                      if (name.trim() && name.trim() !== folder.name) run(() => renameFolder(folder, name), "Couldn't rename folder");
                    }}
                  />
                </SidebarMenuItem>
              );
            }
            return (
              <TreeRow
                active={view === key}
                count={lists[key]?.length ?? 0}
                icon={isOpen(key) ? "mdi:folder-open-outline" : "mdi:folder-outline"}
                id={`sidebar-row-${key}`}
                key={folder.id}
                label={folder.name}
                menu={[
                  { label: "New note here", icon: "mdi:note-plus-outline", onClick: () => newNote({ folderId: folder.id }) },
                  { label: "Rename", icon: "mdi:pencil-outline", onClick: () => setRenamingId(folder.id) },
                  {
                    label: "Delete folder",
                    icon: "mdi:delete-outline",
                    destructive: true,
                    onClick: () => {
                      if (view === key) go("all");
                      setOpen(key, false);
                      run(async () => {
                        await deleteFolder(folder);
                        toast.add({ title: `Deleted “${folder.name}”`, description: "Its notes moved out of the folder." });
                      }, "Couldn't delete folder");
                    },
                  },
                ]}
                onOpenChange={() => toggleFolder(folder.id)}
                open={isOpen(key)}
              >
                <NestedNotes
                  emptyText="This folder is empty."
                  notes={lists[key] ?? []}
                  renderRow={(note) => renderNote(note, { compact: true, anchor: true })}
                />
              </TreeRow>
            );
          })}
        </TreeSection>

        <TreeSection
          addLabel="New tag"
          emptyHint={<p className="px-2 py-1 text-xs text-muted-foreground">Add tags from any note.</p>}
          extra={creating === "tag" && <NameInput onDone={submitNew} placeholder="Tag name" />}
          hasItems={tags.length > 0}
          onAdd={() => startCreating("tag")}
          onOpenChange={(value) => toggleSection("tags", value)}
          open={sections.tags}
          title="Tags"
        >
          {tags.map((tag) => {
            const key = `tag:${tag.id}`;
            return (
              <TreeRow
                active={view === key}
                count={lists[key]?.length ?? 0}
                icon="mdi:tag-outline"
                id={`sidebar-row-${key}`}
                key={tag.id}
                label={tag.name}
                menu={[
                  {
                    label: "Delete tag",
                    icon: "mdi:delete-outline",
                    destructive: true,
                    onClick: () => {
                      if (view === key) go("all");
                      setOpen(key, false);
                      run(() => deleteTag(tag), "Couldn't delete tag");
                    },
                  },
                ]}
                onOpenChange={(value) => setOpen(key, value)}
                open={isOpen(key)}
              >
                <NestedNotes
                  emptyText="No notes with this tag."
                  notes={lists[key] ?? []}
                  renderRow={(note) => renderNote(note, { compact: true })}
                />
              </TreeRow>
            );
          })}
        </TreeSection>

        <NotesPanel
          actions={
            panelKind === "trash" &&
            panelNotes.length > 0 && (
              <button
                className="rounded px-1.5 py-0.5 text-xs text-destructive-foreground hover:bg-destructive/8"
                onClick={() => setConfirmEmpty(true)}
                type="button"
              >
                Empty
              </button>
            )
          }
          count={panelNotes.length}
          emptyText={EMPTY_TEXT[panelKind]}
          kind={panelKind}
          label={viewLabel(panelKind, { folders: folderMap, tags: tagMap })}
          loading={status === "booting"}
          notes={panelNotes}
          onClear={panelKind === "unfiled" ? undefined : () => go("all")}
          renderRow={(note) =>
            renderNote(note, { anchor: true, showTime: panelKind === "trash" ? note.deleted_at : null })
          }
        />

        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            {SECONDARY_VIEWS.map((item) => (
              <ViewItem
                active={view === item.view}
                count={item.view === "trash" ? trashCount : undefined}
                item={item}
                key={item.view}
                onSelect={go}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>

      <AlertDialog onOpenChange={setConfirmEmpty} open={confirmEmpty}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {panelNotes.length} {panelNotes.length === 1 ? "note" : "notes"} will be deleted forever. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button onClick={handleEmptyTrash} variant="destructive">
              Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </Sidebar>
  );
}

// Folders / Tags: the header collapses the whole section; "+" adds one.
function TreeSection({ title, open, onOpenChange, hasItems, onAdd, addLabel, extra, emptyHint, children }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel
        render={
          <button
            aria-expanded={open}
            className="w-full cursor-pointer gap-1 hover:text-sidebar-foreground"
            onClick={() => onOpenChange(!open)}
            type="button"
          />
        }
      >
        <Icon className={cn("size-3.5 transition-transform", !open && "-rotate-90")} icon="mdi:chevron-down" />
        {title}
      </SidebarGroupLabel>
      <SidebarGroupAction aria-label={addLabel} onClick={onAdd} title={addLabel}>
        <Icon icon="mdi:plus" />
      </SidebarGroupAction>
      {open && (
        <SidebarGroupContent>
          <SidebarMenu>
            {children}
            {extra && <SidebarMenuItem>{extra}</SidebarMenuItem>}
            {!hasItems && !extra && emptyHint}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

/*
 * An expandable tree row: chevron, icon, label and count (the count
 * swaps to a "⋯" menu on hover when there is one). Open, its children
 * show indented under it.
 */
function TreeRow({ id, icon, label, count, open, onOpenChange, active, menu, className, children }) {
  return (
    <SidebarMenuItem id={id}>
      <SidebarMenuButton
        aria-expanded={open}
        className={className}
        isActive={active}
        onClick={() => onOpenChange(!open)}
      >
        <Icon className={cn("size-3.5! shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} icon="mdi:chevron-right" />
        <Icon icon={icon} />
        <span className="truncate">{label}</span>
      </SidebarMenuButton>
      {menu ? <ItemMenu count={count} items={menu} /> : count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
      {open && <div className="ms-3.5 border-s border-sidebar-border py-0.5 ps-1">{children}</div>}
    </SidebarMenuItem>
  );
}

// Notes inside an open row: the first NESTED_LIMIT, then "Show all N".
function NestedNotes({ notes, emptyText, renderRow }) {
  const [showAll, setShowAll] = useState(false);
  if (!notes.length) return <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</p>;
  const shown = showAll ? notes : notes.slice(0, NESTED_LIMIT);
  return (
    <>
      <SidebarMenu>{shown.map(renderRow)}</SidebarMenu>
      {notes.length > NESTED_LIMIT && (
        <button
          className="mt-0.5 flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setShowAll((value) => !value)}
          type="button"
        >
          <Icon className="size-3.5" icon={showAll ? "mdi:chevron-up" : "mdi:chevron-down"} />
          {showAll ? "Show less" : `Show all ${notes.length}`}
        </button>
      )}
    </>
  );
}

function NoteRow({ note, active, renaming, showTime, compact, anchor, onOpen, onRename, onRenameDone }) {
  if (renaming) {
    return (
      <SidebarMenuItem>
        <NameInput
          defaultValue={note.title ?? ""}
          onDone={(value) => onRenameDone(value)}
          onCancel={() => onRenameDone(null)}
          placeholder={noteTitle(note)}
        />
      </SidebarMenuItem>
    );
  }

  const time = showTime ?? note.content_updated_at;
  // The first lines after the title, so similar titles are easy to tell apart.
  const preview = compact ? "" : notePreview(note);
  return (
    <SidebarMenuItem>
      <NoteContextMenu note={note} onRename={onRename}>
        <SidebarMenuButton
          aria-current={active ? "true" : undefined}
          className={compact ? "pe-8" : "h-auto py-1.5 pe-8"}
          id={anchor ? `note-item-${note.id}` : undefined}
          isActive={active}
          onClick={onOpen}
          onDoubleClick={() => !note.deleted_at && onRename()}
          title={compact ? `${noteTitle(note)} · ${relativeTime(time)}` : undefined}
        >
          <Icon
            className={cn("text-muted-foreground", !compact && "mt-0.5 self-start")}
            icon={note.kind === "canvas" ? "mdi:vector-square" : "mdi:file-document-outline"}
          />
          {compact ? (
            <span className="flex min-w-0 flex-1 items-center gap-1">
              <span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
              {note.is_pinned && <Icon className="size-3.5! shrink-0 text-primary-500" icon="mdi:pin-outline" />}
              {showTime && <span className="shrink-0 text-[0.7rem] text-muted-foreground/80">{relativeTime(time)}</span>}
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate font-medium">{noteTitle(note)}</span>
                {note.is_pinned && <Icon className="size-3.5! shrink-0 text-primary-500" icon="mdi:pin-outline" />}
                {note.is_favorite && <Icon className="size-3.5! shrink-0 text-secondary-500" icon="mdi:star-outline" />}
              </span>
              {preview && <span className="truncate text-xs text-muted-foreground">{preview}</span>}
              <time className="text-[0.7rem] text-muted-foreground/80" dateTime={time}>
                {relativeTime(time)}
              </time>
            </span>
          )}
        </SidebarMenuButton>
      </NoteContextMenu>
      <NoteActionsMenu
        note={note}
        onRename={onRename}
        trigger={
          <MenuTrigger
            render={<SidebarMenuAction aria-label={`Actions for ${noteTitle(note)}`} className={compact ? undefined : "top-2"} showOnHover />}
          >
            <Icon icon="mdi:dots-horizontal" />
          </MenuTrigger>
        }
      />
    </SidebarMenuItem>
  );
}

function ViewItem({ item, active, count, onSelect }) {
  return (
    <SidebarMenuItem id={`sidebar-row-${item.view}`}>
      <SidebarMenuButton className={cn(active && lookFor(item.view).active)} isActive={active} onClick={() => onSelect(item.view)}>
        <Icon icon={item.icon} />
        <span>{item.label}</span>
      </SidebarMenuButton>
      {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

// Count badge that swaps to a "…" menu on hover, keeping rows uncluttered.
function ItemMenu({ count, items }) {
  return (
    <>
      {count > 0 && (
        <SidebarMenuBadge className="group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0">
          {count}
        </SidebarMenuBadge>
      )}
      <Menu>
        <MenuTrigger render={<SidebarMenuAction aria-label="More" showOnHover />}>
          <Icon icon="mdi:dots-horizontal" />
        </MenuTrigger>
        <MenuPopup align="start" side="right">
          {items.map((item) => (
            <MenuItem key={item.label} onClick={item.onClick} variant={item.destructive ? "destructive" : "default"}>
              <Icon icon={item.icon} />
              {item.label}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </>
  );
}

// Enter saves, Escape cancels, clicking away saves.
function NameInput({ defaultValue = "", placeholder, onDone, onCancel }) {
  const [value, setValue] = useState(defaultValue);
  const doneRef = useRef(false);

  // Enter/Escape are followed by a blur; only the first one counts.
  function finish(result, cancelled = false) {
    if (doneRef.current) return;
    doneRef.current = true;
    if (cancelled && onCancel) onCancel();
    else onDone(result);
  }

  return (
    <SidebarInput
      aria-label={placeholder ?? "Name"}
      autoFocus
      maxLength={500}
      onBlur={() => finish(value)}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(value);
        if (event.key === "Escape") {
          event.stopPropagation();
          finish("", true);
        }
      }}
      placeholder={placeholder}
      value={value}
    />
  );
}

/*
 * "Shared with me": other people's notes, opened on their shared page
 * (/s/n/<id>) where access is checked against the invite.
 */
function SharedRows({ notes, emptyText }) {
  if (notes === null) {
    return Array.from({ length: 3 }, (_, index) => (
      <SidebarMenuItem key={index}>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
    ));
  }
  if (!notes.length) return <p className="px-2 py-2 text-xs text-muted-foreground">{emptyText}</p>;
  return notes.map((note) => (
    <SidebarMenuItem key={note.note_id}>
      <SidebarMenuButton className="h-auto py-1.5" render={<Link href={`/s/n/${note.note_id}`} />}>
        <Icon
          className="mt-0.5 self-start text-muted-foreground"
          icon={note.kind === "canvas" ? "mdi:vector-square" : "mdi:file-document-outline"}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{note.title || "Untitled"}</span>
          <span className="truncate text-xs text-muted-foreground">
            {note.owner_name} · {note.permission === "edit" ? "Can edit" : "Can view"}
          </span>
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  ));
}
