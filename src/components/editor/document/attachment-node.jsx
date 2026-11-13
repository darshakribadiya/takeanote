"use client";

import { Icon } from "@iconify/react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { attachmentUrl, formatBytes } from "@/lib/notes/attachments";
import { cn } from "@/lib/utils";

const FILE_ICONS = [
  [/^image\//, "mdi:file-image-outline"],
  [/^video\//, "mdi:file-video-outline"],
  [/^audio\//, "mdi:file-music-outline"],
  [/pdf$/, "mdi:file-pdf-box"],
  [/(zip|compressed|tar|rar)/, "mdi:folder-zip-outline"],
  [/(sheet|excel|csv)/, "mdi:file-table-outline"],
  [/(word|document|text)/, "mdi:file-document-outline"],
];

function fileIcon(mime = "") {
  return FILE_ICONS.find(([pattern]) => pattern.test(mime))?.[1] ?? "mdi:file-outline";
}

// A file card in the document. The file itself lives in Storage at `path`.
export const Attachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      path: { default: null },
      name: { default: "File" },
      size: { default: null },
      mime: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-attachment]",
        getAttrs: (element) => ({
          path: element.getAttribute("data-path"),
          name: element.textContent,
          size: Number(element.getAttribute("data-size")) || null,
          mime: element.getAttribute("data-mime") ?? "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-attachment": "",
        "data-path": node.attrs.path,
        "data-size": node.attrs.size,
        "data-mime": node.attrs.mime,
        href: node.attrs.path ? attachmentUrl(node.attrs.path, { download: true }) : null,
        class: "attachment-link",
      }),
      node.attrs.name,
    ];
  },

  renderMarkdown(node) {
    const { name, path } = node.attrs ?? {};
    return path ? `[${name}](${attachmentUrl(path, { download: true })})` : name;
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentCard);
  },
});

function AttachmentCard({ node, selected }) {
  const { name, size, mime, path } = node.attrs;
  return (
    <NodeViewWrapper className="attachment-node" data-drag-handle="">
      <div
        className={cn(
          "flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 shadow-xs/5 transition-shadow",
          selected && "ring-2 ring-ring/48",
        )}
        contentEditable={false}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" icon={fileIcon(mime)} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{formatBytes(size)}</span>
        </span>
        {path && (
          <span className="flex shrink-0 gap-1">
            <a
              aria-label={`Open ${name}`}
              className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-accent"
              href={attachmentUrl(path)}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Icon className="size-4.5" icon="mdi:open-in-new" />
            </a>
            <a
              aria-label={`Download ${name}`}
              className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-accent"
              download={name}
              href={attachmentUrl(path, { download: true })}
            >
              <Icon className="size-4.5" icon="mdi:download-outline" />
            </a>
          </span>
        )}
      </div>
    </NodeViewWrapper>
  );
}
