"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import * as Y from "yjs";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuShortcut, MenuTrigger } from "@/components/ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { isTypingTarget, useHotkeys } from "@/hooks/use-hotkeys";
import { toggleFocusMode } from "@/lib/focus-mode";
import { clipboardFlavours, fillText, lastCopiedPayload, pasteItems, readPayload, serializeItems } from "@/lib/editor/canvas-clipboard";
import { boundsOf, snapToGuides } from "@/lib/editor/canvas-guides";
import {
  addEdge,
  addNeighbour,
  addNode,
  alignNodes,
  duplicateNodes,
  edgesMap,
  GRID,
  groupNodes,
  isEmptyTextBox,
  LOCAL,
  memberPatches,
  membersOf,
  NODE_DEFAULTS,
  nodesMap,
  patchNodes,
  regroupByPosition,
  removeElements,
  reorder,
  SHAPES,
  toFlowEdge,
  toFlowNode,
  ungroup,
  updateNodes,
} from "@/lib/editor/canvas-model";
import { isMac } from "@/lib/format";
import { uploadAttachment } from "@/lib/notes/attachments";
import { cn } from "@/lib/utils";
import { usePointerMenu } from "../pointer-menu";
import { ALIGN_ACTIONS, CanvasContextMenu } from "./canvas-context-menu";
import { CanvasLayers } from "./canvas-layers";
import { CanvasFindBar, GuideLines, searchMarks, useBoardSearch } from "./canvas-find";
import { CanvasContext, NODE_TYPES } from "./canvas-nodes";
import { EdgeStylePanel, NodeStylePanel } from "./canvas-style-panel";

const PREFS_KEY = "qn:canvas-prefs";
const DEFAULT_PREFS = { snap: true, guides: true, minimap: false, layers: false };
// How close (in screen pixels) an edge or centre must come to snap to a guide.
const GUIDE_THRESHOLD_PX = 6;
const IMAGE_URL = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|avif|svg)(\?\S*)?$/i;

function readPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

function viewportKey(noteId) {
  return `qn:canvas-view:${noteId}`;
}

function readViewport(noteId) {
  try {
    return JSON.parse(localStorage.getItem(viewportKey(noteId)) ?? "null");
  } catch {
    return null;
  }
}

/*
 * Canvas mode: free-form boards of text blocks, sticky notes, groups,
 * images and files, connected by arrows. All content lives in the note's
 * Yjs document; React Flow only renders it.
 */
export function CanvasEditor(props) {
  return (
    <ReactFlowProvider>
      <CanvasBoard {...props} />
    </ReactFlowProvider>
  );
}

