"use client";

import { useState } from "react";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { noteTitle, notePreview, relativeTime } from "@/lib/format";
import { emptyTrash } from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { parseView, viewLabel } from "@/lib/notes/views";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace";

const EMPTY_STATES = {
  all: { icon: "mdi:lightning-bolt-outline", title: "Capture your first thought", text: "Press N or just start typing." },
  favorites: { icon: "mdi:star-outline", title: "No favorites yet", text: "Star a note to keep it one click away." },
  recent: { icon: "mdi:clock-outline", title: "Nothing opened yet", text: "Notes you open show up here." },
  archive: { icon: "mdi:archive-outline", title: "Archive is empty", text: "Archive notes to hide them without deleting." },
  trash: { icon: "mdi:delete-outline", title: "Trash is empty", text: "Deleted notes stay here until you empty it." },
  folder: { icon: "mdi:folder-outline", title: "This folder is empty", text: "New notes created here land in it." },
  tag: { icon: "mdi:tag-outline", title: "No notes with this tag", text: "Add tags from the note toolbar." },
};

const WIDTH_KEY = "qn:list-width";
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 560;
// The editor always keeps at least this much room.
const MIN_EDITOR_WIDTH = 420;

function clampWidth(width) {
  const roomForList = typeof window === "undefined" ? MAX_WIDTH : window.innerWidth - MIN_EDITOR_WIDTH;
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, roomForList))));
}

function readWidth() {
  try {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return stored ? clampWidth(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function saveWidth(width) {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch {}
}

export function NoteList({ notes, className }) {
  const { view, query, setQuery, selectedId, selectNote, newNote, toast } = useWorkspace();
  const status = useStore((s) => s.status);
  const folders = useStore((s) => s.folders);
  const tags = useStore((s) => s.tags);
  const noteTags = useStore((s) => s.noteTags);
  const { kind } = parseView(view);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [width, setWidth] = useState(readWidth);

  async function handleEmptyTrash() {
    setConfirmEmpty(false);
    try {
      await emptyTrash();
      toast.add({ title: "Trash emptied", type: "success" });
    } catch (error) {
      toast.add({ title: "Couldn't empty trash", description: error.message, type: "error" });
    }
  }

  return (
    <section
      aria-label="Notes"
      className={cn("relative flex h-full w-full shrink-0 flex-col border-r md:w-(--list-width)", className)}
      id="note-list"
      style={{ "--list-width": `${width}px` }}
    >
      <ResizeHandle
        onChange={(next) => setWidth(clampWidth(next))}
        onCommit={(next) => saveWidth(clampWidth(next))}
        onReset={() => {
          setWidth(DEFAULT_WIDTH);
          saveWidth(DEFAULT_WIDTH);
        }}
        width={width}
      />
      <header className="flex flex-col gap-3 border-b p-3">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="shrink-0" />
          <h2 className="min-w-0 flex-1 truncate font-heading font-semibold">{viewLabel(view, { folders, tags })}</h2>
          {kind === "trash" && notes.length > 0 && (
            <Button onClick={() => setConfirmEmpty(true)} size="xs" variant="ghost">
              Empty
            </Button>
          )}
          <Button aria-label="New note" onClick={() => newNote()} size="icon-sm" title="New note" variant="ghost">
            <Icon icon="mdi:note-plus-outline" />
          </Button>
          <Button
            aria-label="New canvas"
            onClick={() => newNote({ kind: "canvas" })}
            size="icon-sm"
            title="New canvas"
            variant="ghost"
          >
            <Icon icon="mdi:vector-square" />
          </Button>
        </div>
        <div className="relative">
          <Icon className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" icon="mdi:magnify" />
          <Input
            aria-label="Search notes"
            className="*:data-[slot=input]:ps-9"
            id="note-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
              if (event.key === "Enter" && notes[0]) selectNote(notes[0].id);
            }}
            placeholder="Search notes"
            size="sm"
            type="search"
            value={query}
          />
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {status === "booting" ? (
          <ListSkeleton />
        ) : notes.length ? (
          <ul className="flex flex-col gap-0.5 p-2">
            {notes.map((note) => (
              <li key={note.id}>
                <NoteListItem
                  active={note.id === selectedId}
                  note={note}
                  onSelect={() => selectNote(note.id)}
                  showTime={kind === "trash" ? note.deleted_at : kind === "recent" ? note.last_accessed_at : null}
                  tagNames={(noteTags[note.id] ?? []).map((id) => tags[id]?.name).filter(Boolean)}
                />
              </li>
            ))}
          </ul>
        ) : query ? (
          <ListEmpty icon="mdi:magnify" text="Try fewer or different words." title={`No results for “${query}”`} />
        ) : (
          <ListEmpty {...EMPTY_STATES[kind]} />
        )}
      </ScrollArea>

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
    </section>
  );
}

function NoteListItem({ note, active, onSelect, showTime, tagNames }) {
  const preview = notePreview(note);
  return (
    <button
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-accent",
      )}
      id={`note-item-${note.id}`}
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-center gap-1.5">
        {note.is_pinned && <Icon className="size-3.5 shrink-0 text-primary-500" icon="mdi:pin-outline" />}
        {note.kind === "canvas" && (
          <Icon aria-label="Canvas" className="size-3.5 shrink-0 text-muted-foreground" icon="mdi:vector-square" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{noteTitle(note)}</span>
        {note.is_favorite && <Icon className="size-3.5 shrink-0 text-secondary-500" icon="mdi:star-outline" />}
      </span>
      <span className="line-clamp-2 text-sm text-muted-foreground">{preview || "No additional text"}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground/80">
        <time dateTime={showTime ?? note.content_updated_at}>{relativeTime(showTime ?? note.content_updated_at)}</time>
        {tagNames.slice(0, 3).map((name) => (
          <span className="truncate" key={name}>
            #{name}
          </span>
        ))}
      </span>
    </button>
  );
}

/*
 * Drag the list's right edge to resize it (desktop). Keyboard: focus the
 * edge and use ← / → (Shift for bigger steps); double-click resets.
 */
function ResizeHandle({ width, onChange, onCommit, onReset }) {
  function handlePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (moveEvent) => {
      latest = startWidth + moveEvent.clientX - startX;
      onChange(latest);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onCommit(latest);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  function handleKeyDown(event) {
    const step = event.shiftKey ? 64 : 16;
    let next = null;
    if (event.key === "ArrowLeft") next = width - step;
    else if (event.key === "ArrowRight") next = width + step;
    else if (event.key === "Home") next = MIN_WIDTH;
    else if (event.key === "End") next = MAX_WIDTH;
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    onCommit(next);
  }

  return (
    <div
      aria-controls="note-list"
      aria-label="Resize note list"
      aria-orientation="vertical"
      aria-valuemax={MAX_WIDTH}
      aria-valuemin={MIN_WIDTH}
      aria-valuenow={width}
      className="group absolute inset-y-0 -right-1.5 z-20 hidden w-3 cursor-col-resize touch-none outline-none md:block"
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      role="separator"
      tabIndex={0}
      title="Drag to resize · double-click to reset"
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary group-active:bg-primary/64" />
    </div>
  );
}

function ListEmpty({ icon, title, text }) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon icon={icon} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="flex flex-col gap-2" key={index}>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
