"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useCommentThreads } from "@/hooks/use-comment-threads";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePaper } from "@/hooks/use-paper";
import { quoteOf } from "@/lib/editor/comments";
import { getPages, setPaginationConfig } from "@/lib/editor/pagination";
import { PAGE_GAP_PX, pageMetrics } from "@/lib/editor/paper";
import { uploadAttachment } from "@/lib/notes/attachments";
import { NoteTitle } from "../note-title";
import { BlockHandle } from "./block-handle";
import { BubbleToolbar } from "./bubble-toolbar";
import { CommentsPanel } from "./comments-panel";
import { useDocumentContextMenu } from "./document-context-menu";
import { documentExtensions } from "./document-extensions";
import { FindBar } from "./find-bar";
import { MobileBlockInsert } from "./mobile-block-insert";
import { MobileToolbar } from "./mobile-toolbar";
import { OutlinePanel } from "./outline-panel";
import { PaperControls, ZOOM_STEPS } from "./paper-controls";
import { PaperView } from "./paper-view";
import { TableMenu } from "./table-menu";

// Must match `--block-gap` in globals.css (space between top-level blocks).
const BLOCK_GAP_PX = 12;
const TITLE_GAP_PX = 16;
const ZOOM_KEY = "qn:paper-zoom";
const OUTLINE_KEY = "qn:outline-open";
const WORD_COUNT_DELAY_MS = 500;

/*
 * Stable object handed to the editor extensions (built once per document)
 * that forwards to the component's latest handlers.
 */
function createBridge() {
  const handlers = {};
  return {
    set: (next) => Object.assign(handlers, next),
    pickFile: (accept) => handlers.pickFile?.(accept),
    onFiles: (files, pos) => handlers.onFiles?.(files, pos),
    onCommentActivate: (threadId) => handlers.onCommentActivate?.(threadId),
    startComment: () => handlers.startComment?.(),
  };
}

function readOutlineOpen() {
  try {
    return localStorage.getItem(OUTLINE_KEY) === "1";
  } catch {
    return false;
  }
}

function readZoom() {
  try {
    const stored = localStorage.getItem(ZOOM_KEY);
    if (!stored || stored === "fit") return "fit";
    const number = Number(stored);
    return Number.isFinite(number) ? number : "fit";
  } catch {
    return "fit";
  }
}

/*
 * Document mode: a title and a Tiptap body on configurable paper.
 * The body is bound to the note's Yjs document, so autosave, offline
 * edits and live collaboration all come from the sync layer.
 */
