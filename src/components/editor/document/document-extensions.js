import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { BackgroundColor, Color, TextStyle } from "@tiptap/extension-text-style";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { FileDrop, Indent, PageBreak } from "@/lib/editor/extensions";
import { Pagination } from "@/lib/editor/pagination";
import { BODY } from "@/lib/sync/doc-model";
import { Attachment } from "./attachment-node";
import { SlashCommand } from "./slash-command";

function caret(user) {
  const element = document.createElement("span");
  element.className = "collab-caret";
  element.style.setProperty("--caret-color", user.color);
  const label = document.createElement("span");
  label.className = "collab-caret-label";
  label.textContent = user.name;
  element.append(label);
  return element;
}

/*
 * Extensions for the paper editor. The body lives in the note's Yjs
 * document, so Tiptap's own history is off and Yjs undo takes over
 * (it only undoes this user's changes, never a collaborator's).
 */
export function documentExtensions({ doc, awareness, user, onFiles, actions, field = BODY, placeholder }) {
  return [
    StarterKit.configure({
      undoRedo: false,
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      dropcursor: { width: 2, class: "drop-cursor" },
    }),
    Collaboration.configure({ document: doc, field }),
    ...(awareness ? [CollaborationCaret.configure({ provider: { awareness }, user, render: caret })] : []),
    Placeholder.configure({
      placeholder: ({ node, editor }) => {
        if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
        if (editor.state.doc.childCount <= 1) return placeholder ?? "Start writing, or type / for blocks…";
        return "Type / for blocks";
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 60 } }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TextStyle,
    Color,
    BackgroundColor,
    Image.configure({
      allowBase64: false,
      resize: { enabled: true, minWidth: 80, minHeight: 40, alwaysPreserveAspectRatio: true },
    }),
    Attachment,
    PageBreak,
    Indent,
    CharacterCount,
    Markdown,
    FileDrop.configure({ onFiles }),
    SlashCommand.configure({ actions }),
    Pagination,
  ];
}
