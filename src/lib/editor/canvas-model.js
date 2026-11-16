import { EDGES, fragmentText, nodeField, NODES } from "@/lib/sync/doc-model";

/*
 * Canvas content in the note's Yjs document:
 *
 *   nodes: id -> {
 *     type, x, y, w, h, z,
 *     color?            sticky colour key (STICKY_COLORS)
 *     fill?             background key (FILLS)
 *     border?           { style, width, color }   (BORDER_STYLES, STROKES)
 *     radius?           corner key (RADII)
 *     fontSize?         FONT_SIZES key
 *     textAlign?        left | center | right
 *     group?            id of the frame this node belongs to
 *     locked?, hidden?  layer flags
 *     label?            frame name
 *     src?, path?, name?, size?, mime?   images and files
 *   }
 *   edges: id -> { source, target, sourceHandle?, targetHandle?, line?, arrow?, path?, color?, label? }
 *   node:<id>  rich text of a text / sticky node (Y.XmlFragment)
 *
 * Missing style keys fall back to per-type defaults (NODE_STYLE_DEFAULTS),
 * so boards made before a style existed render sensibly.
 *
 * Every local change goes through `transact` with LOCAL so the undo
 * manager tracks this user's edits only, never a collaborator's.
 */
export const LOCAL = Symbol("canvas-local");

export const GRID = 16;
const GROUP_PADDING = GRID * 2;
// Frames always render behind the other nodes, in their own stack.
const FRAME_Z_OFFSET = -10000;

export const NODE_DEFAULTS = {
  text: { w: 240, h: 80 },
  sticky: { w: 200, h: 200, color: "yellow" },
  frame: { w: 480, h: 320, label: "Group" },
  image: { w: 320, h: 240 },
  file: { w: 260, h: 72 },
};

// ---------------------------------------------------------------------------
// Style vocabulary. Values are keys so colours can adapt to dark mode.
// ---------------------------------------------------------------------------

export const STICKY_COLORS = {
  yellow: { label: "Yellow", swatch: "#fde68a" },
  pink: { label: "Pink", swatch: "#fbcfe8" },
  green: { label: "Green", swatch: "#bbf7d0" },
  blue: { label: "Blue", swatch: "#bfdbfe" },
  purple: { label: "Purple", swatch: "#ddd6fe" },
  gray: { label: "Gray", swatch: "#e7e5e4" },
};

// Line colours for borders and arrows; readable on light and dark boards.
export const STROKES = {
  default: { label: "Default", value: "color-mix(in srgb, var(--foreground) 32%, transparent)" },
  strong: { label: "Ink", value: "var(--foreground)" },
  gray: { label: "Gray", value: "#a8a29e" },
  red: { label: "Red", value: "#ef4444" },
  orange: { label: "Orange", value: "#f97316" },
  green: { label: "Green", value: "#22c55e" },
  blue: { label: "Blue", value: "#3b82f6" },
  purple: { label: "Purple", value: "#a855f7" },
};

export const FILLS = {
  none: { label: "None", value: "transparent" },
  paper: { label: "Paper", value: "var(--background)" },
  gray: { label: "Gray", value: "color-mix(in srgb, #a8a29e 18%, transparent)" },
  red: { label: "Red", value: "color-mix(in srgb, #ef4444 14%, transparent)" },
  orange: { label: "Orange", value: "color-mix(in srgb, #f97316 14%, transparent)" },
  green: { label: "Green", value: "color-mix(in srgb, #22c55e 14%, transparent)" },
  blue: { label: "Blue", value: "color-mix(in srgb, #3b82f6 14%, transparent)" },
  purple: { label: "Purple", value: "color-mix(in srgb, #a855f7 14%, transparent)" },
};

export const BORDER_STYLES = {
  none: { label: "No border", icon: "mdi:border-none-variant" },
  solid: { label: "Solid", icon: "mdi:border-all-variant" },
  dashed: { label: "Dashed", icon: "mdi:border-style" },
  dotted: { label: "Dotted", icon: "mdi:dots-square" },
};