export function DocumentEditor({
  noteId,
  doc,
  awareness,
  user,
  readOnly,
  autoFocus,
  initialText,
  ensurePersisted,
  onError,
  onEditor,
  scrollRef,
  titleFallback,
}) {
  const [paper, setPaper] = usePaper(doc);
  const metrics = pageMetrics(paper);
  const isPhone = useMediaQuery("max-md");
  const [pagePreview, setPagePreview] = useState(false);
  const reflow = isPhone && !pagePreview;
  const [zoom, setZoomState] = useState(readZoom);
  const [availableWidth, setAvailableWidth] = useState(metrics.width);
  const [titleHeight, setTitleHeight] = useState(48);
  const titleRef = useRef(null);
  const titleWrapRef = useRef(null);
  const fileInputRef = useRef(null);
  const insertAtRef = useRef(null);
  const [bridge] = useState(createBridge);
  const [outlineOpen, setOutlineOpenState] = useState(readOutlineOpen);
  const [find, setFind] = useState({ open: false, replace: false, key: 0 });
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const threads = useCommentThreads(doc);

  const scale = reflow
    ? 1
    : zoom === "fit"
      ? Math.min(1, Math.max(0.3, (availableWidth - 48) / metrics.width))
      : zoom;

  function setZoom(value) {
    setZoomState(value);
    try {
      localStorage.setItem(ZOOM_KEY, String(value));
    } catch {}
  }

  // ---- editor ----------------------------------------------------------------

  const editor = useEditor(
    {
      extensions: documentExtensions({
        doc,
        awareness,
        user,
        actions: bridge,
        onFiles: bridge.onFiles,
      }),
      editable: !readOnly,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: "paper-prose", "aria-label": "Note body", spellcheck: "true" },
      },
      onCreate: ({ editor: created }) => {
        if (initialText && created.isEmpty) {
          created.chain().insertContent(initialText).focus("end").run();
        } else if (autoFocus === "content") {
          created.commands.focus("end");
        }
      },
    },
    [doc],
  );

  useEffect(() => {
    if (editor && editor.isEditable === readOnly) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // ---- uploads ---------------------------------------------------------------

  async function handleFiles(files, pos) {
    let insertAt = pos;
    for (const file of files) {
      try {
        const stored = await uploadAttachment(noteId, file, { ensurePersisted });
        const node = file.type.startsWith("image/")
          ? { type: "image", attrs: { src: stored.url, alt: file.name, title: file.name } }
          : { type: "attachment", attrs: { path: stored.path, name: stored.name, size: stored.size, mime: stored.mime } };
        // Clamp: collaborators may have shortened the document meanwhile.
        const safePos = Math.min(insertAt, editor.state.doc.content.size);
        editor.chain().insertContentAt(safePos, node).run();
        insertAt = editor.state.selection.to;
      } catch (error) {
        onError?.({ title: `Couldn't upload ${file.name}`, description: error.message });
      }
    }
  }

  function pickFile(accept) {
    const input = fileInputRef.current;
    if (!input) return;
    insertAtRef.current = editor?.state.selection.from ?? null;
    input.accept = accept;
    input.click();
  }

  // ---- outline, find, comments ----------------------------------------------

  function setOutlineOpen(open) {
    setOutlineOpenState(open);
    try {
      localStorage.setItem(OUTLINE_KEY, open ? "1" : "0");
    } catch {}
  }

  function openFind(replace) {
    setFind((current) => ({ open: true, replace, key: current.key + 1 }));
  }

  // Marks the selected text and opens a new thread for it in the panel.
  function startComment() {
    if (!editor || readOnly || editor.state.selection.empty) return;
    if (draft) editor.commands.removeComment(draft.id);
    const { from, to } = editor.state.selection;
    const id = crypto.randomUUID();
    const quote = quoteOf(editor.state, from, to);
    editor.chain().setComment(id).setTextSelection(to).run();
    setDraft({ id, quote });
    setActiveThread(id);
    setCommentsOpen(true);
  }

  function finishDraft({ cancelled }) {
    if (!draft) return;
    if (cancelled) {
      editor?.commands.removeComment(draft.id);
      setActiveThread(null);
    }
    setDraft(null);
  }

  function activateThread(threadId) {
    setActiveThread(threadId);
    if (threadId) setCommentsOpen(true);
  }

  // Highlight open threads (and the one being written); resolved ones go quiet.
  useEffect(() => {
    if (!editor) return;
    const visible = new Set([...threads.values()].filter((thread) => !thread.resolved).map((thread) => thread.id));
    if (draft) visible.add(draft.id);
    editor.commands.setCommentView({ visible, active: commentsOpen ? activeThread : null });
  }, [editor, threads, draft, activeThread, commentsOpen]);

  const openThreadCount = [...threads.values()].filter((thread) => !thread.resolved).length;

  // Extensions are built once per document; they reach the latest handlers through the bridge.
  useEffect(() => {
    bridge.set({ pickFile, onFiles: handleFiles, onCommentActivate: activateThread, startComment });
  });


  useEffect(() => {
    onEditor?.(editor);
  }, [editor, onEditor]);

  const contextMenu = useDocumentContextMenu({ editor, readOnly, actions: bridge, onError });

  // ---- layout ----------------------------------------------------------------

  useEffect(() => {
    const target = scrollRef?.current;
    if (!target) return;
    const observer = new ResizeObserver(() => setAvailableWidth(target.clientWidth));
    observer.observe(target);
    setAvailableWidth(target.clientWidth);
    return () => observer.disconnect();
  }, [scrollRef]);

  useEffect(() => {
    const wrap = titleWrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => setTitleHeight(wrap.offsetHeight));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const paged = paper.layout === "paged" && !reflow;
  useEffect(() => {
    setPaginationConfig(
      editor,
      paged
        ? {
            contentHeight: metrics.contentHeight,
            margin: metrics.margin,
            gap: PAGE_GAP_PX,
            blockGap: BLOCK_GAP_PX,
            firstPageOffset: titleHeight + TITLE_GAP_PX,
          }
        : null,
    );
  }, [editor, paged, metrics.contentHeight, metrics.margin, titleHeight]);

  const pages = useEditorState({ editor, selector: ({ editor: current }) => (current ? getPages(current.state) : null) }) ?? [
    { used: 0 },
  ];
  const words = useWordCount(editor);

  useHotkeys([
    { combo: "mod+=", allowInInputs: true, handler: () => setZoom(ZOOM_STEPS.find((value) => value > scale + 0.001) ?? scale) },
    { combo: "mod+-", allowInInputs: true, handler: () => setZoom([...ZOOM_STEPS].reverse().find((value) => value < scale - 0.001) ?? scale) },
    { combo: "mod+0", allowInInputs: true, handler: () => setZoom("fit") },
    { combo: "mod+f", allowInInputs: true, handler: () => openFind(false) },
    { combo: "mod+h", allowInInputs: true, handler: () => openFind(true) },
    { combo: "mod+alt+f", allowInInputs: true, handler: () => openFind(true) },
    { combo: "mod+alt+m", allowInInputs: true, handler: () => editor?.view.hasFocus() && startComment() },
  ]);

  const panelToggles = {
    outlineOpen,
    onToggleOutline: () => setOutlineOpen(!outlineOpen),
    findOpen: find.open,
    onFind: () => (find.open ? setFind((current) => ({ ...current, open: false })) : openFind(false)),
    commentsOpen,
    commentCount: openThreadCount,
    onToggleComments: () => {
      if (commentsOpen) finishDraft({ cancelled: true });
      setCommentsOpen(!commentsOpen);
    },
  };

  return (
    <div className="relative flex min-h-full flex-col">
      {editor && (outlineOpen || find.open || commentsOpen) && (
        <div className="pointer-events-none sticky top-3 z-30 h-0 px-3 md:top-4 md:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto">
              {outlineOpen && <OutlinePanel editor={editor} onClose={() => setOutlineOpen(false)} scrollRef={scrollRef} />}
            </div>
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              {find.open && (
                <FindBar
                  editor={editor}
                  focusKey={find.key}
                  onClose={() => setFind((current) => ({ ...current, open: false }))}
                  readOnly={readOnly}
                  withReplace={find.replace}
                />
              )}
              {commentsOpen && (
                <CommentsPanel
                  activeId={activeThread}
                  doc={doc}
                  draft={draft}
                  editor={editor}
                  onActivate={setActiveThread}
                  onClose={() => {
                    finishDraft({ cancelled: true });
                    setCommentsOpen(false);
                  }}
                  onDraftDone={finishDraft}
                  readOnly={readOnly}
                  threads={threads}
                  user={user}
                />
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 px-0 pt-4 pb-28 md:px-6 md:pt-8">
        <PaperView metrics={metrics} pages={pages} paper={paper} reflow={reflow} scale={scale}>
          <div ref={titleWrapRef} style={{ marginBottom: TITLE_GAP_PX }}>
            <NoteTitle
              autoFocus={autoFocus === "title"}
              doc={doc}
              fallback={titleFallback}
              inputRef={titleRef}
              onExit={() => editor?.commands.focus("start")}
              readOnly={readOnly}
            />
          </div>
          <EditorContent editor={editor} onContextMenu={contextMenu.handleContextMenu} />
        </PaperView>
      </div>

      {editor && !readOnly && (
        <>
          <BubbleToolbar editor={editor} onComment={startComment} />
          <TableMenu editor={editor} />
          {!isPhone && <BlockHandle editor={editor} />}
          {isPhone && <MobileBlockInsert editor={editor} />}
          {isPhone && <MobileToolbar editor={editor} onPickFile={pickFile} />}
        </>
      )}

      <div className="pointer-events-none sticky bottom-3 z-20 flex justify-end px-3 max-md:hidden md:bottom-4 md:px-4">
        <PaperControls
          isPhone={isPhone}
          onTogglePreview={() => setPagePreview((value) => !value)}
          paper={paper}
          readOnly={readOnly}
          reflow={reflow}
          scale={scale}
          setPaper={setPaper}
          setZoom={setZoom}
          words={words}
          zoom={zoom}
          {...panelToggles}
        />
      </div>
      {isPhone && (
        <PhonePaperControls
          editor={editor}
          isPhone={isPhone}
          onTogglePreview={() => setPagePreview((value) => !value)}
          paper={paper}
          readOnly={readOnly}
          reflow={reflow}
          scale={scale}
          setPaper={setPaper}
          setZoom={setZoom}
          words={words}
          zoom={zoom}
          {...panelToggles}
        />
      )}

      {contextMenu.element}

      <input
        className="hidden"
        multiple
        onChange={(event) => {
          const files = [...event.target.files];
          event.target.value = "";
          if (files.length) handleFiles(files, insertAtRef.current ?? editor?.state.selection.from ?? 0);
        }}
        ref={fileInputRef}
        type="file"
      />
    </div>
  );
}

// On phones the pill hides while typing so the keyboard toolbar has room.
function PhonePaperControls({ editor, ...props }) {
  const focused = useEditorState({ editor, selector: ({ editor: current }) => current?.isFocused ?? false });
  if (focused) return null;
  return (
    <div className="pointer-events-none sticky bottom-3 z-20 flex justify-end px-3 md:hidden">
      <PaperControls {...props} />
    </div>
  );
}

// Word count without walking the whole document on every keystroke.
function useWordCount(editor) {
  const [words, setWords] = useState(0);
  useEffect(() => {
    if (!editor) return;
    let timer = 0;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setWords(editor.storage.characterCount?.words() ?? 0), WORD_COUNT_DELAY_MS);
    };
    update();
    editor.on("update", update);
    return () => {
      clearTimeout(timer);
      editor.off("update", update);
    };
  }, [editor]);
  return words;
}
