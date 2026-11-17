"use client";

import { useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Image } from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 80;
const ALIGNS = [
  { id: "left", label: "Align left", icon: "mdi:format-align-left" },
  { id: "center", label: "Align center", icon: "mdi:format-align-center" },
  { id: "right", label: "Align right", icon: "mdi:format-align-right" },
];
// Share of the text column; null = natural size (still capped at the column).
const WIDTHS = [
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "Full" },
];

/*
 * Images in a document: drag either edge to resize, plus a small toolbar
 * (alignment, width presets, caption) while the image is selected.
 * `width` is in CSS pixels at 100% zoom; height always follows the
 * picture's own aspect ratio.
 */
export const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (element) => element.closest("figure")?.getAttribute("data-align") ?? element.getAttribute("data-align") ?? "center",
        renderHTML: () => ({}),
      },
      caption: {
        default: "",
        parseHTML: (element) => element.closest("figure")?.querySelector("figcaption")?.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        // Our own export: the figure is one image, so its caption isn't read as a paragraph.
        tag: "figure[data-image]",
        getAttrs: (element) => {
          const image = element.querySelector('img[src]:not([src^="data:"])');
          if (!image) return false;
          return {
            src: image.getAttribute("src"),
            alt: image.getAttribute("alt"),
            title: image.getAttribute("title"),
            width: parseInt(element.style.width, 10) || null,
          };
        },
      },
      { tag: 'img[src]:not([src^="data:"])' },
    ];
  },

  // Exports and copy/paste: a <figure> so the alignment and caption survive.
  renderHTML({ node, HTMLAttributes }) {
    const { align, caption, width } = node.attrs;
    const style = [
      width ? `width:${width}px;max-width:100%` : "max-width:100%",
      align === "left" ? "margin-right:auto" : align === "right" ? "margin-left:auto" : "margin-inline:auto",
    ].join(";");
    const image = ["img", { ...HTMLAttributes, height: null, style: "width:100%;height:auto" }];
    return [
      "figure",
      { "data-image": "", "data-align": align, style: `${style};margin-block:0` },
      image,
      ...(caption ? [["figcaption", { style: "text-align:center;font-size:0.85em;color:#78716c" }, caption]] : []),
    ];
  },

  renderMarkdown(node) {
    const { src = "", alt = "", caption } = node.attrs ?? {};
    const image = `![${alt ?? ""}](${src})`;
    return caption ? `${image}\n*${caption}*` : image;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

function ImageView({ node, updateAttributes, selected, editor, deleteNode }) {
  const { src, alt, width, align, caption } = node.attrs;
  const [draftWidth, setDraftWidth] = useState(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const frameRef = useRef(null);
  const editable = editor.isEditable;
  const shownWidth = draftWidth ?? width;

  // Width of the text column at 100% zoom (the paper itself may be scaled).
  function columnWidth() {
    return editor.view.dom.clientWidth || 600;
  }

  function startResize(event, side) {
    event.preventDefault();
    event.stopPropagation();
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    // Screen pixels per CSS pixel (zoom), so the edge follows the pointer.
    const zoom = rect.width / frame.offsetWidth || 1;
    const startX = event.clientX;
    const startWidth = frame.offsetWidth;
    // A centred image grows on both sides, so it needs twice the pointer travel.
    const factor = align === "center" ? 2 : 1;
    const max = columnWidth();
    let next = startWidth;

    const move = (moveEvent) => {
      const delta = ((moveEvent.clientX - startX) / zoom) * (side === "right" ? 1 : -1) * factor;
      next = Math.round(Math.min(max, Math.max(MIN_WIDTH, startWidth + delta)));
      setDraftWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraftWidth(null);
      if (next !== startWidth) updateAttributes({ width: next, height: null });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const currentShare = shownWidth ? shownWidth / columnWidth() : null;
  const showCaption = caption || (editable && (editingCaption || selected));

  return (
    <NodeViewWrapper as="figure" className="doc-image" data-align={align} data-drag-handle="">
      <div
        className={cn("doc-image-frame", selected && "is-selected")}
        ref={frameRef}
        style={{ width: shownWidth ? `${shownWidth}px` : undefined }}
      >
        {/* User uploads from Storage, shown at their stored size; next/image doesn't fit here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt ?? ""} draggable={false} src={src} />
        {editable && (
          <>
            <ResizeHandle onPointerDown={(event) => startResize(event, "left")} side="left" />
            <ResizeHandle onPointerDown={(event) => startResize(event, "right")} side="right" />
          </>
        )}
        {editable && selected && (
          <div className="doc-image-toolbar" contentEditable={false}>
            {ALIGNS.map((item) => (
              <ToolbarButton active={align === item.id} key={item.id} label={item.label} onClick={() => updateAttributes({ align: item.id })}>
                <Icon icon={item.icon} />
              </ToolbarButton>
            ))}
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
            {WIDTHS.map((item) => (
              <ToolbarButton
                active={currentShare !== null && Math.abs(currentShare - item.value) < 0.02}
                key={item.value}
                label={`Width ${item.label}`}
                onClick={() => updateAttributes({ width: Math.round(columnWidth() * item.value), height: null })}
                wide
              >
                <span className="text-xs">{item.label}</span>
              </ToolbarButton>
            ))}
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
            <ToolbarButton active={Boolean(caption)} label="Caption" onClick={() => setEditingCaption(true)}>
              <Icon icon="mdi:closed-caption-outline" />
            </ToolbarButton>
            <ToolbarButton label="Delete image" onClick={deleteNode}>
              <Icon icon="mdi:delete-outline" />
            </ToolbarButton>
          </div>
        )}
      </div>
      {showCaption &&
        (editable ? (
          <CaptionInput
            autoFocus={editingCaption}
            onBlur={() => setEditingCaption(false)}
            onCommit={(value) => value !== caption && updateAttributes({ caption: value })}
            onExit={() => editor.commands.focus(editor.state.selection.to + 1)}
            value={caption}
          />
        ) : (
          <figcaption className="doc-image-caption">{caption}</figcaption>
        ))}
    </NodeViewWrapper>
  );
}

// Commits on blur / Enter, so collaborators don't get one update per letter.
function CaptionInput({ value, onCommit, onBlur, onExit, autoFocus }) {
  return (
    <input
      aria-label="Image caption"
      autoFocus={autoFocus}
      className="doc-image-caption"
      defaultValue={value}
      key={value}
      maxLength={300}
      onBlur={(event) => {
        onCommit(event.target.value.trim());
        onBlur();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
          onExit();
        } else if (event.key === "Escape") {
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
      placeholder="Add a caption"
    />
  );
}

function ResizeHandle({ side, onPointerDown }) {
  return (
    <span
      aria-hidden="true"
      className="doc-image-handle"
      contentEditable={false}
      data-side={side}
      onPointerDown={onPointerDown}
    />
  );
}

function ToolbarButton({ active, label, onClick, children, wide }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md hover:bg-accent [&_svg]:size-4",
        wide ? "px-1.5" : "w-7",
        active && "bg-accent text-accent-foreground",
      )}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
