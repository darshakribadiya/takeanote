"use client";

import { use, useEffect, useState } from "react";
import { browser } from "react-dom";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { NoteBody } from "@/components/editor/note-body";
import { AuthForm } from "@/components/auth-form";
import { AutosaveMenuItem, SaveControls } from "@/components/save-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { Toggle } from "@/components/ui/toggle";
import { toastManager } from "@/components/ui/toast";
import { APP_NAME } from "@/constants";
import { useAutosave } from "@/hooks/use-autosave";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useNoteSync } from "@/hooks/use-note-sync";
import { ensureSession, joinShare } from "@/lib/notes/api";
import { plainText, TITLE } from "@/lib/sync/doc-model";

// Re-check the link now and then so a revoked or expired link closes the page.
const RECHECK_MS = 60000;

export function SharedNote({ params }) {
  use(browser("Shared notes load with the visitor's browser session."));
  const { token } = use(params);
  const [state, setState] = useState({ status: "loading", share: null, user: null });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        // Visitors need an email account so RLS and Realtime can admit them.
        const user = await ensureSession();
        if (cancelled) return;
        if (!user || user.is_anonymous) {
          setState({ status: user ? "upgrade" : "signin", share: null, user });
          return;
        }
        const share = await joinShare(token);
        if (cancelled) return;
        setState((current) => {
          if (share) return { status: "ready", share: current.share ?? share, user };
          return { status: current.status === "ready" ? "revoked" : "missing", share: null, user };
        });
      } catch {
        // Offline or transient: keep what is on screen and try again later.
        if (!cancelled) setState((current) => (current.status === "loading" ? { ...current, status: "missing" } : current));
      }
    }

    check();
    const interval = setInterval(() => document.visibilityState === "visible" && check(), RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-16">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (state.status === "signin" || state.status === "upgrade") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <AuthForm mode={state.status === "signin" ? "share" : "upgrade"} onSignedIn={() => location.reload()} />
      </div>
    );
  }

  if (state.status !== "ready") {
    return (
      <Empty className="min-h-dvh">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon="mdi:link-variant-off" />
          </EmptyMedia>
          <EmptyTitle>{state.status === "revoked" ? "This link was turned off" : "Link not available"}</EmptyTitle>
          <EmptyDescription>It may have expired or been revoked by its owner.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/" />}>Write your own note</Button>
        </EmptyContent>
      </Empty>
    );
  }

  return <SharedEditor key={state.share.note_id} share={state.share} user={state.user} />;
}

function SharedEditor({ share, user }) {
  const canEdit = share.permission === "edit";
  const kind = share.kind ?? "document";
  const [readMode, setReadMode] = useState(!canEdit);
  const session = useNoteSync({
    noteId: share.note_id,
    kind,
    canEdit,
    isOwner: false,
    user,
  });
  const { doc, sync, state } = session;
  const [autosave, setAutosave] = useAutosave(session);

  useHotkeys([
    { combo: "mod+s", allowInInputs: true, handler: () => canEdit && save() },
    { combo: "mod+e", allowInInputs: true, handler: () => canEdit && setReadMode((value) => !value) },
  ]);

  async function save() {
    await sync.save();
    toastManager.add({ id: "manual-save", title: "Saved", type: "success", timeout: 1200 });
  }

  async function copyText() {
    const title = doc.getText(TITLE).toString();
    const body = plainText(doc, kind);
    await navigator.clipboard.writeText(title ? `${title}\n\n${body}` : body);
    toastManager.add({ title: "Copied to clipboard", type: "success", timeout: 2000 });
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
        <Link className="inline-flex items-center gap-2 font-heading font-semibold" href="/">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Icon className="size-4" icon="mdi:lightning-bolt-outline" />
          </span>
          <span className="max-sm:hidden">{APP_NAME}</span>
        </Link>
        <Badge variant={canEdit ? "info" : "secondary"}>
          <Icon icon={canEdit ? "mdi:pencil-outline" : "mdi:eye-outline"} />
          {canEdit ? "Can edit" : "View only"}
        </Badge>
        {canEdit && (
          <SaveControls autosave={autosave} onSave={save} status={state.status} />
        )}
        {state.peers > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground max-sm:hidden">
            <Icon className="size-4" icon="mdi:account-multiple-outline" />
            {state.peers + 1} here
          </span>
        )}
        <div className="ms-auto flex items-center gap-1">
          {canEdit && (
            <Toggle aria-label="Read-only mode" onPressedChange={setReadMode} pressed={readMode} size="sm">
              <Icon icon={readMode ? "mdi:eye-outline" : "mdi:pencil-outline"} />
            </Toggle>
          )}
          <Button onClick={copyText} size="sm" variant="ghost">
            <Icon icon="mdi:content-copy" />
            <span className="max-sm:hidden">Copy</span>
          </Button>
          <Button render={<Link href="/" />} size="sm" variant="outline">
            New note
          </Button>
          {canEdit && (
            <Menu>
              <MenuTrigger render={<Button aria-label="More actions" size="icon-sm" variant="ghost" />}>
                <Icon icon="mdi:dots-horizontal" />
              </MenuTrigger>
              <MenuPopup align="end">
                <AutosaveMenuItem autosave={autosave} onChange={setAutosave} />
              </MenuPopup>
            </Menu>
          )}
        </div>
      </header>

      {state.localReady && state.status !== "loading" ? (
        <NoteBody
          kind={kind}
          noteId={share.note_id}
          onError={({ title, description }) => toastManager.add({ title, description, type: "error" })}
          readOnly={readMode || !canEdit}
          session={session}
          user={session.awareness.getLocalState()?.user}
        />
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-16">
          <Skeleton className="h-9 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}
    </div>
  );
}
