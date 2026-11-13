import * as Y from "yjs";

/*
 * Layout of one note's Yjs document. Both note kinds share it so
 * duplicating, syncing and exporting never need to know the kind.
 *
 *   title     Y.Text         note title
 *   body      Y.XmlFragment  document body (Tiptap / ProseMirror)
 *   settings  Y.Map          paper settings (size, margins, pattern…) and autosave
 *   nodes     Y.Map          canvas nodes:  id -> { type, position, … }
 *   edges     Y.Map          canvas edges:  id -> { source, target, … }
 *   node:<id> Y.XmlFragment  rich text inside one canvas node
 */
export const TITLE = "title";
export const BODY = "body";
export const SETTINGS = "settings";
export const NODES = "nodes";
export const EDGES = "edges";

// Key in `settings`: false = save only on Ctrl+S / Save; missing or true = autosave.
export const AUTOSAVE = "autosave";

export function nodeField(nodeId) {
  return `node:${nodeId}`;
}

// Prosemirror nodes that render inline; everything else is a block.
const INLINE_NODES = new Set(["hardBreak", "image", "attachment"]);

function xmlText(node) {
  if (node instanceof Y.XmlText) {
    return node
      .toDelta()
      .map((part) => (typeof part.insert === "string" ? part.insert : ""))
      .join("");
  }
  if (node instanceof Y.XmlElement) {
    if (node.nodeName === "hardBreak") return "\n";
    if (INLINE_NODES.has(node.nodeName)) return "";
    const children = node.toArray();
    const hasBlocks = children.some((child) => child instanceof Y.XmlElement && !INLINE_NODES.has(child.nodeName));
    return children.map(xmlText).join(hasBlocks ? "\n" : "");
  }
  return "";
}

export function fragmentText(fragment) {
  return fragment
    .toArray()
    .map(xmlText)
    .filter((text) => text.length)
    .join("\n");
}

/*
 * Plain text for the list preview and full-text search.
 * Example: document "Plan" with "- milk\n- eggs" -> "milk\neggs"
 */
export function plainText(doc, kind) {
  if (kind === "canvas") {
    return canvasNodeIdsInReadingOrder(doc)
      .map((id) => nodeText(doc, id))
      .filter(Boolean)
      .join("\n");
  }
  return fragmentText(doc.getXmlFragment(BODY));
}

function nodeText(doc, id) {
  return fragmentText(doc.getXmlFragment(nodeField(id))) || doc.getMap(NODES).get(id)?.label || "";
}

/*
 * Canvas nodes the way people read a board: top to bottom, then left to
 * right. Rows are 40 px tall so nodes that only roughly line up still
 * count as one row.
 * Example: A (x 400, y 10), B (x 0, y 20), C (x 0, y 300) -> [B, A, C]
 */
const READING_ROW_PX = 40;

export function canvasNodeIdsInReadingOrder(doc) {
  const items = [];
  doc.getMap(NODES).forEach((value, id) => items.push({ id, x: value.x ?? 0, y: value.y ?? 0 }));
  items.sort((a, b) => Math.floor(a.y / READING_ROW_PX) - Math.floor(b.y / READING_ROW_PX) || a.x - b.x);
  return items.map((item) => item.id);
}

const FALLBACK_TITLE_LENGTH = 80;

function firstLine(text) {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  return line ? line.slice(0, FALLBACK_TITLE_LENGTH) : "";
}

/*
 * Title to show when the note has none: the document's first non-empty
 * line, or the first text on the canvas in reading order. Stops at the
 * first block with text, so it stays cheap on long documents.
 * Example: document "\nShopping list\n- milk" -> "Shopping list"
 */
export function fallbackTitle(doc, kind) {
  if (kind === "canvas") {
    for (const id of canvasNodeIdsInReadingOrder(doc)) {
      const line = firstLine(nodeText(doc, id));
      if (line) return line;
    }
    return "";
  }
  for (const block of doc.getXmlFragment(BODY).toArray()) {
    const line = firstLine(xmlText(block));
    if (line) return line;
  }
  return "";
}

// Explicit title, else the fallback, else "Untitled".
export function displayTitle(doc, kind) {
  return doc.getText(TITLE).toString().trim() || fallbackTitle(doc, kind) || "Untitled";
}

export function isEmptyDoc(doc) {
  return (
    !doc.getText(TITLE).length &&
    !fragmentText(doc.getXmlFragment(BODY)).trim() &&
    doc.getMap(NODES).size === 0
  );
}

/*
 * Rewrites a Y.Text with the smallest single splice, so a collaborator
 * editing another part of the title keeps their cursor.
 * Example: "Weekly plan" -> "Weekly sync plan" inserts "sync " only.
 */
export function setTextMinimal(ytext, next) {
  const current = ytext.toString();
  if (current === next) return;
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start += 1;
  let endCurrent = current.length;
  let endNext = next.length;
  while (endCurrent > start && endNext > start && current[endCurrent - 1] === next[endNext - 1]) {
    endCurrent -= 1;
    endNext -= 1;
  }
  ytext.doc.transact(() => {
    if (endCurrent > start) ytext.delete(start, endCurrent - start);
    if (endNext > start) ytext.insert(start, next.slice(start, endNext));
  });
}
