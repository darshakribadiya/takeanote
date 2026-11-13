"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import * as Y from "yjs";
import { NoteBody } from "@/components/editor/note-body";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutosave } from "@/hooks/use-autosave";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useNoteSync } from "@/hooks/use-note-sync";
import { usePaper } from "@/hooks/use-paper";
import { downloadFile, fileSlug, printDocument, toHtmlDocument, toMarkdown } from "@/lib/editor/export";
import { makeExcerpt } from "@/lib/format";
import {
  duplicateNote,
  ensurePersisted,
  purgeNote,
  restoreNote,
  toggleFavorite,
  trashNote,
  unarchiveNote,
} from "@/lib/notes/api";
import { getState, upsertNote, useStore } from "@/lib/notes/store";
import { displayTitle, isEmptyDoc, plainText, TITLE } from "@/lib/sync/doc-model";
import { NoteToolbar } from "./note-toolbar";
import { TagPicker } from "./tag-picker";
import { useWorkspace } from "./workspace";

export function NoteEditor({ note }) {
  const { focusTarget, readMode, selectNote, toast, takeInitialText } = useWorkspace();
  const user = useStore((s) => s.user);
  const [shareOpen, setShareOpen] = useState(false);
  const [editor, setEditor] = useState(null);
  const [initialText] = useState(() => takeInitialText(note.id));
  const trashed = Boolean(note.deleted_at);
  const readOnly = readMode || trashed;
  const kind = note.kind ?? "document";

  const session = useNoteSync({
    noteId: note.id,
    kind,
    canEdit: !trashed,
    isOwner: true,
    user,
    ensurePersisted: () => ensurePersisted(note.id),
    // A brand-new note stays off the server until it has real content.
    shouldPersist: (doc) => !getState().notes[note.id]?._local || !isEmptyDoc(doc),
    onLocalText: ({ title, text }) => upsertNote({ id: note.id, _liveTitle: title, _liveExcerpt: makeExcerpt(text) }),
  });
  const { doc, sync, state } = session;
  const [paper] = usePaper(doc);
  const [autosave, setAutosave] = useAutosave(session);
  const awarenessUser = session.awareness.getLocalState()?.user;

  const title = () => doc.getText(TITLE).toString();

  function showError({ title: heading, description }) {
    toast.add({ title: heading, description, type: "error" });
  }

  async function moveToTrash() {
    try {
      await sync.flush();
      await trashNote(note);
      selectNote(null);
      if (!note._local) {
        const id = toast.add({
          title: "Moved to Trash",
          type: "success",
          actionProps: {
            children: "Undo",
            onClick: () => {
              toast.close(id);
              restoreNote(note).then(() => selectNote(note.id));
            },
          },
        });
      }
    } catch (error) {
      showError({ title: "Couldn't delete note", description: error.message });
    }
  }

  const actions = {
    save: () => sync.save(),
    async copyText() {
      const body = editor && kind === "document" ? editor.getText({ blockSeparator: "\n\n" }) : plainText(doc, kind);
      await navigator.clipboard.writeText(title() ? `${title()}\n\n${body}` : body);
    },
    downloadMarkdown() {
      const content = kind === "document" && editor ? toMarkdown(editor, title()) : `# ${title()}\n\n${plainText(doc, kind)}`;
      downloadFile(`${fileSlug(displayTitle(doc, kind))}.md`, content, "text/markdown");
    },
    downloadHtml() {
      if (editor) downloadFile(`${fileSlug(displayTitle(doc, kind))}.html`, toHtmlDocument(editor, title(), paper), "text/html");
    },
    print() {
      if (editor) printDocument(editor, title(), paper);
    },
    async duplicate() {
      await sync.save();
      return duplicateNote(note, { state: Y.encodeStateAsUpdate(doc) });
    },
  };

  useHotkeys([
    {
      combo: "mod+s",
      allowInInputs: true,
      handler: async () => {
        if (trashed) return;
        await sync.save();
        toast.add({ id: "manual-save", title: "Saved", type: "success", timeout: 1200 });
      },
    },
    { combo: "mod+p", allowInInputs: true, handler: () => (kind === "document" ? actions.print() : window.print()) },
    { combo: "alt+f", allowInInputs: true, handler: () => !trashed && toggleFavorite(note) },
    { combo: "alt+s", allowInInputs: true, handler: () => !trashed && setShareOpen(true) },
    { combo: "mod+shift+backspace", allowInInputs: true, handler: () => !trashed && moveToTrash() },
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NoteToolbar
        actions={actions}
        autosave={autosave}
        kind={kind}
        note={note}
        onAutosaveChange={setAutosave}
        onShareOpenChange={setShareOpen}
        onTrash={moveToTrash}
        peers={state.peers}
        shareOpen={shareOpen}
        status={state.status}
      />

      {(trashed || note.archived_at || !trashed) && (
        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1 md:px-4">
          {trashed ? (
            <StatusLine icon="mdi:delete-outline" text="In Trash">
              <Button onClick={() => restoreNote(note)} size="xs" variant="outline">
                Restore
              </Button>
              <Button onClick={() => purgeNote(note).then(() => selectNote(null))} size="xs" variant="destructive-outline">
                Delete forever
              </Button>
            </StatusLine>
          ) : (
            <>
              {note.archived_at && (
                <StatusLine icon="mdi:archive-outline" text="Archived">
                  <Button onClick={() => unarchiveNote(note)} size="xs" variant="outline">
                    Unarchive
                  </Button>
                </StatusLine>
              )}
              <TagPicker note={note} />
            </>
          )}
        </div>
      )}

      {state.localReady ? (
        <NoteBody
          autoFocus={readOnly ? null : (focusTarget ?? (initialText ? "content" : null))}
          ensurePersisted={() => ensurePersisted(note.id)}
          initialText={initialText}
          kind={kind}
          noteId={note.id}
          onEditor={setEditor}
          onError={showError}
          readOnly={readOnly}
          session={session}
          user={awarenessUser}
        />
      ) : (
        <BodySkeleton />
      )}
    </div>
  );
}

function StatusLine({ icon, text, children }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="size-4.5" icon={icon} />
      <span>{text}</span>
      {children}
    </div>
  );
}

function BodySkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6 md:p-10">
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
