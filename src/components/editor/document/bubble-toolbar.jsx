"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { NodeSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { activeBlockType, ALIGNMENTS, BLOCK_TYPES, formatShortcut, HIGHLIGHTS, MARKS, TEXT_COLORS } from "@/lib/editor/formatting";
import { isMac } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Formatting toolbar that floats above a text selection. Sub-panels
 * (block type, colour, link) open inside the bubble itself so focus
 * never leaves the editor and the selection stays intact.
 */
export function BubbleToolbar({ editor }) {
  const [panel, setPanel] = useState(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      marks: Object.fromEntries(MARKS.map((mark) => [mark.id, current.isActive(mark.id)])),
      block: activeBlockType(current),
      align: ALIGNMENTS.find((item) => current.isActive({ textAlign: item.id }))?.id ?? "left",
      href: current.getAttributes("link").href ?? "",
      color: current.getAttributes("textStyle").color ?? null,
      highlight: current.getAttributes("textStyle").backgroundColor ?? null,
    }),
  });

  if (!state) return null;
  const chain = () => editor.chain().focus();
  const toggle = (name) => setPanel((current) => (current === name ? null : name));
  const mac = isMac();

  return (
    <BubbleMenu
      className="z-40 flex max-w-[calc(100vw-1rem)] flex-col rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg/5"
      editor={editor}
      options={{ placement: "top", offset: 8, flip: true, shift: { padding: 8 }, onHide: () => setPanel(null) }}
      shouldShow={({ editor: current, state: editorState, from, to }) => {
        if (!current.isEditable || from === to) return false;
        if (editorState.selection instanceof NodeSelection) return false;
        if (current.isActive("codeBlock")) return false;
        // Touch devices get the docked toolbar instead of a floating one.
        return !window.matchMedia("(pointer: coarse)").matches;
      }}
    >
      <div className="flex items-center gap-0.5">
        <BubbleButton active={panel === "block"} label="Turn into" onClick={() => toggle("block")} wide>
          <Icon icon={state.block.icon} />
          <span className="text-xs">{state.block.label}</span>
          <Icon className="size-3.5 opacity-60" icon="mdi:chevron-down" />
        </BubbleButton>
        <Divider />
        {MARKS.map((mark) => (
          <BubbleButton
            active={state.marks[mark.id]}
            key={mark.id}
            label={`${mark.label} (${formatShortcut(mark.shortcut, mac)})`}
            onClick={() => mark.run(chain()).run()}
          >
            <Icon icon={mark.icon} />
          </BubbleButton>
        ))}
        <Divider />
        <BubbleButton active={panel === "link" || Boolean(state.href)} label="Link" onClick={() => toggle("link")}>
          <Icon icon="mdi:link-variant" />
        </BubbleButton>
        <BubbleButton active={panel === "color"} label="Colour" onClick={() => toggle("color")}>
          <span className="flex flex-col items-center leading-none">
            <Icon className="size-4" icon="mdi:format-color-text" style={state.color ? { color: state.color } : undefined} />
          </span>
        </BubbleButton>
        <BubbleButton active={panel === "align"} label="Alignment" onClick={() => toggle("align")}>
          <Icon icon={ALIGNMENTS.find((item) => item.id === state.align)?.icon ?? "mdi:format-align-left"} />
        </BubbleButton>
        <BubbleButton label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
          <Icon icon="mdi:format-clear" />
        </BubbleButton>
      </div>

      {panel === "block" && (
        <div className="mt-1 grid grid-cols-3 gap-0.5 border-t pt-1">
          {BLOCK_TYPES.map((type) => (
            <BubbleButton
              active={state.block.id === type.id}
              key={type.id}
              label={type.label}
              onClick={() => {
                type.run(chain()).run();
                setPanel(null);
              }}
              wide
            >
              <Icon icon={type.icon} />
              <span className="truncate text-xs">{type.label}</span>
            </BubbleButton>
          ))}
        </div>
      )}

      {panel === "align" && (
        <div className="mt-1 flex gap-0.5 border-t pt-1">
          {ALIGNMENTS.map((item) => (
            <BubbleButton
              active={state.align === item.id}
              key={item.id}
              label={`${item.label} (${formatShortcut(item.shortcut, mac)})`}
              onClick={() => chain().setTextAlign(item.id).run()}
            >
              <Icon icon={item.icon} />
            </BubbleButton>
          ))}
          <Divider />
          <BubbleButton label="Indent (Tab)" onClick={() => chain().indent().run()}>
            <Icon icon="mdi:format-indent-increase" />
          </BubbleButton>
          <BubbleButton label="Outdent (Shift+Tab)" onClick={() => chain().outdent().run()}>
            <Icon icon="mdi:format-indent-decrease" />
          </BubbleButton>
        </div>
      )}

      {panel === "color" && (
        <div className="mt-1 flex flex-col gap-1.5 border-t p-1.5 pt-2">
          <Swatches
            current={state.color}
            items={TEXT_COLORS}
            label="Text"
            onPick={(value) => (value ? chain().setColor(value).run() : chain().unsetColor().run())}
            variant="text"
          />
          <Swatches
            current={state.highlight}
            items={HIGHLIGHTS}
            label="Highlight"
            onPick={(value) =>
              value ? chain().setBackgroundColor(value).run() : chain().unsetBackgroundColor().run()
            }
            variant="fill"
          />
        </div>
      )}

      {panel === "link" && (
        <LinkPanel
          href={state.href}
          onApply={(href) => {
            if (href) chain().extendMarkRange("link").setLink({ href }).run();
            else chain().extendMarkRange("link").unsetLink().run();
            setPanel(null);
          }}
        />
      )}
    </BubbleMenu>
  );
}

