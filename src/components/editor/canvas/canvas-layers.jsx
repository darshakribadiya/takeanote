"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { layerTree, patchNodes } from "@/lib/editor/canvas-model";
import { cn } from "@/lib/utils";

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
 * item's visibility and whether it can be moved.
 */
export function CanvasLayers({ doc, selectedIds, readOnly, onSelect, onClose }) {
  const [tree, setTree] = useState(() => layerTree(doc));
  const [collapsed, setCollapsed] = useState(() => new Set());

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
                      <LayerRow depth={1} doc={doc} item={child} onSelect={onSelect} readOnly={readOnly} selected={selected.has(child.id)} />
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
      <p className="shrink-0 border-t px-3 py-2 text-xs text-muted-foreground">Top of the list is drawn on top.</p>
    </aside>
  );
}

function LayerRow({ doc, item, depth, selected, readOnly, onSelect, hasChildren, collapsed, onToggle }) {
  const { value } = item;
  return (
    <div
      className={cn(
        "group flex h-8 items-center gap-1.5 rounded-md pe-1 text-sm hover:bg-accent",
        selected && "bg-accent text-accent-foreground",
        value.hidden && "opacity-50",
      )}
      style={{ paddingInlineStart: 4 + depth * 18 }}
    >
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
