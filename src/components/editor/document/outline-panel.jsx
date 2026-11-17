"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useEditorState } from "@tiptap/react";
import { useSecretsRevealed } from "@/hooks/use-secrets-revealed";
import { toBraille } from "@/lib/editor/secret-text";
import { cn } from "@/lib/utils";

// How far below the top of the scroll area a heading counts as "current".
const ACTIVE_OFFSET_PX = 96;

/*
 * Headings of the document (H1–H4) as a clickable outline.
 * Hidden text in a heading stays as Braille unless hidden text is shown.
 * Example: "# Plan", "## Budget" -> [{ level: 1, text: "Plan" }, { level: 2, text: "Budget" }]
 */
export function readOutline(doc, revealed) {
  const headings = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== "heading") return;
    let text = "";
    node.forEach((child) => {
      if (!child.isText) return;
      const secret = child.marks.some((mark) => mark.type.name === "secret");
      text += secret && !revealed ? toBraille(child.text) : child.text;
    });
    headings.push({ pos, level: node.attrs.level, text: text.trim() });
  });
  return headings;
}

export function OutlinePanel({ editor, scrollRef, onClose }) {
  const revealed = useSecretsRevealed();
  const headings = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? readOutline(current.state.doc, revealed) : []),
  }) ?? [];
  const active = useActiveHeading(editor, scrollRef, headings);
  const minLevel = Math.min(...headings.map((heading) => heading.level), 4);

  function jump(heading) {
    const dom = editor.view.nodeDOM(heading.pos);
    if (dom instanceof Element) dom.scrollIntoView({ block: "start", behavior: "smooth" });
    if (editor.isEditable) {
      // Caret at the end of the heading, without a second (instant) scroll.
      const end = heading.pos + editor.state.doc.nodeAt(heading.pos).nodeSize - 1;
      editor.chain().setTextSelection(end).focus(undefined, { scrollIntoView: false }).run();
    }
  }

  return (
    <nav aria-label="Outline" className="flex max-h-[calc(100dvh-12rem)] w-60 flex-col rounded-xl border bg-popover/96 shadow-lg/5 backdrop-blur">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className="size-4.5 text-muted-foreground" icon="mdi:format-list-text" />
        <span className="flex-1 text-sm font-medium">Outline</span>
        <button
          aria-label="Close outline"
          className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
          onClick={onClose}
          type="button"
        >
          <Icon className="size-4" icon="mdi:close" />
        </button>
      </div>
      {headings.length ? (
        <ol className="flex flex-col overflow-y-auto p-1.5">
          {headings.map((heading, index) => (
            <li key={`${heading.pos}:${index}`}>
              <button
                className={cn(
                  "w-full truncate rounded-md py-1 pe-2 text-start text-sm hover:bg-accent",
                  heading.level === minLevel && "font-medium",
                  index === active ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
                onClick={() => jump(heading)}
                style={{ paddingInlineStart: `${0.5 + (heading.level - minLevel) * 0.85}rem` }}
                title={heading.text}
                type="button"
              >
                {heading.text || <span className="italic opacity-60">Empty heading</span>}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-3 py-4 text-sm text-muted-foreground">Headings you add show up here.</p>
      )}
    </nav>
  );
}

// Index of the last heading scrolled past the top of the scroll area.
function useActiveHeading(editor, scrollRef, headings) {
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const scroller = scrollRef?.current;
    if (!editor || !scroller) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = scroller.getBoundingClientRect().top + ACTIVE_OFFSET_PX;
        let current = headings.length ? 0 : -1;
        headings.forEach((heading, index) => {
          const dom = editor.view.nodeDOM(heading.pos);
          if (dom instanceof Element && dom.getBoundingClientRect().top <= line) current = index;
        });
        setActive(current);
      });
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", update);
    };
  }, [editor, scrollRef, headings]);
  return active;
}