export const BORDER_WIDTHS = [1, 2, 4];

export const RADII = {
  none: { label: "Square", value: 0 },
  sm: { label: "Small", value: 6 },
  lg: { label: "Round", value: 14 },
  full: { label: "Pill", value: 9999 },
};

// "auto" fits the text to the box: resize the box and the text follows.
export const FONT_SIZES = {
  auto: { label: "Auto", value: null },
  s: { label: "S", value: 13 },
  m: { label: "M", value: 16 },
  l: { label: "L", value: 22 },
  xl: { label: "XL", value: 32 },
};

export const TEXT_ALIGNS = {
  left: { label: "Align left", icon: "mdi:format-align-left" },
  center: { label: "Align center", icon: "mdi:format-align-center" },
  right: { label: "Align right", icon: "mdi:format-align-right" },
};

// Text boxes get a visible border by default so arrows clearly land on an edge.
// They have no fill: TextNode shows the paper background only while selected or edited.
const NODE_STYLE_DEFAULTS = {
  text: { border: { style: "solid", width: 1, color: "default" }, radius: "sm", fill: "none", fontSize: "auto", textAlign: "left" },
  sticky: { border: { style: "none", width: 1, color: "default" }, radius: "sm", fontSize: "auto", textAlign: "left" },
  frame: { border: { style: "dashed", width: 2, color: "default" }, radius: "lg", fill: "gray" },
  image: { border: { style: "none", width: 1, color: "default" }, radius: "sm" },
  file: { border: { style: "solid", width: 1, color: "default" }, radius: "lg", fill: "paper" },
};

// Which style controls make sense for each node type.
export const STYLE_CAPABILITIES = {
  text: { border: true, fill: true, radius: true, text: true },
  sticky: { border: true, sticky: true, radius: true, text: true },
  frame: { border: true, fill: true, radius: true },
  image: { border: true, radius: true },
  file: { border: true, fill: true, radius: true },
};

/*
 * Effective style of a node: stored keys over type defaults.
 * Example: text node with { border: { style: "dashed" } } -> dashed, 1 px, default colour
 */
export function resolveStyle(value) {
  const defaults = NODE_STYLE_DEFAULTS[value.type] ?? NODE_STYLE_DEFAULTS.text;
  return {
    border: { ...defaults.border, ...value.border },
    radius: value.radius ?? defaults.radius,
    fill: value.fill ?? defaults.fill ?? "none",
    fontSize: value.fontSize ?? defaults.fontSize ?? "auto",
    textAlign: value.textAlign ?? defaults.textAlign ?? "left",
  };
}

// CSS for the box of a node. Example: { borderStyle: "solid", borderWidth: 1, borderRadius: 6, … }
export function boxStyle(style) {
  return {
    borderStyle: style.border.style === "none" ? "solid" : style.border.style,
    borderWidth: style.border.style === "none" ? 0 : style.border.width,
    borderColor: (STROKES[style.border.color] ?? STROKES.default).value,
    borderRadius: (RADII[style.radius] ?? RADII.sm).value,
    background: (FILLS[style.fill] ?? FILLS.none).value,
  };
}

// With "auto" the size is measured by CanvasText instead (fitTextToBox).
export function textStyle(style) {
  const size = FONT_SIZES[style.fontSize]?.value;
  return {
    ...(size ? { "--canvas-font-size": `${size}px` } : {}),
    textAlign: style.textAlign,
  };
}

// ---------------------------------------------------------------------------
// Yjs access
// ---------------------------------------------------------------------------

export function nodesMap(doc) {
  return doc.getMap(NODES);
}

export function edgesMap(doc) {
  return doc.getMap(EDGES);
}

export function transact(doc, fn) {
  doc.transact(fn, LOCAL);
}

const isFrame = (value) => value?.type === "frame";

// Highest z among frames, or among everything else.
function topZ(doc, frames = false) {
  let z = 0;
  nodesMap(doc).forEach((value) => {
    if (isFrame(value) === frames) z = Math.max(z, value.z ?? 0);
  });
  return z;
}

