import { getHTMLFromFragment, getSchema, resolveExtensions } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { downloadFile, fileSlug, printDocument, toHtmlDocument, toMarkdown } from "@/lib/editor/export";
import { DEFAULT_PAPER, readPaper } from "@/lib/editor/paper";
import { noteState } from "@/lib/notes/api";
import { BODY, displayTitle, plainText, SETTINGS, TITLE } from "@/lib/sync/doc-model";
import { documentExtensions } from "./document/document-extensions";

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

/*
 * The export helpers take an editor; for a note that isn't open this
 * stands in for one, built from the stored Yjs document.
 */
function documentSource(doc) {
  const extensions = resolveExtensions(documentExtensions({ doc: new Y.Doc(), awareness: null, user: null, actions: {} }));
  const schema = getSchema(extensions);
  const root = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(BODY), schema);
  return {
    getHTML: () => getHTMLFromFragment(root.content, schema),
    getMarkdown: () => new MarkdownManager({ extensions }).serialize(root.toJSON()),
    getText: () => root.textBetween(0, root.content.size, "\n\n"),
    state: { doc: root },
  };
}

// Canvas text in reading order; one paragraph per line.
function canvasSource(doc) {
  const lines = plainText(doc, "canvas").split("\n").filter(Boolean);
  return {
    getHTML: () => lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n"),
    getMarkdown: () => lines.join("\n\n"),
    getText: () => lines.join("\n"),
    state: { doc: { forEach: (fn) => lines.forEach((line) => fn({ textContent: line })) } },
  };
}

/*
 * Exports any note from the sidebar without opening it.
 * format: "md" | "html" | "print"
 */
export async function exportStoredNote(note, format) {
  const kind = note.kind ?? "document";
  const doc = new Y.Doc();
  Y.applyUpdate(doc, await noteState(note));
  const title = doc.getText(TITLE).toString().trim();
  const name = fileSlug(displayTitle(doc, kind));
  const source = kind === "canvas" ? canvasSource(doc) : documentSource(doc);
  const paper = kind === "canvas" ? { ...DEFAULT_PAPER, layout: "continuous" } : readPaper(doc.getMap(SETTINGS));
  doc.destroy();

  if (format === "md") downloadFile(`${name}.md`, toMarkdown(source, title), "text/markdown");
  else if (format === "html") downloadFile(`${name}.html`, toHtmlDocument(source, title, paper), "text/html");
  else printDocument(source, title, paper);
}