function CanvasBoard({ noteId, doc, readOnly, ensurePersisted, onError }) {
  const flow = useReactFlow();
  const wrapperRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const nodeMenuRef = useRef(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const [initialViewport] = useState(() => readViewport(noteId));
  const [guides, setGuides] = useState([]);
  const guidesShown = useRef(false);
  const guidesOff = useRef(false);
  const pointer = useRef(null);
  const lastPaste = useRef({ key: null, count: 0 });
  const quickAddRef = useRef(null);
  // The open "+" picker: { rect, id, side } (rect = the button, for anchoring).
  const [quickPick, setQuickPick] = useState(null);
  const [find, setFind] = useState({ open: false, key: 0 });
  const search = useBoardSearch(doc, find.open);

  // ---- Yjs -> React Flow ----------------------------------------------------

  useEffect(() => {
    const yNodes = nodesMap(doc);
    const yEdges = edgesMap(doc);

    // Keep local-only state (selection, measured size, an in-progress drag).
    const syncNodes = () =>
      setNodes((previous) => {
        const byId = new Map(previous.map((node) => [node.id, node]));
        const next = [];
        yNodes.forEach((value, id) => {
          const base = toFlowNode(id, value);
          const old = byId.get(id);
          next.push(
            old
              ? { ...base, selected: old.selected, measured: old.measured, dragging: old.dragging, position: old.dragging ? old.position : base.position }
              : base,
          );
        });
        return next;
      });
    const syncEdges = () =>
      setEdges((previous) => {
        const selected = new Set(previous.filter((edge) => edge.selected).map((edge) => edge.id));
        const next = [];
        yEdges.forEach((value, id) => next.push({ ...toFlowEdge(id, value), selected: selected.has(id) }));
        return next;
      });

    syncNodes();
    syncEdges();
    yNodes.observe(syncNodes);
    yEdges.observe(syncEdges);
    return () => {
      yNodes.unobserve(syncNodes);
      yEdges.unobserve(syncEdges);
    };
  }, [doc]);

  const undoManager = useCanvasUndo(doc);

  /*
   * Text boxes only exist once they have text. A box left empty when
   * editing ends is removed (with its arrows). If it was just created and
   * nothing else happened since, its "created" undo step goes too, so
   * undo never brings back an empty box.
   * `freshBoxes`: id -> the undo step that created it.
   */
  const freshBoxes = useRef(new Map());
  const previousEditing = useRef(null);

  function noteFresh(id) {
    const value = nodesMap(doc).get(id);
    if (value?.type === "text") freshBoxes.current.set(id, undoManager.lastStep());
  }

  const tidyEmptyBox = useEffectEvent((id) => {
    const step = freshBoxes.current.get(id);
    freshBoxes.current.delete(id);
    if (readOnly || !isEmptyTextBox(doc, id)) return;
    const dropped = step && undoManager.dropLastStep(step);
    removeElements(doc, { nodeIds: [id] }, { track: !dropped });
  });

  useEffect(() => {
    const previous = previousEditing.current;
    previousEditing.current = editingId;
    if (previous && previous !== editingId) tidyEmptyBox(previous);
  }, [editingId]);

  // ---- React Flow -> Yjs ----------------------------------------------------

  /*
   * While dragging, nudge the moving items onto nearby edges and centres
   * and show guide lines (Alt while dragging turns this off). The drop
   * gets the same nudge, so the items stay where the guides showed them.
   */
  function applyGuides(changes) {
    const moves = changes.filter((change) => change.type === "position" && change.position && change.dragging !== undefined);
    if (!moves.length) return changes;
    const dragging = moves.some((change) => change.dragging);
    if (!prefs.guides || guidesOff.current || (!dragging && !guidesShown.current)) {
      if (guidesShown.current) {
        guidesShown.current = false;
        setGuides([]);
      }
      return changes;
    }
    const map = nodesMap(doc);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const exclude = new Set(moves.map((change) => change.id));
    for (const change of moves) {
      if (map.get(change.id)?.type === "frame") membersOf(doc, change.id).forEach((member) => exclude.add(member));
    }
    const size = (node) => ({ w: node?.measured?.width ?? node?.width ?? 0, h: node?.measured?.height ?? node?.height ?? 0 });
    const moving = boundsOf(moves.map((change) => ({ ...change.position, ...size(byId.get(change.id)) })));
    const others = nodes
      .filter((node) => !exclude.has(node.id) && !node.hidden)
      .map((node) => ({ ...node.position, ...size(node) }));
    const result = snapToGuides(moving, others, GUIDE_THRESHOLD_PX / flow.getZoom());
    guidesShown.current = dragging && result.guides.length > 0;
    setGuides(dragging ? result.guides : []);
    if (!result.dx && !result.dy) return changes;
    const ids = new Set(moves.map((change) => change.id));
    return changes.map((change) =>
      ids.has(change.id) && change.type === "position" && change.position
        ? { ...change, position: { x: change.position.x + result.dx, y: change.position.y + result.dy } }
        : change,
    );
  }

  function handleNodesChange(rawChanges) {
    const changes = readOnly ? rawChanges : applyGuides(rawChanges);
    setNodes((current) => applyNodeChanges(changes, current));
    if (readOnly) return;
    const patches = {};
    const removed = [];
    const yNodes = nodesMap(doc);
    const movedFrames = {};
    const moving = new Set(changes.filter((change) => change.type === "position" && change.position).map((change) => change.id));
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        const position = { x: Math.round(change.position.x), y: Math.round(change.position.y) };
        patches[change.id] = { ...patches[change.id], ...position };
        // A group carries its members along (drag, arrow keys, align).
        if (yNodes.get(change.id)?.type === "frame") movedFrames[change.id] = position;
      } else if (change.type === "dimensions" && change.setAttributes && change.dimensions) {
        patches[change.id] = {
          ...patches[change.id],
          w: Math.round(change.dimensions.width),
          h: Math.round(change.dimensions.height),
        };
      } else if (change.type === "remove") {
        removed.push(change.id);
      }
    }
    Object.assign(patches, memberPatches(doc, movedFrames, moving));
    if (Object.keys(patches).length) updateNodes(doc, patches);
    if (removed.length) removeElements(doc, { nodeIds: removed });
  }

  function handleEdgesChange(changes) {
    setEdges((current) => applyEdgeChanges(changes, current));
    if (readOnly) return;
    const removed = changes.filter((change) => change.type === "remove").map((change) => change.id);
    if (removed.length) removeElements(doc, { edgeIds: removed });
  }

  // ---- creating ---------------------------------------------------------------

  function centerOfView(type) {
    const rect = wrapperRef.current.getBoundingClientRect();
    const center = flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const { w, h } = NODE_DEFAULTS[type];
    // Nudge so repeated clicks don't stack nodes exactly on top of each other.
    const jitter = (nodes.length % 5) * GRID;
    return { x: center.x - w / 2 + jitter, y: center.y - h / 2 + jitter };
  }

  function create(type, position = centerOfView(type), extra = {}) {
    if (readOnly) return null;
    // Its own undo step, so an untouched text box can take it away again.
    undoManager.stopCapturing();
    const id = addNode(doc, type, { ...snapPoint(position, prefs.snap), ...extra });
    noteFresh(id);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })));
    if (type === "text" || type === "sticky" || type === "shape") setEditingId(id);
    return id;
  }

  async function addFiles(files, position) {
    let offset = 0;
    for (const file of files) {
      try {
        const stored = await uploadAttachment(noteId, file, { ensurePersisted });
        const at = { x: position.x + offset, y: position.y + offset };
        if (file.type.startsWith("image/")) {
          const size = await imageSize(file);
          create("image", at, { src: stored.url, name: stored.name, path: stored.path, ...size });
        } else {
          create("file", at, { name: stored.name, size: stored.size, mime: stored.mime, path: stored.path });
        }
        offset += GRID * 2;
      } catch (error) {
        onError?.({ title: `Couldn't upload ${file.name}`, description: error.message });
      }
    }
  }

  function pickFiles(position = centerOfView("image")) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => input.files?.length && addFiles([...input.files], position);
    input.click();
  }

  // ---- selection --------------------------------------------------------------

  const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id);
  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  const dragging = nodes.some((node) => node.dragging);

  function select(ids) {
    const chosen = new Set(ids);
    setNodes((current) => current.map((node) => ({ ...node, selected: chosen.has(node.id) })));
    setEdges((current) => current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)));
  }

  function deleteSelection() {
    removeElements(doc, {
      nodeIds: selectedNodes.filter((node) => !node.data.locked).map((node) => node.id),
      edgeIds: selectedEdges.map((edge) => edge.id),
    });
  }

  function duplicateSelection() {
    select(duplicateNodes(doc, selectedIds));
  }

  function groupSelection() {
    const frameId = groupNodes(doc, selectedIds);
    if (frameId) select([frameId]);
  }

  function ungroupSelection() {
    const frames = selectedNodes.filter((node) => node.type === "frame").map((node) => node.id);
    if (frames.length) select(ungroup(doc, frames));
  }

  function toggleLock() {
    const lock = !selectedNodes.every((node) => node.data.locked);
    patchNodes(doc, selectedIds, { locked: lock });
  }

  // ---- copy & paste -----------------------------------------------------------

  // Where pasted items go: under the pointer when it's over the board.
  function pastePoint() {
    return pointer.current ? flow.screenToFlowPosition(pointer.current) : null;
  }

  function copyPayload() {
    const payload = selectedIds.length ? serializeItems(doc, selectedIds) : null;
    return payload ? clipboardFlavours(doc, payload) : null;
  }

  // Menu copy: the async clipboard API (keyboard copy uses the copy event below).
  async function copySelection() {
    const flavours = copyPayload();
    if (!flavours) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([flavours.html], { type: "text/html" }),
          "text/plain": new Blob([flavours.text], { type: "text/plain" }),
        }),
      ]);
    } catch {
      // Same-tab paste still works from the in-memory copy.
    }
  }

  async function cutSelection() {
    await copySelection();
    deleteSelection();
  }

  async function pasteAt(point) {
    let payload = null;
    let text = "";
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes("text/html")) payload = readPayload(await (await item.getType("text/html")).text());
        if (!payload && item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
      }
    } catch {
      payload = lastCopiedPayload();
    }
    pasteContent({ payload, text, files: [] }, point ?? pastePoint());
  }

  /*
   * Board items paste as copies; files upload; an image link becomes an
   * image; other text becomes a text box.
   */
  function pasteContent({ payload, text, files }, point) {
    if (readOnly) return false;
    if (files.length) {
      addFiles(files, point ?? centerOfView("image"));
      return true;
    }
    if (payload) {
      let at = point;
      if (!at) {
        // Pasting again without moving the pointer steps each copy further down.
        const key = payload.nodes.map((item) => item.id).join();
        const count = lastPaste.current.key === key ? lastPaste.current.count + 1 : 1;
        lastPaste.current = { key, count };
        const left = Math.min(...payload.nodes.map((item) => item.value.x));
        const top = Math.min(...payload.nodes.map((item) => item.value.y));
        at = { x: left + GRID * 2 * count, y: top + GRID * 2 * count };
      }
      const ids = pasteItems(doc, payload, { at, snap: prefs.snap });
      regroupByPosition(doc, ids);
      select(ids);
      return true;
    }
    const trimmed = text.trim();
    if (!trimmed) return false;
    const at = snapPoint(point ?? centerOfView("text"), prefs.snap);
    if (IMAGE_URL.test(trimmed)) {
      const name = decodeURIComponent(new URL(trimmed).pathname.split("/").pop() || "Image");
      select([addNode(doc, "image", { ...at, src: trimmed, name })]);
      return true;
    }
    const lines = trimmed.split(/\r?\n/);
    const longest = Math.max(...lines.map((line) => line.length));
    const id = addNode(doc, "text", {
      ...at,
      w: Math.min(480, Math.max(NODE_DEFAULTS.text.w, longest * 8 + 32)),
      h: Math.max(NODE_DEFAULTS.text.h, lines.length * 24 + 16),
    });
    fillText(doc, id, trimmed);
    select([id]);
    return true;
  }

  // Keyboard copy / cut / paste, unless someone is typing or selected page text.
  const onClipboard = useEffectEvent((event) => {
    if (isTypingTarget(event.target) || isTypingTarget(document.activeElement) || editingId) return;
    if (event.type !== "paste" && !window.getSelection()?.isCollapsed) return;
    if (event.type === "paste") {
      const data = event.clipboardData;
      const handled = pasteContent(
        { payload: readPayload(data?.getData("text/html")), text: data?.getData("text/plain") ?? "", files: [...(data?.files ?? [])] },
        pastePoint(),
      );
      if (handled) event.preventDefault();
      return;
    }
    const flavours = copyPayload();
    if (!flavours) return;
    event.clipboardData.setData("text/html", flavours.html);
    event.clipboardData.setData("text/plain", flavours.text);
    event.preventDefault();
    if (event.type === "cut" && !readOnly) deleteSelection();
  });

  useEffect(() => {
    const listener = (event) => onClipboard(event);
    const types = ["copy", "cut", "paste"];
    types.forEach((type) => document.addEventListener(type, listener));
    return () => types.forEach((type) => document.removeEventListener(type, listener));
  }, []);

  // ---- quick connect -------------------------------------------------------------

  // What the "+" picker offers: { type, shape? }, or null for "Same as this".
  function quickAdd(sourceId, side, choice = null) {
    if (readOnly) return;
    undoManager.stopCapturing();
    const id = addNeighbour(doc, sourceId, side, choice);
    if (!id) return;
    regroupByPosition(doc, [id]);
    noteFresh(id);
    select([id]);
    const type = nodesMap(doc).get(id)?.type;
    if (type === "text" || type === "sticky" || type === "shape") setEditingId(id);
  }

  useEffect(() => {
    quickAddRef.current = quickAdd;
  });

  // ---- find --------------------------------------------------------------------

  function closeFind(result) {
    setFind((current) => ({ ...current, open: false }));
    if (result?.kind === "node") select([result.id]);
  }

  const { results: searchResults, current: searchCurrent } = search;
  const marks = useMemo(
    () => searchMarks({ results: searchResults, current: searchCurrent }),
    [searchResults, searchCurrent],
  );
  const flowNodes = useMemo(
    () =>
      marks.nodes.size
        ? nodes.map((node) =>
            marks.nodes.has(node.id) ? { ...node, className: cn("canvas-search-hit", marks.nodes.get(node.id) && "is-current") } : node,
          )
        : nodes,
    [nodes, marks],
  );
  const flowEdges = marks.edges.size
    ? edges.map((edge) =>
        marks.edges.has(edge.id) ? { ...edge, className: cn("canvas-search-hit", marks.edges.get(edge.id) && "is-current") } : edge,
      )
    : edges;

  // Layers panel: select an item and bring it into view if it is off screen.
  function revealNode(id, { add } = {}) {
    const value = nodesMap(doc).get(id);
    if (!value) return;
    if (add) setNodes((current) => current.map((node) => (node.id === id ? { ...node, selected: !node.selected } : node)));
    else select([id]);
    const rect = wrapperRef.current.getBoundingClientRect();
    const topLeft = flow.screenToFlowPosition({ x: rect.left, y: rect.top });
    const bottomRight = flow.screenToFlowPosition({ x: rect.right, y: rect.bottom });
    const visible =
      value.x >= topLeft.x && value.y >= topLeft.y && value.x + value.w <= bottomRight.x && value.y + value.h <= bottomRight.y;
    if (!visible) flow.setCenter(value.x + value.w / 2, value.y + value.h / 2, { zoom: flow.getZoom(), duration: 250 });
  }

  useHotkeys([
    { combo: "mod+z", handler: () => !readOnly && undoManager.undo() },
    { combo: "mod+shift+z", handler: () => !readOnly && undoManager.redo() },
    { combo: "mod+y", handler: () => !readOnly && undoManager.redo() },
    { combo: "mod+d", handler: () => !readOnly && selectedIds.length && duplicateSelection() },
    { combo: "mod+g", handler: () => !readOnly && selectedIds.length && groupSelection() },
    { combo: "mod+shift+g", handler: () => !readOnly && ungroupSelection() },
    { combo: "mod+]", handler: () => !readOnly && reorder(doc, selectedIds, "forward") },
    { combo: "mod+[", handler: () => !readOnly && reorder(doc, selectedIds, "backward") },
    { combo: "mod+shift+}", handler: () => !readOnly && reorder(doc, selectedIds, "front") },
    { combo: "mod+shift+{", handler: () => !readOnly && reorder(doc, selectedIds, "back") },
    { combo: "mod+shift+l", handler: () => !readOnly && selectedIds.length && toggleLock() },
    { combo: "mod+f", allowInInputs: true, handler: () => setFind((current) => ({ open: true, key: current.key + 1 })) },
    { combo: "t", handler: () => create("text") },
    { combo: "s", handler: () => create("sticky") },
    { combo: "g", handler: () => create("frame") },
    { combo: "r", handler: () => addShape("process") },
    { combo: "d", handler: () => addShape("decision") },
    {
      combo: "enter",
      handler: () => {
        const node = selectedNodes.length === 1 ? selectedNodes[0] : null;
        if (node && ["text", "sticky", "shape"].includes(node.type) && !readOnly) setEditingId(node.id);
      },
    },
  ]);

  // ---- right-click menu --------------------------------------------------------

  const contextMenu = usePointerMenu();

  // A node's "⋯" button (groups): select it, then its menu opens at the button.
  useEffect(() => {
    nodeMenuRef.current = (event, id) => {
      setEditingId(null);
      if (!nodes.find((node) => node.id === id)?.selected) select([id]);
      contextMenu.openAt(event, { kind: "nodes" });
    };
  });

  // Shift + right-click, or right-clicking text being typed, keeps the browser menu.
  function openContextMenu(event, target) {
    if (event.shiftKey) return;
    contextMenu.openAt(event, target);
  }

  const board = {
    prefs,
    setPref,
    empty: !nodes.length,
    canUndo: undoManager.canUndo(),
    canRedo: undoManager.canRedo(),
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
    // Same offset as double-click, so the new box sits under the pointer.
    addAt: (type, point) => create(type, point ? { x: point.x - 20, y: point.y - 20 } : undefined),
    addShape,
    pickFiles: (point) => pickFiles(point),
    editNode: (id) => setEditingId(id),
    renameGroup: (id) => setRenamingId(id),
    getEditor: (id) => editors.get(id) ?? null,
    nodeById: (id) => nodes.find((node) => node.id === id) ?? null,
    onError,
    selectAll: () => select(nodes.filter((node) => !node.hidden).map((node) => node.id)),
    fitView: () => flow.fitView({ padding: 0.2, duration: 200, maxZoom: 1 }),
    resetZoom: () => flow.zoomTo(1, { duration: 150 }),
    deleteSelection,
    duplicateSelection,
    copySelection,
    cutSelection,
    pasteAt,
    groupSelection,
    ungroupSelection,
    toggleLock,
  };

  // Example: addShape("decision") -> a 160×112 diamond in the middle of the view
  function addShape(shape, point) {
    const { w, h } = SHAPES[shape].size;
    const at = point ? { x: point.x - w / 2, y: point.y - h / 2 } : centerOfView("shape");
    return create("shape", at, { shape, w, h });
  }

  function setPref(key, value) {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // Text box editors by node id, so the right-click menu can format them.
  const [editors] = useState(() => new Map());
  const context = useMemo(
    () => ({
      doc,
      editingId,
      setEditingId,
      readOnly,
      registerEditor: (id, editor) => {
        editors.set(id, editor);
        return () => editors.get(id) === editor && editors.delete(id);
      },
      // "+" beside an item: open the picker anchored to that button.
      openQuickAdd: (button, id, side) =>
        setQuickPick({ rect: button.getBoundingClientRect(), id, side }),
      renamingId,
      setRenamingId,
      // A node's own "⋯" button: select it and open its right-click menu there.
      openNodeMenu: (event, id) => nodeMenuRef.current?.(event, id),
    }),
    [doc, editingId, readOnly, editors, renamingId],
  );

  return (
    <CanvasContext value={context}>
      <div
        className="canvas-board relative h-full w-full"
        onDoubleClick={(event) => {
          // Nodes live inside the pane element, so exclude them explicitly.
          const target = event.target;
          if (readOnly || !target.closest?.(".react-flow__pane") || target.closest(".react-flow__node, .react-flow__edge")) return;
          const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          create("text", { x: position.x - 20, y: position.y - 20 });
        }}
        onDragOver={(event) => {
          if (!readOnly && event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onPointerLeave={() => {
          pointer.current = null;
        }}
        onPointerMove={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY };
        }}
        onDrop={(event) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (readOnly || !files.length) return;
          event.preventDefault();
          addFiles(files, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        }}
        ref={wrapperRef}
      >
        <ReactFlow
          connectionMode={ConnectionMode.Loose}
          defaultViewport={initialViewport ?? undefined}
          deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
          edges={flowEdges}
          edgesFocusable={!readOnly}
          elementsSelectable
          // Stacking comes from Arrange / Layers only. React Flow would otherwise lift a
          // selected item to the top, so "Send backward" looked like it did nothing.
          elevateNodesOnSelect={false}
          fitView={!initialViewport}
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          maxZoom={4}
          minZoom={0.1}
          multiSelectionKeyCode={["Shift", "Meta", "Control"]}
          nodeTypes={NODE_TYPES}
          nodes={flowNodes}
          nodesConnectable={!readOnly}
          nodesDraggable={!readOnly}
          onConnect={(connection) => addEdge(doc, connection)}
          onEdgeContextMenu={(event, edge) => {
            if (!edge.selected) {
              setNodes((current) => current.map((node) => (node.selected ? { ...node, selected: false } : node)));
              setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id })));
            }
            openContextMenu(event, { kind: "edge" });
          }}
          onEdgesChange={handleEdgesChange}
          onMoveEnd={(_event, viewport) => {
            try {
              localStorage.setItem(viewportKey(noteId), JSON.stringify(viewport));
            } catch {}
          }}
          onNodeContextMenu={(event, node) => {
            if (node.id === editingId) {
              // Typing in a text box: text and box options for the selection there.
              if (node.type === "text" || node.type === "shape") {
                openContextMenu(event, { kind: "text-edit", nodeId: node.id });
              }
              return;
            }
            // Right-clicking outside the selection selects that box, like a desktop app.
            if (!node.selected) select([node.id]);
            openContextMenu(event, { kind: "nodes" });
          }}
          onPaneContextMenu={(event) => {
            setEditingId(null);
            openContextMenu(event, { kind: "pane", point: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
          }}
          onSelectionContextMenu={(event) => openContextMenu(event, { kind: "nodes" })}
          onNodeClick={(_event, node) => {
            if (node.id !== editingId) setEditingId(null);
          }}
          onNodeDrag={(event) => {
            guidesOff.current = event.altKey;
          }}
          onNodeDragStart={(event, node) => {
            guidesOff.current = event.altKey;
            if (node.id !== editingId) setEditingId(null);
          }}
          // Dropping a box into or out of a group updates its membership.
          onNodeDragStop={(_event, _node, dragged) => {
            guidesShown.current = false;
            setGuides([]);
            if (!readOnly) regroupByPosition(doc, dragged.map((item) => item.id));
          }}
          onNodesChange={handleNodesChange}
          // Edit mode ends on explicit actions only. React Flow's selection-change
          // event lags a render behind and would cancel editing a block just created.
          onPaneClick={() => setEditingId(null)}
          panOnScroll
          proOptions={{ hideAttribution: true }}
          selectionOnDrag={false}
          snapGrid={[GRID, GRID]}
          snapToGrid={prefs.snap}
          zoomOnDoubleClick={false}
        >
          <Background gap={GRID * 2} size={1.5} variant={BackgroundVariant.Dots} />
          <GuideLines guides={guides} />
          {/* The layers panel (w-64 at right-3) takes the bottom-right corner; sit beside it. */}
          {prefs.minimap && (
            <MiniMap className="max-md:hidden!" pannable style={prefs.layers ? { right: "17rem" } : undefined} zoomable />
          )}
          {!readOnly && (
            <SelectionToolbar
              doc={doc}
              dragging={dragging}
              editingId={editingId}
              onDelete={deleteSelection}
              onDuplicate={duplicateSelection}
              onGroup={groupSelection}
              onToggleLock={toggleLock}
              onUngroup={ungroupSelection}
              selectedIds={selectedIds}
              selectedNodes={selectedNodes}
            />
          )}
        </ReactFlow>

        {!readOnly && selectedEdges.length > 0 && !selectedNodes.length && (
          <div className="absolute inset-x-0 bottom-18 z-10 flex justify-center px-3 md:bottom-20">
            <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border bg-popover p-1.5 shadow-lg/5">
              <EdgeStylePanel doc={doc} edges={selectedEdges} />
              <Divider />
              <ToolButton danger label="Delete arrow (Backspace)" onClick={deleteSelection}>
                <Icon icon="mdi:delete-outline" />
              </ToolButton>
            </div>
          </div>
        )}

        {find.open && (
          <div className="absolute top-3 right-3 z-20">
            <CanvasFindBar doc={doc} focusKey={find.key} onClose={closeFind} search={search} />
          </div>
        )}

        {prefs.layers && (
          <CanvasLayers
            doc={doc}
            onClose={() => setPref("layers", false)}
            onSelect={revealNode}
            readOnly={readOnly}
            selectedIds={selectedIds}
          />
        )}

        <QuickAddMenu
          onClose={() => setQuickPick(null)}
          onPick={(choice) => quickAddRef.current?.(quickPick.id, quickPick.side, choice)}
          pick={quickPick}
          source={quickPick ? nodesMap(doc).get(quickPick.id) : null}
        />

        <CanvasContextMenu
          board={board}
          doc={doc}
          menu={contextMenu.menu}
          onClose={contextMenu.close}
          readOnly={readOnly}
          selection={{ ids: selectedIds, nodes: selectedNodes }}
        />

        <CanvasToolbar
          canRedo={undoManager.canRedo()}
          canUndo={undoManager.canUndo()}
          empty={!nodes.length}
          findOpen={find.open}
          onAdd={create}
          onFind={() => (find.open ? closeFind() : setFind((current) => ({ open: true, key: current.key + 1 })))}
          onAddShape={addShape}
          onPickFiles={() => pickFiles()}
          onRedo={() => undoManager.redo()}
          onUndo={() => undoManager.undo()}
          prefs={prefs}
          readOnly={readOnly}
          setPref={setPref}
        />
      </div>
    </CanvasContext>
  );
}