export function toFlowNode(id, value) {
  const style = resolveStyle(value);
  return {
    id,
    type: value.type,
    position: { x: value.x, y: value.y },
    width: value.w,
    height: value.h,
    zIndex: isFrame(value) ? FRAME_Z_OFFSET + (value.z ?? 0) : (value.z ?? 0),
    hidden: Boolean(value.hidden),
    draggable: !value.locked,
    deletable: !value.locked,
    data: {
      color: value.color,
      src: value.src,
      path: value.path,
      name: value.name,
      size: value.size,
      mime: value.mime,
      label: value.label,
      locked: Boolean(value.locked),
      secret: Boolean(value.secret),
      group: value.group ?? null,
      style,
    },
    ...(isFrame(value) ? { dragHandle: ".frame-handle" } : {}),
  };
}

// ---------------------------------------------------------------------------
// Arrows
// ---------------------------------------------------------------------------

export const EDGE_LINES = {
  solid: { label: "Solid line", icon: "mdi:minus", dash: undefined },
  dashed: { label: "Dashed line", icon: "mdi:dots-horizontal", dash: "6 5" },
  dotted: { label: "Dotted line", icon: "mdi:circle-small", dash: "1.5 4" },
};

export const EDGE_ARROWS = {
  end: { label: "Arrow at end", icon: "mdi:arrow-right" },
  both: { label: "Arrows at both ends", icon: "mdi:arrow-left-right" },
  none: { label: "No arrows", icon: "mdi:minus" },
};

export const EDGE_PATHS = {
  bezier: { label: "Curved", icon: "mdi:vector-curve", type: "default" },
  straight: { label: "Straight", icon: "mdi:vector-line", type: "straight" },
  step: { label: "Elbow", icon: "mdi:vector-polyline", type: "smoothstep" },
};

export function toFlowEdge(id, value) {
  const color = (STROKES[value.color] ?? null)?.value;
  const arrow = value.arrow ?? "end";
  const marker = { type: "arrowclosed", width: 18, height: 18, ...(color ? { color } : {}) };
  return {
    id,
    source: value.source,
    target: value.target,
    sourceHandle: value.sourceHandle ?? null,
    targetHandle: value.targetHandle ?? null,
    type: (EDGE_PATHS[value.path] ?? EDGE_PATHS.bezier).type,
    label: value.label || undefined,
    markerEnd: arrow === "none" ? undefined : marker,
    markerStart: arrow === "both" ? { ...marker, orient: "auto-start-reverse" } : undefined,
    style: {
      ...(color ? { stroke: color } : {}),
      strokeDasharray: (EDGE_LINES[value.line] ?? EDGE_LINES.solid).dash,
    },
    data: { line: value.line ?? "solid", arrow, path: value.path ?? "bezier", color: value.color ?? "default", label: value.label ?? "" },
  };
}

export function updateEdges(doc, ids, patch) {
  const edges = edgesMap(doc);
  transact(doc, () => {
    for (const id of ids) {
      const current = edges.get(id);
      if (current) edges.set(id, { ...current, ...patch });
    }
  });
}

