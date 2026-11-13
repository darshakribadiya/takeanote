"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { filterSlashCommands, runSlashCommand } from "@/lib/editor/slash-commands";
import { cn } from "@/lib/utils";

const MENU_WIDTH = 288;
const MENU_MAX_HEIGHT = 320;

/*
 * "/" opens a filterable block menu at the caret. `actions` carries
 * page-level actions such as the file picker.
 */
export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return { actions: {} };
  },

  addProseMirrorPlugins() {
    const { actions } = this.options;
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        allowSpaces: false,
        allow: ({ state, range }) => {
          const parent = state.doc.resolve(range.from).parent;
          return !parent.type.spec.code;
        },
        items: ({ query }) => filterSlashCommands(query),
        command: ({ editor, range, props }) => runSlashCommand(editor, range, props, actions),
        render: renderSlashMenu,
      }),
    ];
  },
});

function placeMenu(element, clientRect) {
  const rect = clientRect?.();
  if (!rect) return;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const below = rect.bottom + 8;
  const fitsBelow = below + MENU_MAX_HEIGHT < viewportHeight;
  const top = fitsBelow ? below : Math.max(8, rect.top - 8 - Math.min(MENU_MAX_HEIGHT, element.offsetHeight || MENU_MAX_HEIGHT));
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - MENU_WIDTH - 8);
  element.style.top = `${top}px`;
  element.style.left = `${left}px`;
}

function renderSlashMenu() {
  let renderer = null;
  let container = null;

  function close() {
    container?.remove();
    renderer?.destroy();
    container = null;
    renderer = null;
  }

  return {
    onStart(props) {
      renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
      container = document.createElement("div");
      container.style.position = "fixed";
      container.style.zIndex = "60";
      container.append(renderer.element);
      document.body.append(container);
      placeMenu(container, props.clientRect);
    },
    onUpdate(props) {
      renderer?.updateProps(props);
      if (container) placeMenu(container, props.clientRect);
    },
    onKeyDown(props) {
      if (props.event.key === "Escape") {
        close();
        return true;
      }
      return renderer?.ref?.onKeyDown(props.event) ?? false;
    },
    onExit: close,
  };
}

function SlashMenu({ items, command, ref }) {
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  // A new query restarts the highlight at the best match.
  const [lastItems, setLastItems] = useState(items);
  if (lastItems !== items) {
    setLastItems(items);
    setActive(0);
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setActive((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((index) => (index - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[active]);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="w-72 rounded-xl border bg-popover p-3 text-sm text-muted-foreground shadow-lg/5">
        No matching blocks
      </div>
    );
  }

  return (
    <div
      aria-label="Insert block"
      className="flex max-h-80 w-72 flex-col overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg/5"
      ref={listRef}
      role="listbox"
    >
      {items.map((item, index) => (
        <button
          aria-selected={index === active}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none",
            index === active && "bg-accent text-accent-foreground",
          )}
          data-index={index}
          key={item.id}
          onClick={() => command(item)}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          role="option"
          type="button"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
            <Icon className="size-4.5" icon={item.icon} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{item.label}</span>
            <span className="truncate text-xs text-muted-foreground">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
