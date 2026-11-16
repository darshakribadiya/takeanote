"use client";

import { Icon } from "@iconify/react";
import { BlankPaper } from "@/components/editor/document/blank-paper";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { altKey, modKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace";

const TITLE_CLASS = "w-full bg-transparent font-heading text-[2em] leading-tight font-semibold tracking-tight";

/*
 * Home screen ("/" with no note open): a blank document, laid out like the
 * real editor. The first keystroke creates a note and hands the text over:
 * typed in the title it becomes the title, typed in the page it becomes
 * the first line. The new note opens in the same place, so writing simply
 * carries on.
 */
export function BlankPage() {
  const { newNote } = useWorkspace();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Same height as NoteToolbar + the tags row, so the paper doesn't jump when the note opens. */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 md:px-4">
        <SidebarTrigger aria-label="Toggle sidebar" className="shrink-0" />
        <span className="inline-flex items-center gap-1.5 ps-1 text-sm text-muted-foreground">
          <Icon className="size-4" icon="mdi:file-document-edit-outline" />
          New note
        </span>
        <span className="ms-auto flex items-center gap-x-4 text-xs text-muted-foreground max-sm:hidden">
          <Hint keys={[altKey(), "N"]} label="new note" />
          <Hint keys={[modKey(), "K"]} label="search" />
          <Hint keys={["?"]} label="shortcuts" />
        </span>
      </header>
      <div className="flex min-h-10 shrink-0 items-center gap-1.5 border-b px-3 text-xs text-muted-foreground md:px-4">
        <Icon className="size-4" icon="mdi:tag-plus-outline" />
        Add tag
      </div>

      <BlankPaper
        animate
        body={
          <textarea
            aria-label="Start writing"
            className="paper-prose field-sizing-content block min-h-48 w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/56"
            onChange={(event) => event.target.value.trim() && newNote({ content: event.target.value })}
            placeholder="Start writing, or type / for blocks…"
            value=""
          />
        }
        title={
          <textarea
            aria-label="Title"
            autoFocus
            className={cn(TITLE_CLASS, "field-sizing-content resize-none outline-none placeholder:text-muted-foreground/40")}
            onChange={(event) => event.target.value.trim() && newNote({ title: event.target.value.replace(/\n/g, " ") })}
            onKeyDown={(event) => {
              // Enter / ↓ move to the page, like in a real note.
              if (event.key === "Enter" || event.key === "ArrowDown") {
                event.preventDefault();
                event.currentTarget.closest(".paper")?.querySelector("textarea[aria-label='Start writing']")?.focus();
              }
            }}
            placeholder="Untitled"
            rows={1}
            value=""
          />
        }
      />
    </div>
  );
}

function Hint({ keys, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      {label}
    </span>
  );
}
