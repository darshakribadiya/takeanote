"use client";

import { Icon } from "@iconify/react";
import {
  BORDER_STYLES,
  BORDER_WIDTHS,
  EDGE_ARROWS,
  EDGE_LINES,
  EDGE_PATHS,
  FILLS,
  FONT_SIZES,
  patchBorder,
  patchNodes,
  RADII,
  SHAPES,
  STICKY_COLORS,
  STROKES,
  STYLE_CAPABILITIES,
  TEXT_ALIGNS,
  updateEdges,
} from "@/lib/editor/canvas-model";
import { cn } from "@/lib/utils";

/*
 * Style controls for the selected boxes. Only controls every selected
 * type supports are shown; values show as selected when all agree.
 */
export function NodeStylePanel({ doc, nodes }) {
  const ids = nodes.map((node) => node.id);
  const can = (key) => nodes.every((node) => STYLE_CAPABILITIES[node.type]?.[key]);
  const shared = (read) => {
    const values = new Set(nodes.map(read));
    return values.size === 1 ? [...values][0] : undefined;
  };

  const border = {
    style: shared((node) => node.data.style.border.style),
    width: shared((node) => node.data.style.border.width),
    color: shared((node) => node.data.style.border.color),
  };

  return (
    <div className="flex w-72 flex-col gap-3 p-1">
      {can("shape") && (
        <Section title="Shape">
          <Segments
            onPick={(shape) => patchNodes(doc, ids, { shape })}
            options={Object.entries(SHAPES).map(([value, shape]) => ({ value, icon: shape.icon, title: shape.label }))}
            value={shared((node) => node.data.shape)}
          />
        </Section>
      )}

      {can("text") && (
        <Section title="Text">
          <Segments
            onPick={(fontSize) => patchNodes(doc, ids, { fontSize, fontPx: null })}
            options={Object.entries(FONT_SIZES).map(([value, size]) => ({ value, label: size.label, title: `${size.value}px` }))}
            value={shared((node) => node.data.style.fontSize)}
          />
          <Segments
            onPick={(textAlign) => patchNodes(doc, ids, { textAlign })}
            options={Object.entries(TEXT_ALIGNS).map(([value, align]) => ({ value, icon: align.icon, title: align.label }))}
            value={shared((node) => node.data.style.textAlign)}
          />
        </Section>
      )}

      {can("sticky") && (
        <Section title="Note colour">
          <Swatches
            items={Object.entries(STICKY_COLORS).map(([value, color]) => ({ value, label: color.label, css: color.swatch }))}
            onPick={(color) => patchNodes(doc, ids, { color })}
            value={shared((node) => node.data.color ?? "yellow")}
          />
        </Section>
      )}

      {can("fill") && (
        <Section title="Fill">
          <Swatches
            items={Object.entries(FILLS).map(([value, fill]) => ({ value, label: fill.label, css: fill.value }))}
            onPick={(fill) => patchNodes(doc, ids, { fill })}
            value={shared((node) => node.data.style.fill)}
          />
        </Section>
      )}

      {can("border") && (
        <Section title="Border">
          <Segments
            onPick={(style) => patchBorder(doc, ids, { style })}
            options={Object.entries(BORDER_STYLES).map(([value, item]) => ({ value, icon: item.icon, title: item.label }))}
            value={border.style}
          />
          {border.style !== "none" && (
            <>
              <Segments
                onPick={(width) => patchBorder(doc, ids, { width: Number(width) })}
                options={BORDER_WIDTHS.map((width) => ({
                  value: width,
                  title: `${width}px`,
                  content: <span className="block w-5 rounded-full bg-current" style={{ height: width }} />,
                }))}
                value={border.width}
              />
              <Swatches
                items={Object.entries(STROKES).map(([value, stroke]) => ({ value, label: stroke.label, css: stroke.value, ring: true }))}
                onPick={(color) => patchBorder(doc, ids, { color })}
                value={border.color}
              />
            </>
          )}
        </Section>
      )}

      {can("radius") && (
        <Section title="Corners">
          <Segments
            onPick={(radius) => patchNodes(doc, ids, { radius })}
            options={Object.entries(RADII).map(([value, radius]) => ({
              value,
              title: radius.label,
              content: (
                <span
                  className="block size-4 border-2 border-current"
                  style={{ borderRadius: Math.min(radius.value, 8), borderBottomWidth: 0, borderLeftWidth: 0 }}
                />
              ),
            }))}
            value={shared((node) => node.data.style.radius)}
          />
        </Section>
      )}
    </div>
  );
}

// Arrow style controls for the selected connectors.
export function EdgeStylePanel({ doc, edges }) {
  const ids = edges.map((edge) => edge.id);
  const shared = (key) => {
    const values = new Set(edges.map((edge) => edge.data?.[key]));
    return values.size === 1 ? [...values][0] : undefined;
  };
  const patch = (value) => updateEdges(doc, ids, value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segments
        onPick={(path) => patch({ path })}
        options={Object.entries(EDGE_PATHS).map(([value, item]) => ({ value, icon: item.icon, title: item.label }))}
        value={shared("path")}
      />
      <Segments
        onPick={(line) => patch({ line })}
        options={Object.entries(EDGE_LINES).map(([value, item]) => ({ value, icon: item.icon, title: item.label }))}
        value={shared("line")}
      />
      <Segments
        onPick={(arrow) => patch({ arrow })}
        options={Object.entries(EDGE_ARROWS).map(([value, item]) => ({ value, icon: item.icon, title: item.label }))}
        value={shared("arrow")}
      />
      <Swatches
        items={Object.entries(STROKES).map(([value, stroke]) => ({ value, label: stroke.label, css: stroke.value, ring: true }))}
        onPick={(color) => patch({ color })}
        value={shared("color")}
      />
      {ids.length === 1 && (
        <input
          aria-label="Arrow label"
          className="h-8 w-36 rounded-md bg-muted/64 px-2 text-sm outline-none focus:ring-2 focus:ring-ring/32"
          defaultValue={shared("label") ?? ""}
          key={ids[0]}
          maxLength={80}
          onBlur={(event) => patch({ label: event.target.value.trim() })}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          placeholder="Label"
        />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

function Segments({ options, value, onPick }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          aria-label={option.title ?? option.label}
          aria-pressed={value === option.value}
          className={cn(
            "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
            value === option.value && "bg-background text-foreground shadow-xs/5",
          )}
          key={option.value}
          onClick={() => onPick(option.value)}
          title={option.title ?? option.label}
          type="button"
        >
          {option.content ?? (option.icon ? <Icon className="size-4" icon={option.icon} /> : option.label)}
        </button>
      ))}
    </div>
  );
}

function Swatches({ items, value, onPick }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item) => (
        <button
          aria-label={item.label}
          aria-pressed={value === item.value}
          className={cn(
            "flex size-6 items-center justify-center rounded-full border outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
            value === item.value && "ring-2 ring-sky-500 ring-offset-1 ring-offset-popover",
          )}
          key={item.value}
          onClick={() => onPick(item.value)}
          style={item.ring ? { boxShadow: `inset 0 0 0 3px ${item.css}` } : { background: item.css }}
          title={item.label}
          type="button"
        >
          {item.value === "none" && <Icon className="size-3.5 text-muted-foreground" icon="mdi:cancel" />}
        </button>
      ))}
    </div>
  );
}
