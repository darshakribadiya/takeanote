"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePaper } from "@/hooks/use-paper";
import { getPages, setPaginationConfig } from "@/lib/editor/pagination";
import { PAGE_GAP_PX, pageMetrics } from "@/lib/editor/paper";
import { uploadAttachment } from "@/lib/notes/attachments";
import { NoteTitle } from "../note-title";
import { BlockHandle } from "./block-handle";
import { BubbleToolbar } from "./bubble-toolbar";
import { documentExtensions } from "./document-extensions";
import { MobileToolbar } from "./mobile-toolbar";
import { PaperControls, ZOOM_STEPS } from "./paper-controls";
import { PaperView } from "./paper-view";
import { TableMenu } from "./table-menu";

// Must match `--block-gap` in globals.css (space between top-level blocks).
const BLOCK_GAP_PX = 12;
const TITLE_GAP_PX = 16;
const ZOOM_KEY = "qn:paper-zoom";
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
  };
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

  // Extensions are built once per document; they reach the latest handlers through the bridge.
  useEffect(() => {
    bridge.set({ pickFile, onFiles: handleFiles });
  });


  useEffect(() => {
    onEditor?.(editor);
  }, [editor, onEditor]);

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
  ]);

  return (
    <div className="relative flex min-h-full flex-col">
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
          <EditorContent editor={editor} />
        </PaperView>
      </div>

      {editor && !readOnly && (
        <>
          <BubbleToolbar editor={editor} />
          <TableMenu editor={editor} />
          {!isPhone && <BlockHandle editor={editor} />}
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
        />
      )}

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