/*
 * Undo/redo over this user's canvas edits only (text keeps its own history).
 * Created once per board (its doc never changes) and never destroyed here:
 * React's development double mount would otherwise kill it, leaving undo
 * dead. It goes away with the note's Y.Doc.
 */
function useCanvasUndo(doc) {
  const [manager] = useState(
    () => new Y.UndoManager([nodesMap(doc), edgesMap(doc)], { trackedOrigins: new Set([LOCAL]) }),
  );
  const [, setVersion] = useState(0);

  // Re-render so the toolbar's undo / redo buttons enable and disable.
  useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    const events = ["stack-item-added", "stack-item-popped", "stack-cleared"];
    events.forEach((name) => manager.on(name, bump));
    return () => events.forEach((name) => manager.off(name, bump));
  }, [manager]);

  return {
    undo: () => manager.undo(),
    redo: () => manager.redo(),
    canUndo: () => manager.canUndo(),
    canRedo: () => manager.canRedo(),
    // Start a new undo step with the next change (don't merge into the last one).
    stopCapturing: () => manager.stopCapturing(),
    lastStep: () => manager.undoStack.at(-1) ?? null,
    // Forget `step` if it is still the latest; true when it was dropped.
    dropLastStep: (step) => {
      if (manager.undoStack.at(-1) !== step) return false;
      manager.undoStack.pop();
      setVersion((value) => value + 1);
      return true;
    },
  };
}

