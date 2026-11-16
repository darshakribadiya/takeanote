"use client";

import { MenuSeparator } from "@/components/ui/menu";
import {
  BORDER_STYLES,
  BORDER_WIDTHS,
  FILLS,
  FONT_FAMILIES,
  FONT_SIZES,
  patchBorder,
  patchNodes,
  STROKES,
  TEXT_ALIGNS,
} from "@/lib/editor/canvas-model";
import { copySelection, cutSelection, pasteInto } from "@/lib/editor/clipboard";
import { BLOCK_TYPES, MARKS, TEXT_COLORS } from "@/lib/editor/formatting";
import { PointerMenuItem, PointerSubMenu as SubMenu } from "../pointer-menu";

// Text boxes have no code blocks; the rest of the document block types apply.
const TEXT_BLOCKS = BLOCK_TYPES.filter((type) => type.id !== "codeBlock");

const SIZE_STEP = 1.2;
const MIN_PX = 8;
const MAX_PX = 200;

/*
 * Right-click items for text boxes: formatting of the text (the selection
 * while typing, otherwise the whole box) and the box's own look: font,
 * size, alignment, border and fill. `nodes` are the selected text boxes;
 * `editing` is true when the menu opened inside a box being typed in.
 */
export function TextBoxItems({ doc, nodes, getEditor, editing, onError }) {
  const ids = nodes.map((node) => node.id);
  const editors = ids.map(getEditor).filter(Boolean);
  const first = nodes[0]?.data.style;
  const same = (read) => nodes.every((node) => read(node.data.style) === read(first));
  const check = (active, icon) => (active ? "mdi:check" : icon);

  // The selection while typing, otherwise all text in each box.
  function format(run) {
    for (const editor of editors) {
      const chain = editing ? editor.chain().focus() : editor.chain();
      if (!editing || editor.state.selection.empty) chain.selectAll();
      run(chain).run();
    }
  }

  async function clipboard(task, failure) {
    try {
      await task();
    } catch {
      onError?.({ title: failure, description: "Your browser blocked clipboard access. Use the keyboard shortcut instead." });
    }
  }

  // Bigger / smaller from the current size. Example: 16px -> 19px -> 23px
  function stepSize(direction) {
    for (const node of nodes) {
      const current = node.data.style.fontPx ?? FONT_SIZES[node.data.style.fontSize]?.value ?? FONT_SIZES.m.value;
      const next = Math.round(direction > 0 ? current * SIZE_STEP : current / SIZE_STEP);
      patchNodes(doc, [node.id], { fontPx: Math.min(MAX_PX, Math.max(MIN_PX, next)) });
    }
  }

  const editor = editors[0];
  const hasSelection = editing && editor && !editor.state.selection.empty;

  return (
    <>
      {editing && editor && (
        <>
          <PointerMenuItem
            disabled={!hasSelection}
            icon="mdi:content-cut"
            label="Cut"
            onClick={() => clipboard(() => cutSelection(editor), "Couldn't cut")}
            shortcut="Mod X"
          />
          <PointerMenuItem
            disabled={!hasSelection}
            icon="mdi:content-copy"
            label="Copy"
            onClick={() => clipboard(() => copySelection(editor), "Couldn't copy")}
            shortcut="Mod C"
          />
          <PointerMenuItem
            icon="mdi:content-paste"
            label="Paste"
            onClick={() => clipboard(() => pasteInto(editor), "Couldn't paste")}
            shortcut="Mod V"
          />
          <MenuSeparator />
        </>
      )}

      <SubMenu icon="mdi:format-text" label={editing && hasSelection ? "Format selection" : "Format text"}>
        {MARKS.map((mark) => (
          <PointerMenuItem
            icon={mark.icon}
            key={mark.id}
            label={mark.label}
            onClick={() => format(mark.run)}
            shortcut={mark.shortcut}
          />
        ))}
        <PointerMenuItem
          icon="mdi:dots-horizontal"
          label="Hidden text"
          onClick={() => format((chain) => chain.toggleSecret())}
          shortcut="Mod Shift H"
        />
        <MenuSeparator />
        <PointerMenuItem
          icon="mdi:format-clear"
          label="Clear formatting"
          onClick={() => format((chain) => chain.unsetAllMarks().clearNodes())}
        />
      </SubMenu>
      <SubMenu icon="mdi:swap-horizontal" label="Turn into">
        {TEXT_BLOCKS.map((type) => (
          <PointerMenuItem icon={type.icon} key={type.id} label={type.label} onClick={() => format(type.run)} />
        ))}
      </SubMenu>
      <SubMenu icon="mdi:palette-outline" label="Text color">
        {TEXT_COLORS.map((color) => (
          <PointerMenuItem
            icon={color.value ? "mdi:circle" : "mdi:circle-off-outline"}
            key={color.label}
            label={color.label}
            onClick={() => format((chain) => (color.value ? chain.setColor(color.value) : chain.unsetColor()))}
          />
        ))}
      </SubMenu>

      <MenuSeparator />

      <SubMenu icon="mdi:format-font" label="Font">
        {Object.entries(FONT_FAMILIES).map(([key, family]) => (
          <PointerMenuItem
            icon={check(same((style) => style.fontFamily) && first?.fontFamily === key, family.icon)}
            key={key}
            label={family.label}
            onClick={() => patchNodes(doc, ids, { fontFamily: key })}
          />
        ))}
      </SubMenu>
      <SubMenu icon="mdi:format-size" label="Font size">
        {Object.entries(FONT_SIZES).map(([key, size]) => (
          <PointerMenuItem
            icon={check(same((style) => style.fontSize) && first?.fontSize === key, "mdi:format-size")}
            key={key}
            label={`${size.label} · ${size.value}px`}
            onClick={() => patchNodes(doc, ids, { fontSize: key, fontPx: null })}
          />
        ))}
        {first?.fontPx && nodes.length === 1 && (
          <PointerMenuItem disabled icon="mdi:check" label={`Custom · ${first.fontPx}px`} />
        )}
        <MenuSeparator />
        <PointerMenuItem icon="mdi:format-font-size-increase" label="Bigger" onClick={() => stepSize(1)} />
        <PointerMenuItem icon="mdi:format-font-size-decrease" label="Smaller" onClick={() => stepSize(-1)} />
      </SubMenu>
      <SubMenu icon="mdi:format-align-left" label="Align text">
        {Object.entries(TEXT_ALIGNS).map(([key, align]) => (
          <PointerMenuItem
            icon={check(same((style) => style.textAlign) && first?.textAlign === key, align.icon)}
            key={key}
            label={align.label}
            onClick={() => patchNodes(doc, ids, { textAlign: key })}
          />
        ))}
      </SubMenu>
      <SubMenu icon="mdi:border-all-variant" label="Border">
        {Object.entries(BORDER_STYLES).map(([key, border]) => (
          <PointerMenuItem
            icon={check(same((style) => style.border.style) && first?.border.style === key, border.icon)}
            key={key}
            label={border.label}
            onClick={() => patchBorder(doc, ids, { style: key })}
          />
        ))}
        <MenuSeparator />
        {BORDER_WIDTHS.map((width) => (
          <PointerMenuItem
            icon={check(same((style) => style.border.width) && first?.border.width === width, "mdi:minus")}
            key={width}
            label={`${width}px`}
            onClick={() => patchBorder(doc, ids, { width, style: first?.border.style === "none" ? "solid" : first.border.style })}
          />
        ))}
        <MenuSeparator />
        <SubMenu icon="mdi:palette-swatch-outline" label="Border color">
          {Object.entries(STROKES).map(([key, stroke]) => (
            <PointerMenuItem
              icon={check(same((style) => style.border.color) && first?.border.color === key, "mdi:circle-outline")}
              key={key}
              label={stroke.label}
              onClick={() => patchBorder(doc, ids, { color: key, style: first?.border.style === "none" ? "solid" : first.border.style })}
            />
          ))}
        </SubMenu>
      </SubMenu>
      <SubMenu icon="mdi:format-color-fill" label="Background">
        {Object.entries(FILLS).map(([key, fill]) => (
          <PointerMenuItem
            icon={check(same((style) => style.fill) && first?.fill === key, "mdi:square-rounded-outline")}
            key={key}
            label={fill.label}
            onClick={() => patchNodes(doc, ids, { fill: key })}
          />
        ))}
      </SubMenu>
    </>
  );
}
