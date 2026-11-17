import { EDGES, fragmentText, nodeField, NODES } from "@/lib/sync/doc-model";

/*
 * Canvas content in the note's Yjs document:
 *
 *   nodes: id -> {
 *     type, x, y, w, h, z,
 *     color?            sticky colour key (STICKY_COLORS)
 *     shape?            flowchart shape key (SHAPES), for type "shape"
 *     fill?             background key (FILLS)
 *     border?           { style, width, color }   (BORDER_STYLES, STROKES)
 *     radius?           corner key (RADII)
 *     fontSize?         FONT_SIZES key
 *     fontPx?           text boxes: exact size set by dragging an edge (wins over fontSize)
 *     fontFamily?       FONT_FAMILIES key
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
  // Text boxes start one line tall and grow as you type.
  text: { w: 160, h: 40 },
  sticky: { w: 200, h: 200, color: "yellow" },
  frame: { w: 480, h: 320, label: "Group" },
  shape: { w: 160, h: 80, shape: "process" },
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

// Preset text sizes. Dragging a text box's edge sets an exact size (fontPx) instead.
export const FONT_SIZES = {
  s: { label: "S", value: 13 },
  m: { label: "M", value: 16 },
  l: { label: "L", value: 22 },
  xl: { label: "XL", value: 32 },
};

// System font stacks, so no extra font files load for the canvas.
export const FONT_FAMILIES = {
  sans: { label: "Sans", icon: "mdi:format-font", value: "var(--font-sans)" },
  serif: { label: "Serif", icon: "mdi:format-text-variant-outline", value: 'ui-serif, Georgia, "Times New Roman", serif' },
  mono: { label: "Mono", icon: "mdi:code-tags", value: "var(--font-mono)" },
  hand: {
    label: "Handwritten",
    icon: "mdi:draw",
    value: '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive',
  },
};

export const TEXT_ALIGNS = {
  left: { label: "Align left", icon: "mdi:format-align-left" },
  center: { label: "Align center", icon: "mdi:format-align-center" },
  right: { label: "Align right", icon: "mdi:format-align-right" },
};

// Text boxes have no border or fill by default: TextNode shows paper and a
// thin outline only while the box is selected or being edited.
const NODE_STYLE_DEFAULTS = {
  text: { border: { style: "none", width: 1, color: "default" }, radius: "sm", fill: "none", fontSize: "m", textAlign: "left" },
  sticky: { border: { style: "none", width: 1, color: "default" }, radius: "sm", fontSize: "m", textAlign: "left" },
  frame: { border: { style: "dashed", width: 2, color: "default" }, radius: "lg", fill: "gray" },
  shape: { border: { style: "solid", width: 2, color: "strong" }, radius: "sm", fill: "paper", fontSize: "m", textAlign: "center" },
  image: { border: { style: "none", width: 1, color: "default" }, radius: "sm" },
  file: { border: { style: "solid", width: 1, color: "default" }, radius: "lg", fill: "paper" },
};

// Which style controls make sense for each node type.
export const STYLE_CAPABILITIES = {
  text: { border: true, fill: true, radius: true, text: true },
  sticky: { border: true, sticky: true, radius: true, text: true },
  frame: { border: true, fill: true, radius: true },
  shape: { border: true, fill: true, text: true, shape: true },
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
    // "custom" = a size set by resizing (no preset highlighted). Boards from the
    // short-lived "auto" option fall back to M.
    fontSize: value.fontPx ? "custom" : FONT_SIZES[value.fontSize] ? value.fontSize : (defaults.fontSize ?? "m"),
    fontPx: value.fontPx ?? null,
    fontFamily: FONT_FAMILIES[value.fontFamily] ? value.fontFamily : "sans",
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

// Example: { fontSize: "l" } -> { "--canvas-font-size": "22px" }; { fontPx: 37 } -> "37px"
export function textStyle(style) {
  const size = style.fontPx ?? FONT_SIZES[style.fontSize]?.value ?? FONT_SIZES.m.value;
  return {
    "--canvas-font-size": `${size}px`,
    fontFamily: (FONT_FAMILIES[style.fontFamily] ?? FONT_FAMILIES.sans).value,
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
      shape: value.shape,
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
      ...(defaults.shape ? { shape: defaults.shape } : {}),
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

/*
 * `track: false` leaves the change out of undo (used to tidy away an empty
 * text box whose creation was also dropped from the undo stack).
 */
