"use client";

import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { notePreview, noteTitle, relativeTime } from "@/lib/format";
import { useStore } from "@/lib/notes/store";
import { selectNotes } from "@/lib/notes/views";
import { cn } from "@/lib/utils";
import { NoteContextMenu } from "./note-actions";
import { useWorkspace } from "./workspace";

const SORTS = [
  { value: "updated", label: "Last edited" },
  { value: "created", label: "Date created" },
  { value: "title", label: "Title A–Z" },
];

/*
 * Pinned first, then by the chosen order.
 * Example: sort "title" -> pinned notes A–Z, then the rest A–Z
 */
function sortNotes(notes, sort) {
  const compare = {
    updated: (a, b) => b.content_updated_at.localeCompare(a.content_updated_at),
    created: (a, b) => b.created_at.localeCompare(a.created_at),
    title: (a, b) => noteTitle(a).localeCompare(noteTitle(b), undefined, { sensitivity: "base" }),
  }[sort];
  return [...notes].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || compare(a, b));
}

// Every typed word must appear in the title or preview. Example: "plan q3" matches "Q3 launch plan"
function matches(note, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = `${noteTitle(note)} ${notePreview(note)}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/*
 * All notes overview (/notes): every live note as a compact card, with a
 * quick filter and sort. Opened from "All notes" in the sidebar; clicking
 * a note opens it, right-click gives the usual note actions.
 */
export function AllNotesPage() {
  const { selectNote, newNote } = useWorkspace();
  const status = useStore((s) => s.status);
  const notes = useStore((s) => s.notes);
  const noteTags = useStore((s) => s.noteTags);
  const tags = useStore((s) => s.tags);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");

  const all = useMemo(() => selectNotes({ notes, noteTags, view: "all" }), [notes, noteTags]);
  const shown = useMemo(() => sortNotes(all.filter((note) => matches(note, query)), sort), [all, query, sort]);

  const tagsOf = (note) => (noteTags[note.id] ?? []).map((id) => tags[id]).filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 md:px-4">
        <SidebarTrigger aria-label="Toggle sidebar" className="shrink-0" />
        <h1 className="flex min-w-0 items-center gap-2 ps-1 font-heading text-base font-semibold">
          <Icon className="size-5 shrink-0 text-muted-foreground" icon="mdi:note-multiple-outline" />
          <span className="truncate">All notes</span>
          {status === "ready" && <span className="text-sm font-normal text-muted-foreground tabular-nums">{all.length}</span>}
        </h1>
        <div className="ms-auto flex items-center gap-1.5">
          <Button aria-label="New canvas" onClick={() => newNote({ kind: "canvas" })} size="icon-sm" title="New canvas" variant="outline">
            <Icon icon="mdi:vector-square" />
          </Button>
          <Button onClick={() => newNote()} size="sm">
            <Icon icon="mdi:note-plus-outline" />
            New note
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:px-4">
        <div className="relative min-w-40 flex-1 sm:max-w-sm">
          <Icon className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" icon="mdi:magnify" />
          <Input
            aria-label="Filter notes"
            className="ps-6"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
              if (event.key === "Enter" && shown[0]) selectNote(shown[0].id);
            }}
            placeholder="Filter by title or text"
            size="sm"
            type="search"
            value={query}
          />
        </div>
        <Select items={SORTS} onValueChange={setSort} value={sort}>
          <SelectTrigger aria-label="Sort notes" className="w-36" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {SORTS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === "booting" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 p-4 md:p-6">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton className="h-28 rounded-xl" key={index} />
            ))}
          </div>
        ) : !all.length ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon icon="mdi:note-plus-outline" />
              </EmptyMedia>
              <EmptyTitle>No notes yet</EmptyTitle>
              <EmptyDescription>Your notes show up here. Start one to get going.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => newNote()}>New note</Button>
            </EmptyContent>
          </Empty>
        ) : !shown.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No notes match “{query}”.</p>
        ) : (
          <ul className="paper-enter grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 p-4 md:p-6">
            {shown.map((note) => (
              <li key={note.id}>
                <NoteCard note={note} onOpen={() => selectNote(note.id)} tags={tagsOf(note)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KindIcon({ note, className }) {
  return (
    <Icon
      className={cn("shrink-0 text-muted-foreground", className)}
      icon={note.kind === "canvas" ? "mdi:vector-square" : "mdi:file-document-outline"}
    />
  );
}

function Badges({ note }) {
  return (
    <>
      {note.is_pinned && <Icon aria-label="Pinned" className="size-4 shrink-0 text-primary-500" icon="mdi:pin-outline" />}
      {note.is_favorite && <Icon aria-label="Favorite" className="size-4 shrink-0 text-secondary-500" icon="mdi:star-outline" />}
    </>
  );
}

function TagChips({ tags, max = 3 }) {
  if (!tags.length) return null;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {tags.slice(0, max).map((tag) => (
        <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[0.7rem] text-muted-foreground" key={tag.id}>
          #{tag.name}
        </span>
      ))}
      {tags.length > max && <span className="text-[0.7rem] text-muted-foreground">+{tags.length - max}</span>}
    </span>
  );
}

function NoteCard({ note, tags, onOpen }) {
  const preview = notePreview(note);
  return (
    <NoteContextMenu note={note} onRename={onOpen}>
      <button
        className="flex h-28 w-full flex-col gap-1.5 rounded-xl border bg-card p-3 text-left shadow-xs/5 transition-[box-shadow,border-color] hover:border-primary-300 hover:shadow-sm/5 focus-visible:ring-[3px] focus-visible:ring-ring/24 focus-visible:outline-none dark:hover:border-primary-700"
        onClick={onOpen}
        type="button"
      >
        <span className="flex items-center gap-2">
          <KindIcon className="size-4" note={note} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{noteTitle(note)}</span>
          <Badges note={note} />
        </span>
        <span className="line-clamp-2 flex-1 text-xs leading-5 text-muted-foreground">
          {preview || <span className="italic opacity-70">No text yet</span>}
        </span>
        <span className="flex items-center gap-2">
          <TagChips max={2} tags={tags} />
          <time className="ms-auto shrink-0 text-[0.7rem] text-muted-foreground" dateTime={note.content_updated_at}>
            {relativeTime(note.content_updated_at)}
          </time>
        </span>
      </button>
    </NoteContextMenu>
  );
}
