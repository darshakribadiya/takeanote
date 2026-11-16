import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/*
 * Forces the next block onto a new page (paged layout and print).
 * Shows as a labelled dashed rule in continuous layout.
 */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-page-break": "", class: "page-break" })];
  },

  renderMarkdown() {
    return "\n---\n";
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: "paragraph" }]).run(),
    };
  },

  addKeyboardShortcuts() {
    return { "Mod-Enter": () => this.editor.commands.setPageBreak() };
  },
});

const MAX_INDENT = 8;
const INDENT_TYPES = ["paragraph", "heading"];

/*
 * Block indentation for paragraphs and headings (lists nest instead).
 * Tab / Shift+Tab: nest list items when in a list, else indent the block.
 */
export const Indent = Extension.create({
  name: "indent",

  addGlobalAttributes() {
    return [
      {
        types: INDENT_TYPES,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => Number(element.getAttribute("data-indent")) || 0,
            renderHTML: (attributes) =>
              attributes.indent ? { "data-indent": attributes.indent, style: `margin-inline-start: ${attributes.indent * 2}em` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const shift =
      (delta) =>
      () =>
      ({ tr, state, dispatch }) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!INDENT_TYPES.includes(node.type.name)) return;
          const indent = Math.min(Math.max((node.attrs.indent ?? 0) + delta, 0), MAX_INDENT);
          if (indent === node.attrs.indent) return;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
          changed = true;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    return { indent: shift(1), outdent: shift(-1) };
  },

  addKeyboardShortcuts() {
    const nestOrIndent = (direction) => () => {
      const { editor } = this;
      if (editor.isActive("table") || editor.isActive("codeBlock")) return false;
      const listCommand = direction > 0 ? "sinkListItem" : "liftListItem";
      for (const item of ["listItem", "taskItem"]) {
        if (editor.isActive(item)) {
          editor.commands[listCommand](item);
          // Swallow Tab inside lists so focus never jumps out of the editor.
          return true;
        }
      }
      return direction > 0 ? editor.commands.indent() || true : editor.commands.outdent() || true;
    };
    return { Tab: nestOrIndent(1), "Shift-Tab": nestOrIndent(-1) };
  },
});

/*
 * Files pasted or dropped into the editor are handed to `onFiles`, which
 * uploads them and inserts images or attachment cards at `pos`.
 */
export const FileDrop = Extension.create({
  name: "fileDrop",

  addOptions() {
    return { onFiles: null };
  },

  addProseMirrorPlugins() {
    const { onFiles } = this.options;
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("fileDrop"),
        props: {
          handlePaste(view, event) {
            const files = [...(event.clipboardData?.files ?? [])];
            if (!files.length || !onFiles || !editor.isEditable) return false;
            onFiles(files, view.state.selection.from);
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            const files = [...(event.dataTransfer?.files ?? [])];
            if (moved || !files.length || !onFiles || !editor.isEditable) return false;
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            onFiles(files, coords?.pos ?? view.state.selection.from);
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});

// Lines that only make sense as markdown: "# Title", "- item", "1. step", "> quote", "```", "- [ ] task", "---"
const MARKDOWN_LINE = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|- \[[ xX]\]\s|-{3,}\s*$|\*{3,}\s*$)/m;

/*
 * Plain-text paste that looks like markdown is inserted as formatted
 * content (needs the Markdown extension). Rich HTML pastes are left to
 * ProseMirror, and so is ordinary text.
 * Example: pasting "## Plan\n- milk" -> a heading and a bulleted list
 */
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste(_view, event) {
            const data = event.clipboardData;
            if (!editor.isEditable || !editor.markdown || !data || data.types.includes("text/html")) return false;
            const text = data.getData("text/plain");
            if (!text || !MARKDOWN_LINE.test(text)) return false;
            return editor.commands.insertContent(text, { contentType: "markdown" });
          },
        },
      }),
    ];
  },
});
