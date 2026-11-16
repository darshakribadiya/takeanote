"use client";

import { Icon } from "@iconify/react";
import { SidebarMenu, SidebarMenuItem, SidebarMenuSkeleton } from "@/components/ui/sidebar";
import { groupNotesByDate } from "@/lib/notes/views";
import { cn } from "@/lib/utils";

/*
 * Look of each view, shared by its sidebar link and the list panel, so the
 * list visibly belongs to the view picked above it.
 * `tone` classes: chip (icon badge), frame (panel border + tint), active (nav link).
 */
export const VIEW_LOOKS = {
  all: { icon: "mdi:note-multiple-outline", tone: "neutral" },
  favorites: { icon: "mdi:star-outline", tone: "amber" },
  recent: { icon: "mdi:clock-outline", tone: "sky" },
  shared: { icon: "mdi:account-multiple-outline", tone: "primary" },
  archive: { icon: "mdi:archive-outline", tone: "neutral" },
  trash: { icon: "mdi:delete-outline", tone: "rose" },
  folder: { icon: "mdi:folder-outline", tone: "neutral" },
  tag: { icon: "mdi:tag-outline", tone: "neutral" },
};

export const TONES = {
  neutral: {
    chip: "bg-sidebar-accent text-sidebar-foreground",
    frame: "border-sidebar-border",
    active: "",
  },
  amber: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/16 dark:text-amber-300",
    frame: "border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/6",
    active: "[&>svg]:text-amber-600 dark:[&>svg]:text-amber-300",
  },
  sky: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/16 dark:text-sky-300",
    frame: "border-sky-300/70 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-500/6",
    active: "[&>svg]:text-sky-600 dark:[&>svg]:text-sky-300",
  },
  primary: {
    chip: "bg-primary-100 text-primary-700 dark:bg-primary-500/16 dark:text-primary-300",
    frame: "border-primary-300/70 bg-primary-50/60 dark:border-primary-500/30 dark:bg-primary-500/6",
    active: "[&>svg]:text-primary-600 dark:[&>svg]:text-primary-300",
  },
  rose: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/16 dark:text-rose-300",
    frame: "border-rose-300/70 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/6",
    active: "[&>svg]:text-rose-600 dark:[&>svg]:text-rose-300",
  },
};

export function lookFor(kind) {
  const look = VIEW_LOOKS[kind] ?? VIEW_LOOKS.all;
  return { ...look, ...TONES[look.tone] };
}

/*
 * The list of the current view as one framed panel: a header that stays
 * put while scrolling (icon, name, count, a way back to All notes and
 * view actions), then the notes in date sections.
 *
 * `notes` are already filtered and sorted for the view; `renderRow(note)`
 * draws one row. `rows` replaces the dated list (Shared with me).
 */
export function NotesPanel({ kind, label, count, notes, loading, emptyText, renderRow, rows, actions, onClear }) {
  const look = lookFor(kind);
  const sections = rows ? null : groupNotesByDate(notes ?? [], kind);
  // Sections only help once a list is long enough to scan.
  const showSections = sections && (notes?.length ?? 0) > 4;

  return (
    <section
      aria-label={label}
      className={cn("mx-2 mb-2 rounded-xl border transition-colors", look.frame)}
      data-view={kind}
    >
      <header className="sticky top-0 z-10 flex items-center gap-2 rounded-t-xl bg-sidebar/92 px-2 py-1.5 backdrop-blur">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", look.chip)}>
          <Icon className="size-3.5" icon={look.icon} />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-sidebar-foreground">{label}</h2>
        {count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
        {actions}
        {onClear && (
          <button
            aria-label="Back to all notes"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={onClear}
            title="Back to all notes"
            type="button"
          >
            <Icon className="size-3.5" icon="mdi:close" />
          </button>
        )}
      </header>

      <div className="px-1 pb-1">
        {loading ? (
          <SidebarMenu>
            {Array.from({ length: 5 }, (_, index) => (
              <SidebarMenuItem key={index}>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        ) : rows ? (
          rows
        ) : !notes?.length ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{emptyText}</p>
        ) : showSections ? (
          sections.map((section) => (
            <div key={section.key}>
              <p className="flex items-center gap-1 px-2 pt-2 pb-1 text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
                {section.key === "pinned" && <Icon className="size-3" icon="mdi:pin-outline" />}
                {section.label}
              </p>
              <SidebarMenu>{section.notes.map(renderRow)}</SidebarMenu>
            </div>
          ))
        ) : (
          <SidebarMenu>{notes.map(renderRow)}</SidebarMenu>
        )}
      </div>
    </section>
  );
}