function LinkPanel({ href, onApply }) {
  const [value, setValue] = useState(href);
  return (
    <form
      className="mt-1 flex items-center gap-1 border-t pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        onApply(trimmed && !/^[a-z][\w+.-]*:/i.test(trimmed) && !trimmed.startsWith("/") ? `https://${trimmed}` : trimmed);
      }}
    >
      <input
        aria-label="Link address"
        autoFocus
        className="h-8 min-w-0 flex-1 rounded-md bg-muted/64 px-2 text-sm outline-none focus:ring-2 focus:ring-ring/32"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Paste or type a link"
        type="text"
        value={value}
      />
      <BubbleButton label="Apply link" submit>
        <Icon icon="mdi:check" />
      </BubbleButton>
      {href && (
        <>
          <a
            aria-label="Open link"
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon className="size-4" icon="mdi:open-in-new" />
          </a>
          <BubbleButton label="Remove link" onClick={() => onApply("")}>
            <Icon icon="mdi:link-variant-off" />
          </BubbleButton>
        </>
      )}
    </form>
  );
}

function Swatches({ label, items, current, onPick, variant }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {items.map((item) => (
          <button
            aria-label={`${label}: ${item.label}`}
            aria-pressed={current === item.value}
            className={cn(
              "flex size-6 items-center justify-center rounded-md border text-xs font-semibold outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
              current === item.value && "ring-2 ring-ring",
            )}
            key={item.label}
            onClick={() => onPick(item.value)}
            onMouseDown={(event) => event.preventDefault()}
            style={variant === "fill" ? { background: item.value ?? "transparent" } : { color: item.value ?? undefined }}
            title={item.label}
            type="button"
          >
            {variant === "text" ? "A" : !item.value && <Icon className="size-3.5" icon="mdi:cancel" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function BubbleButton({ active, label, onClick, children, wide, submit }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg:not([class*='size-'])]:size-4.5",
        wide ? "px-2" : "w-8",
        active && "bg-accent text-accent-foreground",
      )}
      onClick={onClick}
      // Keep the editor focused (and its selection) while clicking.
      onMouseDown={(event) => !submit && event.preventDefault()}
      title={label}
      type={submit ? "submit" : "button"}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
