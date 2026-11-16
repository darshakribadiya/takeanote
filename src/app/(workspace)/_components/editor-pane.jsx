"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchNote } from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { cn } from "@/lib/utils";
import { AllNotesPage } from "./all-notes-page";
import { BlankPage } from "./blank-page";
import { NoteEditor } from "./note-editor";
import { useWorkspace } from "./workspace";

export function EditorPane({ className }) {
  const { selectedId, page } = useWorkspace();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const note = useStore((s) => (selectedId ? s.notes[selectedId] : null));

  let body;
  if (status === "booting") body = <EditorSkeleton />;
  else if (status === "error") body = <BootError message={error} />;
  // Remount when trashed / restored: editing rights are fixed per sync session.
  else if (selectedId && note) body = <NoteEditor key={`${note.id}:${Boolean(note.deleted_at)}`} note={note} />;
  else if (selectedId) body = <MissingNote id={selectedId} key={selectedId} />;
  else if (page === "notes") body = <AllNotesPage />;
  else body = <BlankPage />;

  // An open note and the blank page bring their own toolbar (with the sidebar toggle); other states need one.
  const hasToolbar = status !== "booting" && status !== "error" && (!selectedId || Boolean(note));
  return (
    <section className={cn("relative flex h-full min-w-0 flex-1 flex-col", className)}>
      {!hasToolbar && <SidebarTrigger aria-label="Toggle sidebar" className="absolute top-3 left-3 z-10" />}
      {body}
    </section>
  );
}

// Deep link to a note that is not in the loaded list (e.g. just created elsewhere).
function MissingNote({ id }) {
  const { selectNote } = useWorkspace();
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    fetchNote(id)
      .then((row) => !cancelled && setState(row ? "found" : "missing"))
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === "loading") return <EditorSkeleton />;
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon icon="mdi:file-question-outline" />
        </EmptyMedia>
        <EmptyTitle>Note not found</EmptyTitle>
        <EmptyDescription>It may have been deleted, or it belongs to another account.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => selectNote(null)} variant="outline">
          Back to notes
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function BootError({ message }) {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon icon="mdi:cloud-alert-outline" />
        </EmptyMedia>
        <EmptyTitle>Couldn’t load your notes</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => location.reload()}>Try again</Button>
      </EmptyContent>
    </Empty>
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6 md:p-10">
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
