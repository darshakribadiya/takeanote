"use client";

import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { createTag, setNoteTag } from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace";

/*
 * Chips for the note's tags plus a type-to-filter picker. Enter on an
 * unknown name creates the tag and attaches it in one step.
 */
export function TagPicker({ note, className }) {
  const { setView, toast } = useWorkspace();
  const tagMap = useStore((s) => s.tags);
  const attachedIds = useStore((s) => s.noteTags[note.id]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const attached = useMemo(() => new Set(attachedIds ?? []), [attachedIds]);
  const tags = useMemo(() => Object.values(tagMap).sort((a, b) => a.name.localeCompare(b.name)), [tagMap]);
  const normalized = filter.trim().replace(/^#/, "").toLowerCase();
  const matches = tags.filter((tag) => tag.name.toLowerCase().includes(normalized));
  const exact = tags.find((tag) => tag.name.toLowerCase() === normalized);

  async function toggle(tag) {
    try {
      await setNoteTag(note.id, tag.id, !attached.has(tag.id));
    } catch (error) {
      toast.add({ title: "Couldn't update tags", description: error.message, type: "error" });
    }
  }

  async function createAndAttach() {
    if (!normalized) return;
    setFilter("");
    try {
      const tag = exact ?? (await createTag(normalized));
      if (!attached.has(tag.id)) await setNoteTag(note.id, tag.id, true);
    } catch (error) {
      toast.add({ title: "Couldn't add tag", description: error.message, type: "error" });
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {[...attached].map((id) =>
        tagMap[id] ? (
          <span
            className="inline-flex h-6 items-center gap-1 rounded-md bg-muted ps-2 pe-1 text-xs text-muted-foreground"
            key={id}
          >
            <button className="hover:text-foreground" onClick={() => setView(`tag:${id}`)} type="button">
              #{tagMap[id].name}
            </button>
            <button
              aria-label={`Remove tag ${tagMap[id].name}`}
              className="rounded hover:bg-background hover:text-foreground"
              onClick={() => toggle(tagMap[id])}
              type="button"
            >
              <Icon className="size-3.5" icon="mdi:close" />
            </button>
          </span>
        ) : null,
      )}

      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger render={<Button className="text-muted-foreground" size="xs" variant="ghost" />}>
          <Icon icon="mdi:tag-plus-outline" />
          {attached.size ? "" : "Add tag"}
        </PopoverTrigger>
        <PopoverPopup align="start" className="w-64">
          <div className="flex flex-col gap-2">
            <Input
              aria-label="Find or create tag"
              autoFocus
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createAndAttach();
                }
              }}
              placeholder="Find or create a tag"
              size="sm"
              value={filter}
            />
            <ul className="flex max-h-60 flex-col overflow-y-auto">
              {matches.map((tag) => (
                <li key={tag.id}>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => toggle(tag)}
                    type="button"
                  >
                    <Icon
                      className={cn("size-4", !attached.has(tag.id) && "opacity-0")}
                      icon="mdi:check"
                    />
                    <span className="truncate">#{tag.name}</span>
                  </button>
                </li>
              ))}
              {normalized && !exact && (
                <li>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={createAndAttach}
                    type="button"
                  >
                    <Icon className="size-4" icon="mdi:plus" />
                    Create “{normalized}”
                  </button>
                </li>
              )}
              {!normalized && !tags.length && (
                <li className="px-2 py-1.5 text-sm text-muted-foreground">Type a name to create your first tag.</li>
              )}
            </ul>
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}
