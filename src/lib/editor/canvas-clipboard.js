import * as Y from "yjs";
import { edgesMap, GRID, membersOf, nodesMap, transact } from "@/lib/editor/canvas-model";
import { fromBase64, toBase64 } from "@/lib/sync/base64";
import { fragmentText, nodeField } from "@/lib/sync/doc-model";

/*
 * Copy and paste for canvas items, across boards, notes and browser tabs.
 *
 * The clipboard gets plain text (so pasting into an email still makes
 * sense) and HTML that carries the items as JSON in a data attribute:
 *
 *   { v: 1, nodes: [{ id, value, text }], edges: [{ source, target, … }] }
 *
 * `text` is the node's rich text as a base64 Yjs update, so formatting
 * survives. Pasting creates new ids, keeps arrows between pasted items,
 * and keeps group membership when the group is pasted along.
 */

const VERSION = 1;
const ATTRIBUTE = "data-qn-canvas";
// Same-tab copy, for when the browser won't let us read the clipboard.
let lastCopied = null;

function encodeFragment(doc, id) {
  const source = doc.getXmlFragment(nodeField(id));
  if (!source.length) return null;
  const scratch = new Y.Doc();
  scratch.getXmlFragment("text").insert(0, source.toArray().map((item) => item.clone()));
  return toBase64(Y.encodeStateAsUpdate(scratch));
}

function decodeInto(doc, id, encoded) {
  if (!encoded) return;
  const scratch = new Y.Doc();
  Y.applyUpdate(scratch, fromBase64(encoded));
  const items = scratch.getXmlFragment("text").toArray();
  if (items.length) doc.getXmlFragment(nodeField(id)).insert(0, items.map((item) => item.clone()));
}

// Selected nodes plus the members of selected groups, and arrows between them.
export function serializeItems(doc, ids) {
  const map = nodesMap(doc);
  const all = new Set(ids);
  for (const id of ids) if (map.get(id)?.type === "frame") membersOf(doc, id).forEach((member) => all.add(member));
  const nodes = [...all]
    .map((id) => ({ id, value: map.get(id), text: encodeFragment(doc, id) }))
    .filter((item) => item.value);
  if (!nodes.length) return null;
  const edges = [];
  edgesMap(doc).forEach((edge) => {
    if (all.has(edge.source) && all.has(edge.target)) edges.push(edge);
  });
  return { v: VERSION, nodes, edges };
}

/*
 * Text version of the items for other apps, in reading order.
 * Example: a sticky "Ideas" and a text box "Ship it" -> "Ideas\n\nShip it"
 */
export function itemsText(doc, payload) {
  return [...payload.nodes]
    .sort((a, b) => a.value.y - b.value.y || a.value.x - b.value.x)
    .map(({ id, value }) => {
      if (value.type === "frame") return value.label ?? "";
      if (value.type === "image" || value.type === "file") return value.name ?? "";
      return value.secret ? "" : fragmentText(doc.getXmlFragment(nodeField(id)));
    })
    .filter(Boolean)
    .join("\n\n");
}

function escapeAttribute(text) {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
}

// The two clipboard flavours for a payload: { html, text }.
export function clipboardFlavours(doc, payload) {
  lastCopied = payload;
  const text = itemsText(doc, payload);
  const html = `<div ${ATTRIBUTE}="${escapeAttribute(JSON.stringify(payload))}">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
  return { html, text };
}

// Items from clipboard HTML, or null when it isn't a canvas copy.
export function readPayload(html) {
  if (!html || !html.includes(ATTRIBUTE)) return null;
  try {
    const element = new DOMParser().parseFromString(html, "text/html").querySelector(`[${ATTRIBUTE}]`);
    const payload = JSON.parse(element?.getAttribute(ATTRIBUTE) ?? "null");
    return payload?.v === VERSION && Array.isArray(payload.nodes) ? payload : null;
  } catch {
    return null;
  }
}

export function lastCopiedPayload() {
  return lastCopied;
}

/*
 * Adds the payload's items to the board. With `at` (flow position) the
 * items' top-left corner lands there; without, they land one step down
 * and right of where they were copied from. Returns the new top-level ids
 * (the ones that were selected when copied, not group members).
 */
export function pasteItems(doc, payload, { at, snap } = {}) {
  const map = nodesMap(doc);
  const edges = edgesMap(doc);
  const idMap = new Map(payload.nodes.map(({ id }) => [id, crypto.randomUUID()]));
  const left = Math.min(...payload.nodes.map(({ value }) => value.x));
  const top = Math.min(...payload.nodes.map(({ value }) => value.y));
  let dx = GRID * 2;
  let dy = GRID * 2;
  if (at) {
    dx = at.x - left;
    dy = at.y - top;
    if (snap) {
      dx = Math.round((left + dx) / GRID) * GRID - left;
      dy = Math.round((top + dy) / GRID) * GRID - top;
    }
  }
  let z = 0;
  let frameZ = 0;
  map.forEach((value) => {
    if (value.type === "frame") frameZ = Math.max(frameZ, value.z ?? 0);
    else z = Math.max(z, value.z ?? 0);
  });

  transact(doc, () => {
    // Keep the copied stacking order among the pasted items.
    const ordered = [...payload.nodes].sort((a, b) => (a.value.z ?? 0) - (b.value.z ?? 0));
    for (const { id, value, text } of ordered) {
      const copyId = idMap.get(id);
      map.set(copyId, {
        ...value,
        x: Math.round(value.x + dx),
        y: Math.round(value.y + dy),
        z: value.type === "frame" ? ++frameZ : ++z,
        locked: false,
        hidden: false,
        // A member keeps its group only if that group was pasted too.
        group: value.group && idMap.has(value.group) ? idMap.get(value.group) : null,
      });
      decodeInto(doc, copyId, text);
    }
    for (const edge of payload.edges ?? []) {
      if (!idMap.has(edge.source) || !idMap.has(edge.target)) continue;
      edges.set(crypto.randomUUID(), { ...edge, source: idMap.get(edge.source), target: idMap.get(edge.target) });
    }
  });

  const members = new Set(payload.nodes.filter(({ value }) => value.group && idMap.has(value.group)).map(({ id }) => id));
  return payload.nodes.filter(({ id }) => !members.has(id)).map(({ id }) => idMap.get(id));
}

/*
 * Rich text for a new node from plain text: one paragraph per line.
 * Example: "Buy milk\nCall Sam" -> two paragraphs
 */
export function fillText(doc, nodeId, text) {
  const paragraphs = text.split(/\r?\n/).map((line) => {
    const paragraph = new Y.XmlElement("paragraph");
    if (line) paragraph.insert(0, [new Y.XmlText(line)]);
    return paragraph;
  });
  transact(doc, () => doc.getXmlFragment(nodeField(nodeId)).insert(0, paragraphs));
}
