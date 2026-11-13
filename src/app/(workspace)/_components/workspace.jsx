"use client";

import { createContext, use, useEffect, useMemo, useRef, useState } from "react";
import { browser } from "react-dom";
import { useParams } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { toastManager } from "@/components/ui/toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { createClient } from "@/lib/supabase/client";
import {
  createLocalNote,
  discardIfEmpty,
  ensureSession,
  loadWorkspace,
  recoverPendingNotes,
  searchNoteIds,
  subscribeWorkspace,
  touchNote,
} from "@/lib/notes/api";
import { getState, setState, useStore } from "@/lib/notes/store";
import { DEFAULT_VIEW, parseView, selectNotes } from "@/lib/notes/views";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { EditorPane } from "./editor-pane";
import { NoteList } from "./note-list";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { SignInPanel } from "./sign-in-panel";

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

export function Workspace() {
  // Session, drafts and shortcuts are browser-only; prerender the skeleton instead.
  use(browser("The notes workspace depends on the browser session and local drafts."));

  const params = useParams();
  const isMobile = useMediaQuery("max-md");
  const [selectedId, setSelectedId] = useState(() => params?.id ?? null);
  const [view, setViewState] = useState(readStoredView);
  const [query, setQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState(null);
  const [readMode, setReadMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [serverSearch, setServerSearch] = useState({ query: "", ids: new Set() });
  // Quick-capture text waiting for its new note's editor to pick it up.
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
        const anonymousDisabled = /anonymous/i.test(error?.message ?? "");
        setState({ status: anonymousDisabled ? "signin" : "error", error: error?.message ?? "Something went wrong" });
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
    const handlePopState = () => setSelectedId(noteIdFromPath(location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Full-text search on note bodies, debounced; titles match locally at once.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || status !== "ready") return;
    const timer = setTimeout(async () => {
      const ids = await searchNoteIds(trimmed);
      setServerSearch({ query: trimmed, ids: new Set(ids) });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, status]);

  const serverMatches = serverSearch.query === query.trim() ? serverSearch.ids : null;
  const visibleNotes = useMemo(
    () => selectNotes({ notes, noteTags, view, query, serverMatches }),
    [notes, noteTags, view, query, serverMatches],
  );

  // ---- actions -------------------------------------------------------------

  function selectNote(id, { focus = null } = {}) {
    // A new note left without a single character is discarded, not listed as "Untitled".
    if (selectedId && selectedId !== id) {
      discardIfEmpty(selectedId);
      initialTexts.current.delete(selectedId);
    }
    setSelectedId(id);
    setFocusTarget(focus);
    const url = id ? `/n/${id}` : "/";
    if (location.pathname !== url) history.pushState(null, "", url);
    const note = id ? getState().notes[id] : null;
    if (note && !note._local) touchNote(note).catch(() => {});
  }

  // kind: "document" (paper) or "canvas" (free-form board)
  function newNote({ content = "", kind: noteKind = "document" } = {}) {
    const { kind, id } = parseView(view);
    const note = createLocalNote({
      kind: noteKind,
      folderId: kind === "folder" ? id : null,
      isFavorite: kind === "favorites",
    });
    if (content) initialTexts.current.set(note.id, content);
    if (["archive", "trash", "recent", "tag"].includes(kind)) changeView(DEFAULT_VIEW);
    setReadMode(false);
    selectNote(note.id, { focus: content ? "content" : noteKind === "canvas" ? null : "title" });
  }

  function changeView(nextView) {
    setViewState(nextView);
    setQuery("");
    try {
      localStorage.setItem(VIEW_KEY, nextView);
    } catch {}
    // On phones the list and editor share the screen; show the list.
    if (isMobile) selectNote(null);
  }

  function moveSelection(delta) {
    if (!visibleNotes.length) return;
    const index = visibleNotes.findIndex((note) => note.id === selectedId);
    const nextIndex = index === -1 ? 0 : Math.min(Math.max(index + delta, 0), visibleNotes.length - 1);
    selectNote(visibleNotes[nextIndex].id);
    document.getElementById(`note-item-${visibleNotes[nextIndex].id}`)?.scrollIntoView({ block: "nearest" });
  }

  function focusSearch() {
    document.getElementById("note-search")?.focus();
  }

  useHotkeys([
    { combo: "mod+k", handler: () => setPaletteOpen((open) => !open), allowInInputs: true },
    { combo: "alt+n", handler: () => newNote(), allowInInputs: true },
    { combo: "alt+shift+n", handler: () => newNote({ kind: "canvas" }), allowInInputs: true },
    { combo: "n", handler: () => newNote() },
    { combo: "c", handler: () => newNote() },
    { combo: "mod+e", handler: () => setReadMode((value) => !value), allowInInputs: true },
    { combo: "/", handler: focusSearch },
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
        if (isMobile && !paletteOpen) selectNote(null);
      },
    },
  ]);

  const context = {
    view,
    setView: changeView,
    query,
    setQuery,
    selectedId,
    selectNote,
    newNote,
    // Read-only peek (render-safe); cleared when the note is left.
    takeInitialText: (id) => initialTexts.current.get(id) ?? "",
    focusTarget,
    readMode,
    setReadMode,
    openPalette: () => setPaletteOpen(true),
    openShortcuts: () => setShortcutsOpen(true),
    toast: toastManager,
  };

  if (status === "signin") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <SignInPanel />
      </div>
    );
  }

  return (
    <WorkspaceContext value={context}>
      <SidebarProvider className="h-dvh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-w-0 flex-row overflow-hidden">
          <NoteList className={cn(selectedId && "max-md:hidden")} notes={visibleNotes} />
          <EditorPane className={cn(!selectedId && "max-md:hidden")} />
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette onOpenChange={setPaletteOpen} open={paletteOpen} />
      <ShortcutsDialog onOpenChange={setShortcutsOpen} open={shortcutsOpen} />
    </WorkspaceContext>
  );
}
