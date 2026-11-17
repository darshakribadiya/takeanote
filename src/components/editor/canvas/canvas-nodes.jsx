"use client";

import { createContext, use, useState } from "react";
import { Icon } from "@iconify/react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import {
  boxStyle,
  FILLS,
  nodesMap,
  SHAPES,
  shapeStroke,
  STICKY_COLORS,
  STROKES,
  textStyle,
  updateNodes,
} from "@/lib/editor/canvas-model";
import { attachmentUrl, formatBytes } from "@/lib/notes/attachments";
import { cn } from "@/lib/utils";
import { CanvasText } from "./canvas-text";

export const CanvasContext = createContext(null);

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

// One handle per side; ConnectionMode.Loose lets any of them start or end a line.
function Handles() {
  return SIDES.map((side) => <Handle className="canvas-handle" id={side} key={side} position={side} type="source" />);
}

/*
 * "+" buttons just outside each side of an item: click one to add a
 * connected item of the same kind on that side (see addNeighbour).
 */
function QuickConnect({ id }) {
  const { readOnly, editingId, quickAdd } = use(CanvasContext);
  if (readOnly || !quickAdd || editingId === id) return null;
  return SIDES.map((side) => (
    <button
      aria-label={`Add connected item ${side === Position.Top ? "above" : side === Position.Bottom ? "below" : `to the ${side}`}`}
      className="canvas-quick-add nodrag nopan"
      data-side={side}
      key={side}
      onClick={(event) => {
        event.stopPropagation();
        quickAdd(id, side);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      title="Add a connected item"
      type="button"
    >
      <Icon icon="mdi:plus" />
    </button>
  ));
}

function Resizer({ selected, locked, keepAspectRatio, minWidth = 80, minHeight = 40, onResizeStart, onResizeEnd }) {
  const { readOnly } = use(CanvasContext);
  return (
    <NodeResizer
      handleClassName="canvas-resize-handle"
      isVisible={selected && !readOnly && !locked}
      keepAspectRatio={keepAspectRatio}
      lineClassName="canvas-resize-line"
      minHeight={minHeight}
      minWidth={minWidth}
      onResizeEnd={onResizeEnd}
      onResizeStart={onResizeStart}
    />
  );
}

// Small badge so a locked item explains why it won't move.
function LockBadge({ locked, selected }) {
  if (!locked || !selected) return null;
  return (
    <span className="absolute -top-2.5 -right-2.5 z-10 flex size-5 items-center justify-center rounded-full border bg-popover text-muted-foreground shadow-xs/5">
      <Icon className="size-3" icon="mdi:lock-outline" />
    </span>
  );
}

function useEditing(id) {
  const { editingId, setEditingId, readOnly } = use(CanvasContext);
  return {
    editing: editingId === id,
    start: () => !readOnly && setEditingId(id),
    stop: () => setEditingId(null),
  };
}

export function TextNode({ id, data, selected }) {
  const { doc, readOnly, registerEditor } = use(CanvasContext);
  const { editing, start, stop } = useEditing(id);
  const [resizing, setResizing] = useState(false);
  const { style } = data;
  // Without a chosen fill or border the box is bare text; paper and a thin
  // outline (inset, so nothing shifts) show only while selected or edited.
  const focused = selected || editing;
  const focusStyle = focused
    ? {
        ...(style.fill === "none" ? { background: FILLS.paper.value } : {}),
        ...(style.border.style === "none" ? { boxShadow: `inset 0 0 0 1px ${STROKES.default.value}` } : {}),
      }
    : {};

  // Typing past the edge: the box grows (wider, then taller) and the font stays.
  function grow({ width, height }) {
    const value = nodesMap(doc).get(id);
    if (!value || value.locked) return;
    updateNodes(doc, {
      [id]: { w: value.w + Math.max(0, width), h: value.h + Math.max(0, height) },
    });
  }

  // Dragging an edge scaled the text; keep that size.
  function saveFontSize(px) {
    updateNodes(doc, { [id]: { fontPx: Math.round(px) } });
  }

  return (
    <div
      className={cn("canvas-node relative h-full w-full px-3 py-2 transition-colors", !focused && "hover:brightness-97")}
      onDoubleClick={start}
      style={{ ...boxStyle(style), ...textStyle(style), ...focusStyle }}
    >
      <Resizer
        locked={data.locked}
        minHeight={24}
        minWidth={40}
        onResizeEnd={() => setResizing(false)}
        onResizeStart={() => setResizing(true)}
        selected={selected}
      />
      <LockBadge locked={data.locked} selected={selected} />
      <Handles />
      <QuickConnect id={id} />
      <CanvasText
        doc={doc}
        editing={editing}
        nodeId={id}
        onExit={stop}
        measureKey={`${style.fontPx ?? style.fontSize}|${style.fontFamily}`}
        onEditor={registerEditor ? (editor) => registerEditor(id, editor) : undefined}
        onFontFit={saveFontSize}
        onGrow={readOnly ? undefined : grow}
        resizing={resizing}
        placeholder="Type something…"
        readOnly={readOnly}
        secret={data.secret}
      />
    </div>
  );
}

export function StickyNode({ id, data, selected }) {
  const { doc, readOnly } = use(CanvasContext);
  const { editing, start, stop } = useEditing(id);
  const color = STICKY_COLORS[data.color] ?? STICKY_COLORS.yellow;
  const { style } = data;
  return (
    <div
      className="canvas-node canvas-sticky relative h-full w-full p-4 text-stone-900 shadow-md/10"
      onDoubleClick={start}
      style={{ ...boxStyle(style), ...textStyle(style), background: color.swatch }}
    >
      <Resizer locked={data.locked} minHeight={80} minWidth={80} selected={selected} />
      <LockBadge locked={data.locked} selected={selected} />
      <Handles />
      <QuickConnect id={id} />
      <CanvasText
        className="text-stone-900"
        doc={doc}
        editing={editing}
        nodeId={id}
        onExit={stop}
        placeholder="Sticky note: type # for a heading, - for a list…"
        readOnly={readOnly}
        secret={data.secret}
        variant="document"
      />
    </div>
  );
}

/*
 * A group: a labelled frame behind its members. Only the label and a thin
 * band along the border catch the pointer (hover outline, click to
 * select, drag to move); the inside stays click-through so the board and
 * the members underneath work as usual. "⋯" opens the group's menu.
 */
export function FrameNode({ id, data, selected }) {
  const { doc, readOnly, renamingId, setRenamingId, openNodeMenu } = use(CanvasContext);
  const renaming = renamingId === id;
  return (
    <div
      className={cn("canvas-frame pointer-events-none relative h-full w-full", selected && "canvas-frame-selected")}
      style={boxStyle(data.style)}
    >
      <Resizer locked={data.locked} minHeight={120} minWidth={160} selected={selected} />
      {SIDES.map((side) => (
        <span aria-hidden="true" className="frame-handle frame-edge" data-side={side} key={side} />
      ))}
      <div className="frame-handle frame-label absolute -top-8 left-0 flex h-7 max-w-full items-center gap-1.5 rounded-md ps-1.5 pe-0.5 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" icon={data.locked ? "mdi:lock-outline" : "mdi:group"} />
        {renaming ? (
          <input
            aria-label="Group name"
            autoFocus
            className="nodrag h-6 w-40 rounded bg-background px-1 text-foreground outline-none ring-2 ring-ring/32"
            defaultValue={data.label}
            onBlur={(event) => {
              updateNodes(doc, { [id]: { label: event.target.value.trim() || "Group" } });
              setRenamingId(null);
            }}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = data.label ?? "";
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="truncate pe-1" onDoubleClick={() => !readOnly && setRenamingId(id)} title="Double-click to rename">
            {data.label || "Group"}
          </span>
        )}
        {!readOnly && !renaming && (
          <button
            aria-label="Group options"
            className="frame-menu nodrag inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-background hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              openNodeMenu?.(event, id);
            }}
            title="Group options"
            type="button"
          >
            <Icon className="size-4" icon="mdi:dots-horizontal" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ImageNode({ id, data, selected }) {
  return (
    <div className="canvas-node relative h-full w-full bg-muted shadow-sm/5" style={boxStyle(data.style)}>
      <Resizer keepAspectRatio locked={data.locked} selected={selected} />
      <LockBadge locked={data.locked} selected={selected} />
      <Handles />
      <QuickConnect id={id} />
      {data.src && (
        // Clipped in its own box so the "+" buttons outside the image stay visible.
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private storage redirect, not optimisable */}
          <img alt={data.name ?? ""} className="h-full w-full object-cover select-none" draggable={false} src={data.src} />
        </div>
      )}
    </div>
  );
}

export function FileNode({ id, data, selected }) {
  return (
    <div className="canvas-node relative flex h-full w-full items-center gap-3 p-3 shadow-sm/5" style={boxStyle(data.style)}>
      <Resizer locked={data.locked} minHeight={56} minWidth={180} selected={selected} />
      <LockBadge locked={data.locked} selected={selected} />
      <Handles />
      <QuickConnect id={id} />
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" icon="mdi:file-outline" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{data.name}</span>
        <span className="text-xs text-muted-foreground">{formatBytes(data.size)}</span>
      </span>
      {data.path && (
        <a
          aria-label={`Download ${data.name}`}
          className="nodrag inline-flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent"
          download={data.name}
          href={attachmentUrl(data.path, { download: true })}
        >
          <Icon className="size-4.5" icon="mdi:download-outline" />
        </a>
      )}
    </div>
  );
}

/*
 * Flowchart shape: the outline is an SVG path drawn at the node's real size
 * (see SHAPES in canvas-model), filled and stroked from the node's style,
 * with a centred, editable label kept inside the shape's text area.
 */
export function ShapeNode({ id, data, selected, width, height }) {
  const { doc, readOnly, registerEditor } = use(CanvasContext);
  const { editing, start, stop } = useEditing(id);
  const { style } = data;
  const shape = SHAPES[data.shape] ?? SHAPES.process;
  const w = width ?? shape.size.w;
  const h = height ?? shape.size.h;
  const inset = shape.inset(w, h);

  return (
    <div className="canvas-shape relative h-full w-full" onDoubleClick={start} style={textStyle(style)}>
      <svg aria-hidden="true" className="absolute inset-0 overflow-visible" height={h} width={w}>
        <path d={shape.path(w, h)} fill={(FILLS[style.fill] ?? FILLS.none).value} {...shapeStroke(style)} />
      </svg>
      <Resizer locked={data.locked} minHeight={32} minWidth={48} selected={selected} />
      <LockBadge locked={data.locked} selected={selected} />
      <Handles />
      <QuickConnect id={id} />
      <div className="absolute" style={{ inset: `${inset.y}px ${inset.x}px` }}>
        <CanvasText
          doc={doc}
          editing={editing}
          nodeId={id}
          onEditor={registerEditor ? (editor) => registerEditor(id, editor) : undefined}
          onExit={stop}
          placeholder=""
          readOnly={readOnly}
          secret={data.secret}
          variant="shape"
        />
      </div>
    </div>
  );
}

export const NODE_TYPES = {
  text: TextNode,
  sticky: StickyNode,
  frame: FrameNode,
  image: ImageNode,
  file: FileNode,
  shape: ShapeNode,
};
