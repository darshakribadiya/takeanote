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
import { countNotes, parseView, viewLabel } from "@/lib/notes/views";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { NoteActionsMenu, NoteContextMenu } from "./note-actions";
import { lookFor, NotesPanel } from "./notes-panel";
import { SidebarResizeHandle } from "./sidebar-resize";
import { useWorkspace } from "./workspace";

const PRIMARY_VIEWS = [
  { view: "all", label: "All notes", icon: "mdi:note-multiple-outline" },
  { view: "favorites", label: "Favorites", icon: "mdi:star-outline" },
  { view: "recent", label: "Recent", icon: "mdi:clock-outline" },
  { view: "shared", label: "Shared with me", icon: "mdi:account-multiple-outline" },
];

const SECONDARY_VIEWS = [
  { view: "archive", label: "Archive", icon: "mdi:archive-outline" },
  { view: "trash", label: "Trash", icon: "mdi:delete-outline" },
];

const EMPTY_TEXT = {
  all: "No notes yet. Press N to start one.",
  favorites: "Star a note to keep it here.",
  recent: "Notes you open show up here.",
  archive: "Archived notes show up here.",
  trash: "Trash is empty.",
  shared: "Notes people share with your email show up here.",
  folder: "This folder is empty.",
  tag: "No notes with this tag.",
};

// Folders and tags show this many rows until expanded.
const PREVIEW_COUNT = 3;
const SECTIONS_KEY = "qn:sidebar-sections";

function readSections() {
  try {
    return { folders: true, tags: true, ...JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}") };
  } catch {
    return { folders: true, tags: true };
  }
}

/*
 * The one sidebar: create and search, views, folders, tags and the notes
 * of the current view, each with its own actions menu. Resizable on
 * desktop; a slide-over sheet on phones.
 *
 * The content column grows with its rows and scrolls as one (h-auto); a
 * fixed height would squeeze the groups and let the notes list spill
 * under Archive / Trash on short screens.
 */