function snapPoint({ x, y }, snap) {
  if (!snap) return { x, y };
  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID };
}

// Natural image size, scaled to fit within 480 px. Example: 1600×900 -> { w: 480, h: 270 }
function imageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
      URL.revokeObjectURL(url);
      resolve({ w: Math.round(image.naturalWidth * ratio) || 320, h: Math.round(image.naturalHeight * ratio) || 240 });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(NODE_DEFAULTS.image);
    };
    image.src = url;
  });
}

// ---------------------------------------------------------------------------

const PICK_SIDES = { top: "top", bottom: "bottom", left: "left", right: "right" };

/*
 * The "+" picker: what to add on that side of an item, as a compact grid
 * of icons (names show as tooltips and to screen readers). Top row: the
 * same as this item, a text box, a sticky note; below: the flowchart
 * shapes. Opens next to the "+" that was clicked.
 */
function QuickAddMenu({ pick, source, onPick, onClose }) {
  const anchor = useMemo(
    () => (pick ? { getBoundingClientRect: () => pick.rect } : null),
    [pick],
  );
  const sameLabel =
    source?.type === "shape"
      ? `Same shape (${(SHAPES[source.shape] ?? SHAPES.process).label})`
      : source?.type === "sticky"
        ? "Same: sticky note"
        : "Same: text";
  const basics = [
    { label: sameLabel, icon: "mdi:content-duplicate", choice: null },
    { label: "Text", icon: "mdi:format-text", choice: { type: "text" } },
    { label: "Sticky note", icon: "mdi:note-outline", choice: { type: "sticky" } },
  ];
  const shapes = Object.entries(SHAPES).map(([key, shape]) => ({
    label: shape.label,
    icon: shape.icon,
    choice: { type: "shape", shape: key },
  }));

  return (
    <Menu modal={false} onOpenChange={(open) => !open && onClose()} open={Boolean(pick)}>
      {pick && (
        <MenuPopup align="center" anchor={anchor} aria-label="Add a connected item" side={PICK_SIDES[pick.side] ?? "bottom"} sideOffset={6}>
          <div className="grid grid-cols-3 gap-0.5">
            {basics.map((item) => (
              <PickIcon item={item} key={item.label} onPick={onPick} />
            ))}
          </div>
          <MenuSeparator />
          <div className="grid grid-cols-3 gap-0.5">
            {shapes.map((item) => (
              <PickIcon item={item} key={item.label} onPick={onPick} />
            ))}
          </div>
        </MenuPopup>
      )}
    </Menu>
  );
}