export function addEdge(doc, { source, target, sourceHandle, targetHandle }) {
  if (!source || !target || source === target) return;
  const edges = edgesMap(doc);
  let exists = false;
  edges.forEach((edge) => {
    if (edge.source === source && edge.target === target) exists = true;
  });
  if (exists) return;
  transact(doc, () => {
    edges.set(crypto.randomUUID(), { source, target, sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null });
  });
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export function addNode(doc, type, { x, y, ...extra }) {
  const id = crypto.randomUUID();
  const defaults = NODE_DEFAULTS[type];
  transact(doc, () => {
    nodesMap(doc).set(id, {
      type,
      x: Math.round(x),
      y: Math.round(y),
      w: defaults.w,
      h: defaults.h,
      z: topZ(doc, type === "frame") + 1,
      ...(defaults.color ? { color: defaults.color } : {}),
      ...(defaults.label ? { label: defaults.label } : {}),
      ...extra,
    });
  });
  return id;
}

/*
 * Patches several nodes in one transaction (one undo step).
 * Example: updateNodes(doc, { a: { x: 10 }, b: { x: 10 } })
 */
export function updateNodes(doc, patches) {
  const map = nodesMap(doc);
  transact(doc, () => {
    for (const [id, patch] of Object.entries(patches)) {
      const current = map.get(id);
      if (!current) continue;
      const next = { ...current, ...patch };
      if (Object.keys(patch).some((key) => current[key] !== next[key])) map.set(id, next);
    }
  });
}

// Same patch for many nodes. Example: setNodes(doc, ids, { fontSize: "l" })
export function patchNodes(doc, ids, patch) {
  updateNodes(doc, Object.fromEntries(ids.map((id) => [id, patch])));
}

// Border changes merge into the stored border so one control doesn't reset the others.
export function patchBorder(doc, ids, borderPatch) {
  const map = nodesMap(doc);
  updateNodes(
    doc,
    Object.fromEntries(ids.map((id) => [id, { border: { ...resolveStyle(map.get(id) ?? {}).border, ...borderPatch } }])),
  );
}

export function removeElements(doc, { nodeIds = [], edgeIds = [] }) {
  const nodes = nodesMap(doc);
  const edges = edgesMap(doc);
  const removedNodes = new Set(nodeIds);
  transact(doc, () => {
    nodeIds.forEach((id) => nodes.delete(id));
    edgeIds.forEach((id) => edges.delete(id));
    // Edges never outlive the nodes they connect.
    edges.forEach((edge, id) => {
      if (removedNodes.has(edge.source) || removedNodes.has(edge.target)) edges.delete(id);
    });
    // Members of a deleted group stay on the board, ungrouped.
    nodes.forEach((value, id) => {
      if (value.group && removedNodes.has(value.group)) nodes.set(id, { ...value, group: null });
    });
  });
}

/*
 * Aligns or spreads the selected nodes.
 * mode: left | center | right | top | middle | bottom | spread-x | spread-y
 */
export function alignNodes(doc, ids, mode) {
  const map = nodesMap(doc);
  const items = ids.map((id) => ({ id, ...map.get(id) })).filter((item) => item.type && !item.locked);
  if (items.length < 2) return;
  const left = Math.min(...items.map((n) => n.x));
  const right = Math.max(...items.map((n) => n.x + n.w));
  const top = Math.min(...items.map((n) => n.y));
  const bottom = Math.max(...items.map((n) => n.y + n.h));
  const patches = {};

  if (mode === "spread-x" || mode === "spread-y") {
    const horizontal = mode === "spread-x";
    const sorted = [...items].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    const total = sorted.reduce((sum, n) => sum + (horizontal ? n.w : n.h), 0);
    const span = horizontal ? right - left : bottom - top;
    const gap = (span - total) / (sorted.length - 1);
    let cursor = horizontal ? left : top;
    for (const node of sorted) {
      patches[node.id] = horizontal ? { x: Math.round(cursor) } : { y: Math.round(cursor) };
      cursor += (horizontal ? node.w : node.h) + gap;
    }
  } else {
    for (const node of items) {
      patches[node.id] = {
        left: { x: left },
        center: { x: Math.round((left + right) / 2 - node.w / 2) },
        right: { x: right - node.w },
        top: { y: top },
        middle: { y: Math.round((top + bottom) / 2 - node.h / 2) },
        bottom: { y: bottom - node.h },
      }[mode];
    }
  }
  updateNodes(doc, patches);
}

/*
 * Copies nodes (with their rich text) 2 grid cells down-right, plus the
 * edges between copied nodes. A copied group brings its members along.
 * Returns the new ids.
 */
export function duplicateNodes(doc, ids) {
  const map = nodesMap(doc);
  const edges = edgesMap(doc);
  const all = new Set(ids);
  for (const id of ids) if (isFrame(map.get(id))) membersOf(doc, id).forEach((member) => all.add(member));
  const idMap = new Map([...all].map((id) => [id, crypto.randomUUID()]));
  let z = topZ(doc);
  let frameZ = topZ(doc, true);
  transact(doc, () => {
    for (const [id, copyId] of idMap) {
      const value = map.get(id);
      if (!value) continue;
      map.set(copyId, {
        ...value,
        x: value.x + GRID * 2,
        y: value.y + GRID * 2,
        z: isFrame(value) ? ++frameZ : ++z,
        locked: false,
        group: value.group && idMap.has(value.group) ? idMap.get(value.group) : (value.group ?? null),
      });
      const source = doc.getXmlFragment(nodeField(id));
      if (source.length) doc.getXmlFragment(nodeField(copyId)).insert(0, source.toArray().map((item) => item.clone()));
    }
    edges.forEach((edge) => {
      if (idMap.has(edge.source) && idMap.has(edge.target)) {
        edges.set(crypto.randomUUID(), { ...edge, source: idMap.get(edge.source), target: idMap.get(edge.target) });
      }
    });
  });
  return ids.map((id) => idMap.get(id));
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function membersOf(doc, frameId) {
  const members = [];
  nodesMap(doc).forEach((value, id) => {
    if (value.group === frameId) members.push(id);
  });
  return members;
}

/*
 * Wraps the given nodes in a new group frame sized to fit them.
 * Returns the frame id, or null when nothing can be grouped.
 */
export function groupNodes(doc, ids) {
  const map = nodesMap(doc);
  const items = ids.map((id) => ({ id, ...map.get(id) })).filter((item) => item.type && !isFrame(item));
  if (!items.length) return null;
  const left = Math.min(...items.map((n) => n.x)) - GROUP_PADDING;
  const top = Math.min(...items.map((n) => n.y)) - GROUP_PADDING;
  const right = Math.max(...items.map((n) => n.x + n.w)) + GROUP_PADDING;
  const bottom = Math.max(...items.map((n) => n.y + n.h)) + GROUP_PADDING;
  let count = 0;
  map.forEach((value) => {
    if (isFrame(value)) count += 1;
  });
  const frameId = crypto.randomUUID();
  transact(doc, () => {
    map.set(frameId, {
      type: "frame",
      x: Math.round(left),
      y: Math.round(top),
      w: Math.round(right - left),
      h: Math.round(bottom - top),
      z: topZ(doc, true) + 1,
      label: `Group ${count + 1}`,
    });
    for (const item of items) map.set(item.id, { ...map.get(item.id), group: frameId });
  });
  return frameId;
}

// Removes group frames and keeps their members where they are. Returns the freed member ids.
export function ungroup(doc, frameIds) {
  const map = nodesMap(doc);
  const frames = new Set(frameIds.filter((id) => isFrame(map.get(id))));
  const freed = [];
  transact(doc, () => {
    map.forEach((value, id) => {
      if (value.group && frames.has(value.group)) {
        map.set(id, { ...value, group: null });
        freed.push(id);
      }
    });
    frames.forEach((id) => map.delete(id));
  });
  return freed;
}

/*
 * After a node is dropped: it joins the smallest group whose box holds
 * its centre, or leaves its group when dropped outside every group.
 */
export function regroupByPosition(doc, ids) {
  const map = nodesMap(doc);
  const frames = [];
  map.forEach((value, id) => {
    if (isFrame(value) && !value.hidden) frames.push({ id, ...value });
  });
  frames.sort((a, b) => a.w * a.h - b.w * b.h);
  const patches = {};
  for (const id of ids) {
    const value = map.get(id);
    if (!value || isFrame(value)) continue;
    const cx = value.x + value.w / 2;
    const cy = value.y + value.h / 2;
    const frame = frames.find((f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h);
    const group = frame?.id ?? null;
    if ((value.group ?? null) !== group) patches[id] = { group };
  }
  if (Object.keys(patches).length) updateNodes(doc, patches);
}

/*
 * Position patches for the members of frames that moved, so a group
 * moves as one (mouse drag, arrow keys or align). `moved` maps frame id
 * to its new position; members that move on their own are skipped.
 */
export function memberPatches(doc, moved, alsoMoving) {
  const map = nodesMap(doc);
  const patches = {};
  for (const [frameId, position] of Object.entries(moved)) {
    const frame = map.get(frameId);
    if (!frame) continue;
    const dx = position.x - frame.x;
    const dy = position.y - frame.y;
    if (!dx && !dy) continue;
    for (const memberId of membersOf(doc, frameId)) {
      if (alsoMoving.has(memberId)) continue;
      const member = map.get(memberId);
      patches[memberId] = { x: Math.round(member.x + dx), y: Math.round(member.y + dy) };
    }
  }
  return patches;
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/*
 * Moves nodes in the stacking order. Frames and other nodes have separate
 * stacks (frames always stay behind). z values are renumbered 1..n.
 * direction: front | forward | backward | back
 */
export function reorder(doc, ids, direction) {
  const map = nodesMap(doc);
  const chosen = new Set(ids);
  const patches = {};
  for (const frames of [false, true]) {
    const stack = [];
    map.forEach((value, id) => {
      if (isFrame(value) === frames) stack.push({ id, z: value.z ?? 0 });
    });
    stack.sort((a, b) => a.z - b.z);
    let order = stack.map((item) => item.id);
    if (!order.some((id) => chosen.has(id))) continue;

    if (direction === "front") order = [...order.filter((id) => !chosen.has(id)), ...order.filter((id) => chosen.has(id))];
    else if (direction === "back") order = [...order.filter((id) => chosen.has(id)), ...order.filter((id) => !chosen.has(id))];
    else if (direction === "forward") {
      for (let i = order.length - 2; i >= 0; i -= 1) {
        if (chosen.has(order[i]) && !chosen.has(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]];
      }
    } else if (direction === "backward") {
      for (let i = 1; i < order.length; i += 1) {
        if (chosen.has(order[i]) && !chosen.has(order[i - 1])) [order[i], order[i - 1]] = [order[i - 1], order[i]];
      }
    }
    order.forEach((id, index) => {
      if ((map.get(id).z ?? 0) !== index + 1) patches[id] = { z: index + 1 };
    });
  }
  if (Object.keys(patches).length) updateNodes(doc, patches);
}

const TYPE_NAMES = { text: "Text", sticky: "Sticky note", frame: "Group", image: "Image", file: "File" };

// Name shown in the layers panel. Example: text node "Launch plan\n…" -> "Launch plan"
export function layerName(doc, id, value) {
  if (isFrame(value)) return value.label || "Group";
  if (value.type === "image" || value.type === "file") return value.name || TYPE_NAMES[value.type];
  if (value.secret) return "Hidden text";
  const text = fragmentText(doc.getXmlFragment(nodeField(id)))
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return text ? text.slice(0, 48) : TYPE_NAMES[value.type] ?? "Item";
}

/*
 * Layers panel model, top of the stack first: groups with their members
 * nested, then ungrouped nodes.
 * Example: [{ id: "g1", children: [{ id: "a" }] }, { id: "b", children: [] }]
 */
export function layerTree(doc) {
  const map = nodesMap(doc);
  const items = [];
  map.forEach((value, id) => items.push({ id, value, name: layerName(doc, id, value) }));
  const byZ = (a, b) => (b.value.z ?? 0) - (a.value.z ?? 0);
  const frames = items.filter((item) => isFrame(item.value)).sort(byZ);
  const frameIds = new Set(frames.map((frame) => frame.id));
  const loose = items.filter((item) => !isFrame(item.value) && !frameIds.has(item.value.group)).sort(byZ);
  return [
    ...loose.map((item) => ({ ...item, children: [] })),
    ...frames.map((frame) => ({
      ...frame,
      children: items.filter((item) => item.value.group === frame.id).sort(byZ),
    })),
  ];
}