export function AppSidebar({ notes, width, onWidthChange }) {
  const { view, setView, selectedId, selectNote, newNote, openPalette, openAllNotes, toast } = useWorkspace();
  const { isMobile, setOpenMobile } = useSidebar();
  const status = useStore((s) => s.status);
  const allNotes = useStore((s) => s.notes);
  const noteTags = useStore((s) => s.noteTags);
  const folderMap = useStore((s) => s.folders);
  const tagMap = useStore((s) => s.tags);
  const [creating, setCreating] = useState(null); // "folder" | "tag" | null
  const [renamingId, setRenamingId] = useState(null); // folder or note id
  const [sections, setSections] = useState(readSections);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [shared, setShared] = useState(null);
  const { kind } = parseView(view);

  // Keep the open note in view as it changes (keyboard j/k, palette, links).
  useEffect(() => {
    if (selectedId) document.getElementById(`note-item-${selectedId}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, view]);

  // Notes shared with this email: loaded for the count, refreshed when the view opens.
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    listSharedWithMe()
      .then((rows) => !cancelled && setShared(rows))
      .catch(() => !cancelled && setShared((current) => current ?? []));
    return () => {
      cancelled = true;
    };
  }, [status, kind]);

  const folders = useMemo(
    () => Object.values(folderMap).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [folderMap],
  );
  const tags = useMemo(() => Object.values(tagMap).sort((a, b) => a.name.localeCompare(b.name)), [tagMap]);
  const counts = useMemo(() => {
    const result = {};
    const views = [
      ...PRIMARY_VIEWS.map((item) => item.view),
      "trash",
      ...folders.map((folder) => `folder:${folder.id}`),
      ...tags.map((tag) => `tag:${tag.id}`),
    ];
    for (const key of views) result[key] = countNotes(allNotes, key, noteTags);
    result.shared = shared?.length ?? 0;
    return result;
  }, [allNotes, noteTags, folders, tags, shared]);

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
    if (type === "folder") run(async () => go(`folder:${(await createFolder(name)).id}`), "Couldn't create folder");
    else run(async () => go(`tag:${(await createTag(name)).id}`), "Couldn't create tag");
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
            {PRIMARY_VIEWS.map((item) => (
              <ViewItem
                active={view === item.view}
                count={counts[item.view]}
                item={item}
                key={item.view}
                // "All notes" opens the overview page; the other views filter the list below.
                onSelect={item.view === "all" ? showAllNotes : go}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <CollapsibleSection
          addLabel="New folder"
          emptyHint={
            <SidebarMenuButton className="text-muted-foreground" onClick={() => startCreating("folder")} size="sm">
              <Icon icon="mdi:folder-plus-outline" />
              Create a folder
            </SidebarMenuButton>
          }
          extra={creating === "folder" && <NameInput onDone={submitNew} placeholder="Folder name" />}
          items={folders}
          onAdd={() => startCreating("folder")}
          onOpenChange={(value) => toggleSection("folders", value)}
          open={sections.folders}
          title="Folders"
          renderItem={(folder) =>
            renamingId === folder.id ? (
              <NameInput
                defaultValue={folder.name}
                onDone={(name) => {
                  setRenamingId(null);
                  if (name.trim() && name.trim() !== folder.name) run(() => renameFolder(folder, name), "Couldn't rename folder");
                }}
              />
            ) : (
              <>
                <SidebarMenuButton
                  isActive={view === `folder:${folder.id}`}
                  onClick={() => go(`folder:${folder.id}`)}
                  onDoubleClick={() => setRenamingId(folder.id)}
                >
                  <Icon icon="mdi:folder-outline" />
                  <span className="truncate">{folder.name}</span>
                </SidebarMenuButton>
                <ItemMenu
                  count={counts[`folder:${folder.id}`]}
                  items={[
                    { label: "Rename", icon: "mdi:pencil-outline", onClick: () => setRenamingId(folder.id) },
                    {
                      label: "Delete folder",
                      icon: "mdi:delete-outline",
                      destructive: true,
                      onClick: () => {
                        if (view === `folder:${folder.id}`) go("all");
                        run(async () => {
                          await deleteFolder(folder);
                          toast.add({ title: `Deleted “${folder.name}”`, description: "Its notes moved to All notes." });
                        }, "Couldn't delete folder");
                      },
                    },
                  ]}
                />
              </>
            )
          }
        />

        <CollapsibleSection
          addLabel="New tag"
          emptyHint={<p className="px-2 py-1 text-xs text-muted-foreground">Add tags from any note.</p>}
          extra={creating === "tag" && <NameInput onDone={submitNew} placeholder="Tag name" />}
          items={tags}
          onAdd={() => startCreating("tag")}
          onOpenChange={(value) => toggleSection("tags", value)}
          open={sections.tags}
          title="Tags"
          renderItem={(tag) => (
            <>
              <SidebarMenuButton isActive={view === `tag:${tag.id}`} onClick={() => go(`tag:${tag.id}`)}>
                <Icon icon="mdi:tag-outline" />
                <span className="truncate">{tag.name}</span>
              </SidebarMenuButton>
              <ItemMenu
                count={counts[`tag:${tag.id}`]}
                items={[
                  {
                    label: "Delete tag",
                    icon: "mdi:delete-outline",
                    destructive: true,
                    onClick: () => {
                      if (view === `tag:${tag.id}`) go("all");
                      run(() => deleteTag(tag), "Couldn't delete tag");
                    },
                  },
                ]}
              />
            </>
          )}
        />

        <NotesPanel
          actions={
            kind === "trash" &&
            notes.length > 0 && (
              <button
                className="rounded px-1.5 py-0.5 text-xs text-destructive-foreground hover:bg-destructive/8"
                onClick={() => setConfirmEmpty(true)}
                type="button"
              >
                Empty
              </button>
            )
          }
          count={kind === "shared" ? counts.shared : notes.length}
          emptyText={EMPTY_TEXT[kind]}
          kind={kind}
          label={viewLabel(view, { folders: folderMap, tags: tagMap })}
          loading={kind !== "shared" && status === "booting"}
          notes={notes}
          onClear={kind === "all" ? undefined : () => go("all")}
          renderRow={(note) => (
            <NoteRow
              active={note.id === selectedId}
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
              showTime={kind === "trash" ? note.deleted_at : kind === "recent" ? note.last_accessed_at : null}
            />
          )}
          rows={
            kind === "shared" && (
              <SidebarMenu>
                <SharedRows emptyText={EMPTY_TEXT.shared} notes={shared} />
              </SidebarMenu>
            )
          }
        />

        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            {SECONDARY_VIEWS.map((item) => (
              <ViewItem
                active={view === item.view}
                count={item.view === "trash" ? counts.trash : undefined}
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
              {notes.length} {notes.length === 1 ? "note" : "notes"} will be deleted forever. This can’t be undone.
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

/*
 * Folders / Tags: the header collapses the section. Open, it lists the
 * first PREVIEW_COUNT rows and "Show N more" reveals the rest.
 */
function CollapsibleSection({ title, open, onOpenChange, items, renderItem, onAdd, addLabel, extra, emptyHint }) {
  const [showAll, setShowAll] = useState(false);
  const hidden = Math.max(0, items.length - PREVIEW_COUNT);
  const limited = !showAll && hidden > 0;
  const visible = limited ? items.slice(0, PREVIEW_COUNT) : items;

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
        {!open && items.length > 0 && <span className="ms-1 tabular-nums opacity-70">{items.length}</span>}
      </SidebarGroupLabel>
      <SidebarGroupAction aria-label={addLabel} onClick={onAdd} title={addLabel}>
        <Icon icon="mdi:plus" />
      </SidebarGroupAction>
      {open && (
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.map((item) => (
              <SidebarMenuItem key={item.id}>
                {renderItem(item)}
              </SidebarMenuItem>
            ))}
            {extra && <SidebarMenuItem>{extra}</SidebarMenuItem>}
            {!items.length && !extra && <SidebarMenuItem>{emptyHint}</SidebarMenuItem>}
          </SidebarMenu>
          {hidden > 0 && (
            <button
              className="mt-0.5 flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setShowAll((value) => !value)}
              type="button"
            >
              <Icon className="size-3.5" icon={showAll ? "mdi:chevron-up" : "mdi:chevron-down"} />
              {showAll ? "Show less" : `Show ${hidden} more`}
            </button>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

function NoteRow({ note, active, renaming, showTime, onOpen, onRename, onRenameDone }) {
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
  const preview = notePreview(note);
  return (
    <SidebarMenuItem>
      <NoteContextMenu note={note} onRename={onRename}>
        <SidebarMenuButton
          aria-current={active ? "true" : undefined}
          className="h-auto py-1.5 pe-8"
          id={`note-item-${note.id}`}
          isActive={active}
          onClick={onOpen}
          onDoubleClick={() => !note.deleted_at && onRename()}
        >
          <Icon
            className="mt-0.5 self-start text-muted-foreground"
            icon={note.kind === "canvas" ? "mdi:vector-square" : "mdi:file-document-outline"}
          />
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
        </SidebarMenuButton>
      </NoteContextMenu>
      <NoteActionsMenu
        note={note}
        onRename={onRename}
        trigger={
          <MenuTrigger render={<SidebarMenuAction aria-label={`Actions for ${noteTitle(note)}`} className="top-2" showOnHover />}>
            <Icon icon="mdi:dots-horizontal" />
          </MenuTrigger>
        }
      />
    </SidebarMenuItem>
  );
}

function ViewItem({ item, active, count, onSelect }) {
  return (
    <SidebarMenuItem>
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
