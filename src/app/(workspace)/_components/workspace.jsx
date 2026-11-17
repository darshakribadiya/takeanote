"use client";

import { createContext, use, useEffect, useMemo, useRef, useState } from "react";
import { browser } from "react-dom";
import { useParams } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { toastManager } from "@/components/ui/toast";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { createClient } from "@/lib/supabase/client";
import {
  createLocalNote,
  discardIfEmpty,
  ensureSession,
  loadWorkspace,
  recoverPendingNotes,
  subscribeWorkspace,
  touchNote,
} from "@/lib/notes/api";
import { getState, setState, useStore } from "@/lib/notes/store";
import { DEFAULT_VIEW, parseView, selectNotes } from "@/lib/notes/views";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { EditorPane } from "./editor-pane";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { readSidebarWidth } from "./sidebar-resize";

export const WorkspaceContext = createContext(null);

export function useWorkspace() {
  return use(WorkspaceContext);
}

const VIEW_KEY = "qn:view";

function readStoredView() {
  try {
    return localStorage.getItem(VIEW_KEY) ?? DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

function noteIdFromPath(pathname) {
  return pathname.match(/^\/n\/([^/]+)/)?.[1] ?? null;
}

// Full-page views of the workspace (no note open). Example: "/notes" -> "notes"
const PAGES = { "/notes": "notes" };

function pageFromPath(pathname) {
  return PAGES[pathname] ?? null;
}

export function Workspace() {
  // Session, drafts and shortcuts are browser-only; prerender the skeleton instead.
  use(browser("The notes workspace depends on the browser session and local drafts."));

  const params = useParams();
  const [selectedId, setSelectedId] = useState(() => params?.id ?? null);
  // "notes" = the All notes overview at /notes; null = blank page or the open note.
  const [page, setPage] = useState(() => pageFromPath(location.pathname));
  const [view, setViewState] = useState(readStoredView);
  const [focusTarget, setFocusTarget] = useState(null);
  const [readMode, setReadMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  // Text typed on the blank page, waiting for its new note's editor: { title, content }.
  const initialTexts = useRef(new Map());

  const status = useStore((s) => s.status);
  const notes = useStore((s) => s.notes);
  const noteTags = useStore((s) => s.noteTags);

  // ---- boot: session -> data -> realtime -> recover unsaved drafts --------
  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    let subscribedOnce = false;

    async function boot() {
      try {
        const user = await ensureSession();
        if (cancelled) return;
        // Email is required: no session -> sign in; a guest from before -> add an email.
        if (!user || user.is_anonymous) {
          setState({ user, status: user ? "upgrade" : "signin" });
          return;
        }
        setState({ user });
        await loadWorkspace();
        if (cancelled) return;
        setState({ status: "ready", error: null });
        unsubscribe = subscribeWorkspace(user.id, {
          onStatus(channelStatus) {
            if (channelStatus === "SUBSCRIBED") {
              setState({ sync: "live" });
              // A reconnect may have missed events; reload to catch up.
              if (subscribedOnce) loadWorkspace().catch(() => {});
              subscribedOnce = true;
            } else if (channelStatus !== "CLOSED") {
              setState({ sync: "connecting" });
            }
          },
        });
        // Notes created offline in a tab that was closed before they saved.
        recoverPendingNotes();
      } catch (error) {
        if (cancelled) return;
        setState({ status: "error", error: error?.message ?? "Something went wrong" });
      }
    }

    boot();

    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      const current = getState().user;
      // Signing into another account in this or another tab: start fresh.
      if (event === "SIGNED_OUT" || (session?.user && current && session.user.id !== current.id)) {
        // Full reload: every cached note belongs to the previous account.
        history.replaceState(null, "", "/");
        location.reload();
      } else if (session?.user) {
        setState({ user: session.user });
      }
    });

    function handleOnline() {
      setState({ online: true });
      recoverPendingNotes();
    }
    function handleOffline() {
      setState({ online: false });
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      unsubscribe();
      data.subscription.unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Back/forward buttons move between opened notes.
  useEffect(() => {
    const handlePopState = () => {
      setSelectedId(noteIdFromPath(location.pathname));
      setPage(pageFromPath(location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const visibleNotes = useMemo(() => selectNotes({ notes, noteTags, view }), [notes, noteTags, view]);

  // ---- actions -------------------------------------------------------------

  function selectNote(id, { focus = null } = {}) {
    // A new note left without a single character is discarded, not listed as "Untitled".
    if (selectedId && selectedId !== id) {
      discardIfEmpty(selectedId);
      initialTexts.current.delete(selectedId);
    }
    setSelectedId(id);
    setPage(null);
    setFocusTarget(focus);
    const url = id ? `/n/${id}` : "/";
    if (location.pathname !== url) history.pushState(null, "", url);
    const note = id ? getState().notes[id] : null;
    if (note && !note._local) touchNote(note).catch(() => {});
  }

  // The All notes overview: every note as cards or rows, at /notes.
  function openAllNotes() {
    if (selectedId) {
      discardIfEmpty(selectedId);
      initialTexts.current.delete(selectedId);
    }
    setSelectedId(null);
    setPage("notes");
    changeView(DEFAULT_VIEW);
    if (location.pathname !== "/notes") history.pushState(null, "", "/notes");
  }

  // kind: "document" (paper) or "canvas" (free-form board); folderId overrides the current folder view.
  function newNote({ content = "", title = "", kind: noteKind = "document", folderId } = {}) {
    const { kind, id } = parseView(view);
    const note = createLocalNote({
      kind: noteKind,
      folderId: folderId !== undefined ? folderId : kind === "folder" ? id : null,
      isFavorite: kind === "favorites",
    });
    if (content || title) initialTexts.current.set(note.id, { content, title });
    if (["archive", "trash", "recent", "tag", "shared"].includes(kind)) changeView(DEFAULT_VIEW);
    setReadMode(false);
    selectNote(note.id, { focus: title ? "title" : content ? "content" : noteKind === "canvas" ? null : "title" });
  }

  function changeView(nextView) {
    setViewState(nextView);
    try {
      localStorage.setItem(VIEW_KEY, nextView);
    } catch {}
  }

  function moveSelection(delta) {
    if (!visibleNotes.length) return;
    const index = visibleNotes.findIndex((note) => note.id === selectedId);
    const nextIndex = index === -1 ? 0 : Math.min(Math.max(index + delta, 0), visibleNotes.length - 1);
    selectNote(visibleNotes[nextIndex].id);
    document.getElementById(`note-item-${visibleNotes[nextIndex].id}`)?.scrollIntoView({ block: "nearest" });
  }

  useHotkeys([
    { combo: "mod+k", handler: () => setPaletteOpen((open) => !open), allowInInputs: true },
    { combo: "alt+n", handler: () => newNote(), allowInInputs: true },
    { combo: "alt+shift+n", handler: () => newNote({ kind: "canvas" }), allowInInputs: true },
    { combo: "n", handler: () => newNote() },
    { combo: "c", handler: () => newNote() },
    { combo: "mod+e", handler: () => setReadMode((value) => !value), allowInInputs: true },
    { combo: "/", handler: () => setPaletteOpen(true) },
    { combo: "j", handler: () => moveSelection(1) },
    { combo: "k", handler: () => moveSelection(-1) },
    { combo: "arrowdown", handler: () => moveSelection(1) },
    { combo: "arrowup", handler: () => moveSelection(-1) },
    { combo: "?", handler: () => setShortcutsOpen(true) },
    {
      combo: "escape",
      allowInInputs: true,
      handler: (event) => {
        if (event.target instanceof HTMLElement) event.target.blur();
      },
    },
  ]);

  const context = {
    view,
    setView: changeView,
    selectedId,
    selectNote,
    page,
    openAllNotes,
    newNote,
    // Read-only peek (render-safe); cleared when the note is left.
    takeInitialText: (id) => initialTexts.current.get(id)?.content ?? "",
    takeInitialTitle: (id) => initialTexts.current.get(id)?.title ?? "",
    focusTarget,
    readMode,
    setReadMode,
    openPalette: () => setPaletteOpen(true),
    openShortcuts: () => setShortcutsOpen(true),
    toast: toastManager,
  };

  if (status === "signin" || status === "upgrade") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        {/* Reload so every loader starts from the new session. */}
        <AuthForm mode={status} onSignedIn={() => location.reload()} />
      </div>
    );
  }

  return (
    <WorkspaceContext value={context}>
      <SidebarProvider className="h-dvh overflow-hidden" style={{ "--sidebar-width": `${sidebarWidth}px` }}>
        <AppSidebar notes={visibleNotes} onWidthChange={setSidebarWidth} width={sidebarWidth} />
        <SidebarInset className="min-w-0 flex-row overflow-hidden">
          <EditorPane />
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette onOpenChange={setPaletteOpen} open={paletteOpen} />
      <ShortcutsDialog onOpenChange={setShortcutsOpen} open={shortcutsOpen} />
    </WorkspaceContext>
  );
}
