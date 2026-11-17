"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { alignNodes, layerTree, moveLayer, patchNodes, reorder, sameStack } from "@/lib/editor/canvas-model";
import { formatShortcut } from "@/lib/editor/formatting";
import { isMac } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ALIGN_ACTIONS, ARRANGE_ACTIONS } from "./canvas-context-menu";

const TYPE_ICONS = {
  text: "mdi:format-text",
  sticky: "mdi:note-outline",
  frame: "mdi:group",
  image: "mdi:image-outline",
  file: "mdi:file-outline",
  shape: "mdi:shape-outline",
};

// Names follow the text inside boxes, so refresh shortly after edits.
const REFRESH_DELAY_MS = 300;

/*
 * Every item on the board, top of the stack first, with groups and
 * their members nested. Click selects; the eye and lock toggle the
 * item's visibility and whether it can be moved. Drag a row above or
 * below another to restack it; the footer arranges and aligns the
 * current selection.
 */
export function CanvasLayers({ doc, selectedIds, readOnly, onSelect, onClose }) {
  const [tree, setTree] = useState(() => layerTree(doc));
  const [collapsed, setCollapsed] = useState(() => new Set());
  // Row being dragged, and where it would land: { id, place: "above" | "below" }.
  const [dragId, setDragId] = useState(null);
  const [dropHint, setDropHint] = useState(null);

  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setTree(layerTree(doc)), REFRESH_DELAY_MS);
    };
    doc.on("update", refresh);
    return () => {
      clearTimeout(timer);
      doc.off("update", refresh);
    };
  }, [doc]);

  const selected = new Set(selectedIds);

  const dnd = readOnly
    ? null
    : {
        dragId,
        dropHint,
        start(id, event) {
          setDragId(id);
          event.dataTransfer.effectAllowed = "move";
          // Firefox only starts a drag that carries data.
          event.dataTransfer.setData("text/plain", id);
        },
        over(id, event) {
          if (!dragId || dragId === id || !sameStack(doc, dragId, id)) {
            if (dropHint) setDropHint(null);
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          // Top of the list is drawn on top, so the upper half means "above".
          const place = event.clientY < rect.top + rect.height / 2 ? "above" : "below";
          if (dropHint?.id !== id || dropHint.place !== place) setDropHint({ id, place });
        },
        drop(id, event) {
          event.preventDefault();
          if (dragId && dropHint?.id === id) moveLayer(doc, dragId, id, dropHint.place);
          setDragId(null);
          setDropHint(null);
        },
        end() {
          setDragId(null);
          setDropHint(null);
        },
      };

  function toggleCollapsed(id) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside
      aria-label="Layers"
      className="absolute top-3 right-3 bottom-20 z-20 flex w-64 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border bg-popover/96 shadow-lg/5 backdrop-blur"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b ps-3 pe-1">
        <Icon className="size-4.5 text-muted-foreground" icon="mdi:layers-outline" />
        <h2 className="flex-1 text-sm font-semibold">Layers</h2>
        <button
          aria-label="Close layers"
          className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
          onClick={onClose}
          type="button"
        >
          <Icon className="size-4.5" icon="mdi:close" />
        </button>
      </header>
      {tree.length ? (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1">
          {tree.map((item) => (
            <li key={item.id}>
              <LayerRow
                collapsed={collapsed.has(item.id)}
                depth={0}
                dnd={dnd}
                doc={doc}
                hasChildren={item.children.length > 0}
                item={item}
                onSelect={onSelect}
                onToggle={() => toggleCollapsed(item.id)}
                readOnly={readOnly}
                selected={selected.has(item.id)}
              />
              {item.children.length > 0 && !collapsed.has(item.id) && (
                <ul>
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <LayerRow depth={1} dnd={dnd} doc={doc} item={child} onSelect={onSelect} readOnly={readOnly} selected={selected.has(child.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Nothing on the board yet.</p>
      )}
      {!readOnly && selectedIds.length > 0 ? (
        <SelectionActions doc={doc} selectedIds={selectedIds} />
      ) : (
        <p className="shrink-0 border-t px-3 py-2 text-xs text-muted-foreground">
          Top of the list is drawn on top.{!readOnly && " Drag a row to restack it."}
        </p>
      )}
    </aside>
  );
}

function LayerRow({ doc, item, depth, selected, readOnly, onSelect, hasChildren, collapsed, onToggle, dnd }) {
  const { value } = item;
  const hint = dnd?.dropHint?.id === item.id ? dnd.dropHint.place : null;
  return (
    <div
      className={cn(
        "group relative flex h-8 items-center gap-1.5 rounded-md pe-1 text-sm hover:bg-accent",
        selected && "bg-accent text-accent-foreground",
        value.hidden && "opacity-50",
        dnd && "cursor-grab active:cursor-grabbing",
        dnd?.dragId === item.id && "opacity-40",
      )}
      draggable={Boolean(dnd)}
      onDragEnd={dnd?.end}
      onDragOver={dnd ? (event) => dnd.over(item.id, event) : undefined}
      onDragStart={dnd ? (event) => dnd.start(item.id, event) : undefined}
      onDrop={dnd ? (event) => dnd.drop(item.id, event) : undefined}
      style={{ paddingInlineStart: 4 + depth * 18 }}
    >
      {hint && (
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-sky-500", hint === "above" ? "-top-px" : "-bottom-px")}
        />
      )}
      {hasChildren ? (
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand group" : "Collapse group"}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={onToggle}
          type="button"
        >
          <Icon className="size-4" icon={collapsed ? "mdi:chevron-right" : "mdi:chevron-down"} />
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={(event) => onSelect(item.id, { add: event.shiftKey || event.metaKey || event.ctrlKey })}
        type="button"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" icon={TYPE_ICONS[value.type] ?? "mdi:shape-outline"} />
        <span className="truncate">{item.name}</span>
      </button>
      {!readOnly && (
        <span className={cn("flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100", (value.hidden || value.locked) && "opacity-100")}>
          <RowToggle
            active={value.locked}
            icon={value.locked ? "mdi:lock-outline" : "mdi:lock-open-variant-outline"}
            label={value.locked ? "Unlock" : "Lock"}
            onClick={() => patchNodes(doc, [item.id], { locked: !value.locked })}
          />
          <RowToggle
            active={value.hidden}
            icon={value.hidden ? "mdi:eye-off-outline" : "mdi:eye-outline"}
            label={value.hidden ? "Show" : "Hide"}
            onClick={() => patchNodes(doc, [item.id], { hidden: !value.hidden })}
          />
        </span>
      )}
    </div>
  );
}

function RowToggle({ label, icon, onClick, active }) {
  return (
    <button
      aria-label={label}
      aria-pressed={Boolean(active)}
      className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="size-4" icon={icon} />
    </button>
  );
}

// Footer while something is selected: stacking for any selection, alignment for two or more.
function SelectionActions({ doc, selectedIds }) {
  const mac = isMac();
  const aligns = ALIGN_ACTIONS.filter((action) => selectedIds.length >= (action.min ?? 2));
  return (
    <div className="flex shrink-0 flex-col gap-1 border-t p-1.5">
      <div className="flex items-center gap-0.5">
        <span className="w-14 ps-1.5 text-xs text-muted-foreground">Arrange</span>
        {ARRANGE_ACTIONS.map((action) => (
          <FooterButton
            icon={action.icon}
            key={action.direction}
            label={`${action.label} (${formatShortcut(action.shortcut, mac)})`}
            onClick={() => reorder(doc, selectedIds, action.direction)}
          />
        ))}
      </div>
      {aligns.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5">
          <span className="w-14 ps-1.5 text-xs text-muted-foreground">Align</span>
          {aligns.map((action) => (
            <FooterButton icon={action.icon} key={action.mode} label={action.label} onClick={() => alignNodes(doc, selectedIds, action.mode)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FooterButton({ icon, label, onClick }) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="size-4" icon={icon} />
    </button>
  );
}