export function removeElements(doc, { nodeIds = [], edgeIds = [] }, { track = true } = {}) {
  const nodes = nodesMap(doc);
  const edges = edgesMap(doc);
  const removedNodes = new Set(nodeIds);
  const run = track ? (fn) => transact(doc, fn) : (fn) => doc.transact(fn);
  run(() => {
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
  // An aligned group carries its members along, like dragging it does.
  const movedFrames = {};
  for (const node of items) {
    if (isFrame(node) && patches[node.id]) movedFrames[node.id] = { x: node.x, y: node.y, ...patches[node.id] };
  }
  Object.assign(patches, memberPatches(doc, movedFrames, new Set(Object.keys(patches))));
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

const TYPE_NAMES = { text: "Text", sticky: "Sticky note", frame: "Group", image: "Image", file: "File", shape: "Shape" };

// Name shown in the layers panel. Example: text node "Launch plan\n…" -> "Launch plan"
export function layerName(doc, id, value) {
  if (isFrame(value)) return value.label || "Group";
  if (value.type === "image" || value.type === "file") return value.name || TYPE_NAMES[value.type];
  if (value.secret) return "Hidden text";
  const text = fragmentText(doc.getXmlFragment(nodeField(id)))
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (text) return text.slice(0, 48);
  if (value.type === "shape") return SHAPES[value.shape]?.label ?? "Shape";
  return TYPE_NAMES[value.type] ?? "Item";
}

/*
 * Layers panel model, top of the stack first: groups with their members
 * nested, then ungrouped nodes.
 * Example: [{ id: "g1", children: [{ id: "a" }] }, { id: "b", children: [] }]
 */
/*
 * Layers panel drag and drop: put `id` directly above or below `targetId`
 * in the stacking order. Groups and other items have separate stacks, so
 * an item can't be dropped among groups or the other way round.
 * Example: stack [a, b, c] (c on top), moveLayer(a, c, "above") -> [b, c, a]
 */
export function moveLayer(doc, id, targetId, place) {
  const map = nodesMap(doc);
  const moving = map.get(id);
  const target = map.get(targetId);
  if (!moving || !target || id === targetId || isFrame(moving) !== isFrame(target)) return;
  const stack = [];
  map.forEach((value, key) => {
    if (isFrame(value) === isFrame(moving)) stack.push({ id: key, z: value.z ?? 0 });
  });
  const order = stack
    .sort((a, b) => a.z - b.z)
    .map((item) => item.id)
    .filter((key) => key !== id);
  const index = order.indexOf(targetId);
  order.splice(place === "above" ? index + 1 : index, 0, id);
  const patches = {};
  order.forEach((key, position) => {
    if ((map.get(key).z ?? 0) !== position + 1) patches[key] = { z: position + 1 };
  });
  if (Object.keys(patches).length) updateNodes(doc, patches);
}

// Whether two items share a stack (layers drag and drop only works within one).
export function sameStack(doc, a, b) {
  const map = nodesMap(doc);
  return Boolean(map.get(a) && map.get(b)) && isFrame(map.get(a)) === isFrame(map.get(b));
}

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

// ---------------------------------------------------------------------------
// Flowchart shapes
// ---------------------------------------------------------------------------

/*
 * Each shape draws its outline as an SVG path in the node's real pixel size
 * (so curves and corners never stretch) and says how far to keep its text
 * from the edges. `size` is the default box for a new shape.
 * Example: SHAPES.decision.path(140, 100) -> "M70 0L140 50L70 100L0 50Z"
 */
export const SHAPES = {
  process: {
    label: "Process",
    icon: "mdi:rectangle-outline",
    size: { w: 160, h: 80 },
    path: (w, h) => roundedRect(w, h, 4),
    inset: () => ({ x: 10, y: 8 }),
  },
  terminator: {
    label: "Start / end",
    icon: "mdi:pill",
    size: { w: 160, h: 64 },
    path: (w, h) => roundedRect(w, h, h / 2),
    inset: (w, h) => ({ x: Math.min(w / 2, h / 2) * 0.7, y: 6 }),
  },
  decision: {
    label: "Decision",
    icon: "mdi:rhombus-outline",
    size: { w: 160, h: 112 },
    path: (w, h) => `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`,
    inset: (w, h) => ({ x: w * 0.25, y: h * 0.22 }),
  },
  data: {
    label: "Input / output",
    icon: "mdi:rhombus-split-outline",
    size: { w: 176, h: 80 },
    path: (w, h) => {
      const skew = Math.min(w * 0.2, h * 0.5);
      return `M${skew} 0H${w}L${w - skew} ${h}H0Z`;
    },
    inset: (w, h) => ({ x: Math.min(w * 0.2, h * 0.5) + 6, y: 8 }),
  },
  ellipse: {
    label: "Ellipse",
    icon: "mdi:ellipse-outline",
    size: { w: 140, h: 96 },
    path: (w, h) => `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`,
    inset: (w, h) => ({ x: w * 0.15, y: h * 0.15 }),
  },
  database: {
    label: "Database",
    icon: "mdi:database-outline",
    size: { w: 120, h: 112 },
    path: (w, h) => {
      const ry = Math.min(h * 0.12, 18);
      // Body, then the front edge of the lid as a second open stroke.
      return (
        `M0 ${ry}A${w / 2} ${ry} 0 0 1 ${w} ${ry}V${h - ry}A${w / 2} ${ry} 0 0 1 0 ${h - ry}Z` +
        `M0 ${ry}A${w / 2} ${ry} 0 0 0 ${w} ${ry}`
      );
    },
    inset: (w, h) => ({ x: 8, y: Math.min(h * 0.12, 18) * 2 + 4 }),
  },
  document: {
    label: "Document",
    icon: "mdi:file-document-outline",
    size: { w: 160, h: 96 },
    path: (w, h) =>
      `M0 0H${w}V${h * 0.85}C${w * 0.75} ${h * 0.68} ${w * 0.25} ${h * 1.02} 0 ${h * 0.85}Z`,
    inset: (w, h) => ({ x: 10, y: h * 0.08 }),
  },
  preparation: {
    label: "Preparation",
    icon: "mdi:hexagon-outline",
    size: { w: 176, h: 80 },
    path: (w, h) => {
      const cut = Math.min(w * 0.2, h * 0.5);
      return `M${cut} 0H${w - cut}L${w} ${h / 2}L${w - cut} ${h}H${cut}L0 ${h / 2}Z`;
    },
    inset: (w, h) => ({ x: Math.min(w * 0.2, h * 0.5) + 4, y: 8 }),
  },
  triangle: {
    label: "Triangle",
    icon: "mdi:triangle-outline",
    size: { w: 140, h: 120 },
    path: (w, h) => `M${w / 2} 0L${w} ${h}L0 ${h}Z`,
    inset: (w, h) => ({ x: w * 0.25, y: h * 0.45 }),
  },
};

// Example: roundedRect(100, 40, 8) -> rectangle path with 8px corners
function roundedRect(w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

// SVG stroke for a node border. Example: dashed 2px -> { strokeDasharray: "6 4" }
export function shapeStroke(style) {
  const { border } = style;
  if (border.style === "none") return { stroke: "none" };
  const width = border.width;
  return {
    stroke: (STROKES[border.color] ?? STROKES.default).value,
    strokeWidth: width,
    strokeDasharray: border.style === "dashed" ? `${width * 3} ${width * 2}` : border.style === "dotted" ? `0 ${width * 2}` : undefined,
    strokeLinecap: border.style === "dotted" ? "round" : "butt",
    strokeLinejoin: "round",
  };
}

/*
 * Whether a text box has nothing worth keeping: no letters, only spaces
 * and empty lines. Hidden text counts as text.
 * Example: a box with one empty paragraph -> true
 */
export function isEmptyTextBox(doc, id) {
  const value = nodesMap(doc).get(id);
  if (value?.type !== "text") return false;
  return !fragmentText(doc.getXmlFragment(nodeField(id)), { reveal: true }).trim();
}

// ---------------------------------------------------------------------------
// Quick connect: the "+" beside an item adds a connected item on that side.
// ---------------------------------------------------------------------------

const OPPOSITE_SIDE = { top: "bottom", bottom: "top", left: "right", right: "left" };
const NEIGHBOUR_GAP = GRID * 5;
// Style that carries over to the new item, so a flowchart stays consistent.
const NEIGHBOUR_STYLE_KEYS = ["color", "shape", "fill", "border", "radius", "fontSize", "fontFamily", "textAlign"];

function overlaps(a, b, margin = GRID / 2) {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

/*
 * Adds an item of the same kind and style next to `sourceId` on `side`
 * (top | right | bottom | left), joined by an arrow. If that spot is
 * taken, it steps sideways until it finds room. Images and files get a
 * text box. Returns the new item's id.
 * Example: a 160×80 shape at 0,0, side "right" -> a 160×80 shape at 240,0
 */
export function addNeighbour(doc, sourceId, side) {
  const map = nodesMap(doc);
  const source = map.get(sourceId);
  if (!source || !OPPOSITE_SIDE[side]) return null;
  const type = ["text", "sticky", "shape"].includes(source.type) ? source.type : "text";
  const sameKind = type === source.type && type !== "text";
  const w = sameKind ? source.w : NODE_DEFAULTS[type].w;
  const h = sameKind ? source.h : NODE_DEFAULTS[type].h;

  const horizontal = side === "left" || side === "right";
  let box = {
    x: side === "right" ? source.x + source.w + NEIGHBOUR_GAP : side === "left" ? source.x - NEIGHBOUR_GAP - w : source.x + (source.w - w) / 2,
    y: side === "bottom" ? source.y + source.h + NEIGHBOUR_GAP : side === "top" ? source.y - NEIGHBOUR_GAP - h : source.y + (source.h - h) / 2,
    w,
    h,
  };
  const others = [];
  map.forEach((value, id) => {
    if (id !== sourceId && value.type !== "frame" && !value.hidden) others.push(value);
  });
  // Alternate below / above (or right / left) of the straight spot: 1, -1, 2, -2…
  for (let attempt = 1; attempt <= 8 && others.some((other) => overlaps(box, other)); attempt += 1) {
    const step = Math.ceil(attempt / 2) * (attempt % 2 ? 1 : -1);
    const straight = horizontal ? source.y + (source.h - h) / 2 : source.x + (source.w - w) / 2;
    box = horizontal ? { ...box, y: straight + step * (h + GRID * 2) } : { ...box, x: straight + step * (w + GRID * 2) };
  }

  const style = Object.fromEntries(
    NEIGHBOUR_STYLE_KEYS.filter((key) => sameKind && source[key] !== undefined).map((key) => [key, source[key]]),
  );
  const id = addNode(doc, type, { x: box.x, y: box.y, w, h, ...style, group: source.group ?? null });
  addEdge(doc, { source: sourceId, target: id, sourceHandle: side, targetHandle: OPPOSITE_SIDE[side] });
  return id;
}

// ---------------------------------------------------------------------------
// Find on the board
// ---------------------------------------------------------------------------

/*
 * Everything on the board that contains `query`, in reading order:
 * [{ kind: "node" | "edge", id }]. Hidden boxes and hidden text are only
 * searched when `reveal` is on.
 * Example: query "plan" on a sticky "Q3 plan" and an arrow labelled "plan B" -> 2 results
 */
export function findOnBoard(doc, query, { caseSensitive = false, reveal = false } = {}) {
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle) return [];
  const contains = (text) => Boolean(text) && (caseSensitive ? text : text.toLowerCase()).includes(needle);
  const map = nodesMap(doc);
  const results = [];
  map.forEach((value, id) => {
    if (value.hidden || (value.secret && !reveal)) return;
    const texts = [fragmentText(doc.getXmlFragment(nodeField(id)), { reveal }), value.label, value.name];
    if (texts.some(contains)) results.push({ kind: "node", id, x: value.x, y: value.y });
  });
  edgesMap(doc).forEach((edge, id) => {
    if (!contains(edge.label)) return;
    const a = map.get(edge.source);
    const b = map.get(edge.target);
    if (!a || !b) return;
    results.push({ kind: "edge", id, x: (a.x + a.w / 2 + b.x + b.w / 2) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 });
  });
  const ROW = 40;
  return results.sort((a, b) => Math.floor(a.y / ROW) - Math.floor(b.y / ROW) || a.x - b.x);
}