function PickIcon({ item, onPick }) {
  return (
    <MenuItem
      aria-label={item.label}
      className="size-9 min-h-0 justify-center p-0 sm:size-8 sm:min-h-0 [&>svg]:mx-0"
      onClick={() => onPick(item.choice)}
      title={item.label}
    >
      <Icon className="size-5" icon={item.icon} />
    </MenuItem>
  );
}

const TOOLS = [
  { type: "text", label: "Text", icon: "mdi:format-text", key: "T" },
  { type: "sticky", label: "Sticky note", icon: "mdi:note-outline", key: "S" },
  { type: "frame", label: "Group", icon: "mdi:group", key: "G" },
];

function CanvasToolbar({ onAdd, onAddShape, onPickFiles, onUndo, onRedo, canUndo, canRedo, prefs, setPref, readOnly, empty, findOpen, onFind }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const focus = useFocusMode();

  return (
    <>
      {empty && !readOnly && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">
            Double-click anywhere to write, or add a sticky note from the toolbar. Drop images to pin them.
          </p>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-3 md:bottom-4">
        <div
          aria-label="Canvas tools"
          className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border bg-popover/92 p-1 shadow-lg/5 backdrop-blur"
          role="toolbar"
        >
          {!readOnly && (
            <>
              {TOOLS.map((tool) => (
                <ToolButton key={tool.type} label={`${tool.label} (${tool.key})`} onClick={() => onAdd(tool.type)}>
                  <Icon icon={tool.icon} />
                </ToolButton>
              ))}
              <Menu>
                <MenuTrigger render={<ToolButton label="Shapes (R, D)" />}>
                  <Icon icon="mdi:shape-plus-outline" />
                </MenuTrigger>
                <MenuPopup align="center" side="top">
                  {Object.entries(SHAPES).map(([key, shape]) => (
                    <MenuItem key={key} onClick={() => onAddShape(key)}>
                      <Icon icon={shape.icon} />
                      {shape.label}
                      {key === "process" && <MenuShortcut>R</MenuShortcut>}
                      {key === "decision" && <MenuShortcut>D</MenuShortcut>}
                    </MenuItem>
                  ))}
                </MenuPopup>
              </Menu>
              <ToolButton label="Image or file" onClick={onPickFiles}>
                <Icon icon="mdi:image-plus-outline" />
              </ToolButton>
              <Divider />
              <ToolButton disabled={!canUndo} label="Undo (Ctrl Z)" onClick={onUndo}>
                <Icon icon="mdi:undo" />
              </ToolButton>
              <ToolButton disabled={!canRedo} label="Redo (Ctrl Shift Z)" onClick={onRedo}>
                <Icon icon="mdi:redo" />
              </ToolButton>
              <Divider />
            </>
          )}
          <ToolButton label="Zoom out" onClick={() => flow.zoomOut({ duration: 150 })}>
            <Icon icon="mdi:minus" />
          </ToolButton>
          <button
            className="h-8 min-w-12 rounded-md px-1 text-xs tabular-nums hover:bg-accent"
            onClick={() => flow.zoomTo(1, { duration: 150 })}
            title="Reset to 100%"
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolButton label="Zoom in" onClick={() => flow.zoomIn({ duration: 150 })}>
            <Icon icon="mdi:plus" />
          </ToolButton>
          <ToolButton label="Fit to screen" onClick={() => flow.fitView({ padding: 0.2, duration: 200, maxZoom: 1 })}>
            <Icon icon="mdi:fit-to-screen-outline" />
          </ToolButton>
          <Divider />
          <ToolButton active={prefs.snap} label="Snap to grid" onClick={() => setPref("snap", !prefs.snap)}>
            <Icon icon="mdi:grid" />
          </ToolButton>
          <ToolButton
            active={prefs.guides}
            className="max-md:hidden"
            label="Alignment guides (hold Alt while dragging to skip)"
            onClick={() => setPref("guides", !prefs.guides)}
          >
            <Icon icon="mdi:ruler-square" />
          </ToolButton>
          <ToolButton active={findOpen} label={`Find on board (${isMac() ? "⌘" : "Ctrl+"}F)`} onClick={onFind}>
            <Icon icon="mdi:magnify" />
          </ToolButton>
          <ToolButton active={prefs.minimap} className="max-md:hidden" label="Mini map" onClick={() => setPref("minimap", !prefs.minimap)}>
            <Icon icon="mdi:map-outline" />
          </ToolButton>
          <ToolButton active={prefs.layers} label="Layers" onClick={() => setPref("layers", !prefs.layers)}>
            <Icon icon="mdi:layers-outline" />
          </ToolButton>
          <Divider />
          <ToolButton
            active={focus.active}
            label={`${focus.active ? "Exit focus mode" : "Focus mode"} (${isMac() ? "⌘" : "Ctrl+"}Shift+F)`}
            onClick={toggleFocusMode}
          >
            <Icon icon={focus.active ? "mdi:fullscreen-exit" : "mdi:fullscreen"} />
          </ToolButton>
        </div>
      </div>
    </>
  );
}

function SelectionToolbar({ doc, selectedIds, selectedNodes, dragging, editingId, onDelete, onDuplicate, onGroup, onUngroup, onToggleLock }) {
  if (!selectedIds.length || dragging || editingId) return null;
  const mod = isMac() ? "⌘" : "Ctrl+";
  const hasFrames = selectedNodes.some((node) => node.type === "frame");
  const allLocked = selectedNodes.every((node) => node.data.locked);
  return (
    <NodeToolbar isVisible nodeId={selectedIds} offset={12} position={Position.Top}>
      <div className="flex max-w-[calc(100vw-1rem)] items-center gap-0.5 overflow-x-auto rounded-xl border bg-popover p-1 shadow-lg/5">
        <Popover>
          <PopoverTrigger
            render={
              <button
                aria-label="Style"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-accent data-popup-open:bg-accent sm:h-8"
                title="Border, fill and text size"
                type="button"
              />
            }
          >
            <Icon className="size-4.5" icon="mdi:palette-outline" />
            <span className="max-sm:hidden">Style</span>
          </PopoverTrigger>
          <PopoverPopup align="start" side="bottom">
            <NodeStylePanel doc={doc} nodes={selectedNodes} />
          </PopoverPopup>
        </Popover>
        <Divider />
        {selectedIds.length > 1 &&
          ALIGN_ACTIONS.filter((action) => selectedIds.length >= (action.min ?? 2)).map((action) => (
            <ToolButton
              className="max-sm:hidden"
              key={action.mode}
              label={action.label}
              onClick={() => alignNodes(doc, selectedIds, action.mode)}
            >
              <Icon icon={action.icon} />
            </ToolButton>
          ))}
        {selectedIds.length > 1 && <Divider />}
        {hasFrames ? (
          <ToolButton label={`Ungroup (${mod}Shift+G)`} onClick={onUngroup}>
            <Icon icon="mdi:ungroup" />
          </ToolButton>
        ) : (
          <ToolButton label={`Group (${mod}G)`} onClick={onGroup}>
            <Icon icon="mdi:group" />
          </ToolButton>
        )}
        <Menu>
          <MenuTrigger render={<ToolButton label="Arrange layers" />}>
            <Icon icon="mdi:layers-outline" />
          </MenuTrigger>
          <MenuPopup align="center">
            <MenuItem onClick={() => reorder(doc, selectedIds, "front")}>
              <Icon icon="mdi:arrange-bring-to-front" />
              Bring to front
              <MenuShortcut>{mod}Shift+]</MenuShortcut>
            </MenuItem>
            <MenuItem onClick={() => reorder(doc, selectedIds, "forward")}>
              <Icon icon="mdi:arrange-bring-forward" />
              Bring forward
              <MenuShortcut>{mod}]</MenuShortcut>
            </MenuItem>
            <MenuItem onClick={() => reorder(doc, selectedIds, "backward")}>
              <Icon icon="mdi:arrange-send-backward" />
              Send backward
              <MenuShortcut>{mod}[</MenuShortcut>
            </MenuItem>
            <MenuItem onClick={() => reorder(doc, selectedIds, "back")}>
              <Icon icon="mdi:arrange-send-to-back" />
              Send to back
              <MenuShortcut>{mod}Shift+[</MenuShortcut>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => patchNodes(doc, selectedIds, { hidden: true })}>
              <Icon icon="mdi:eye-off-outline" />
              Hide
            </MenuItem>
          </MenuPopup>
        </Menu>
        <ToolButton active={allLocked} label={`${allLocked ? "Unlock" : "Lock"} (${mod}Shift+L)`} onClick={onToggleLock}>
          <Icon icon={allLocked ? "mdi:lock-outline" : "mdi:lock-open-variant-outline"} />
        </ToolButton>
        <Divider />
        <ToolButton label={`Duplicate (${mod}D)`} onClick={onDuplicate}>
          <Icon icon="mdi:content-copy" />
        </ToolButton>
        <ToolButton danger disabled={allLocked} label="Delete (Backspace)" onClick={onDelete}>
          <Icon icon="mdi:delete-outline" />
        </ToolButton>
      </div>
    </NodeToolbar>
  );
}

function ToolButton({ label, onClick, disabled, active, danger, className, children, ...props }) {
  return (
    <button
      {...props}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40 sm:size-8 [&_svg]:size-4.5",
        active && "bg-accent text-accent-foreground",
        danger && "text-destructive-foreground hover:bg-destructive/8",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
