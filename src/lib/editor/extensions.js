import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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

const NESTED_BLOCKS = ["listItem", "taskItem"];

/*
 * The block the caret is in: the innermost list item, else the top-level
 * block. With `pos`, the block that starts at `pos` (the drag handle's).
 * Returns { pos, node, depth } where depth is the parent's depth.
 */
function blockAt(state, pos) {
  if (pos != null) {
    const node = state.doc.nodeAt(pos);
    return node ? { pos, node, depth: state.doc.resolve(pos).depth } : null;
  }
  const { selection } = state;
  // A selected image or divider is itself the block.
  if (selection.node) return { pos: selection.from, node: selection.node, depth: selection.$from.depth };
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (NESTED_BLOCKS.includes($from.node(depth).type.name)) {
      return { pos: $from.before(depth), node: $from.node(depth), depth: depth - 1 };
    }
  }
  if ($from.depth < 1) return null;
  return { pos: $from.before(1), node: $from.node(1), depth: 0 };
}

/*
 * Move or duplicate a block: Alt+↑ / Alt+↓ swap it with its neighbour
 * (a list item moves within its list), Mod+D duplicates it below.
 * The caret keeps its place inside the moved block.
 */
export const BlockMove = Extension.create({
  name: "blockMove",

  addCommands() {
    return {
      moveBlock:
        (direction, pos) =>
        ({ state, tr, dispatch }) => {
          const block = blockAt(state, pos);
          if (!block) return false;
          const $pos = state.doc.resolve(block.pos);
          const index = $pos.index();
          const neighbourIndex = index + direction;
          if (neighbourIndex < 0 || neighbourIndex >= $pos.parent.childCount) return false;
          if (!dispatch) return true;
          const neighbour = $pos.parent.child(neighbourIndex);
          const end = block.pos + block.node.nodeSize;
          const offset = state.selection.from - block.pos;
          const wasNode = Boolean(state.selection.node);
          tr.delete(block.pos, end);
          const insertAt = direction < 0 ? block.pos - neighbour.nodeSize : block.pos + neighbour.nodeSize;
          tr.insert(insertAt, block.node);
          const inside = Math.min(insertAt + Math.max(offset, 0), tr.doc.content.size);
          tr.setSelection(
            wasNode ? NodeSelection.create(tr.doc, insertAt) : TextSelection.near(tr.doc.resolve(inside)),
          );
          dispatch(tr.scrollIntoView());
          return true;
        },
      duplicateBlock:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const block = blockAt(state, pos);
          if (!block) return false;
          if (!dispatch) return true;
          const end = block.pos + block.node.nodeSize;
          const offset = state.selection.from - block.pos;
          tr.insert(end, block.node.copy(block.node.content));
          if (pos == null) {
            const inside = Math.min(end + Math.max(offset, 0), tr.doc.content.size);
            tr.setSelection(
              state.selection.node ? NodeSelection.create(tr.doc, end) : TextSelection.near(tr.doc.resolve(inside)),
            );
          }
          dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Alt-ArrowUp": () => this.editor.commands.moveBlock(-1),
      "Alt-ArrowDown": () => this.editor.commands.moveBlock(1),
      "Mod-d": () => this.editor.commands.duplicateBlock(),
    };
  },
});

/*
 * Marks the top-level block holding the caret with `is-focus-block`, so
 * focus mode can dim every other paragraph (CSS in globals.css).
 */
export const FocusBlock = Extension.create({
  name: "focusBlock",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("focusBlock"),
        props: {
          decorations(state) {
            const { selection, doc } = state;
            const pos = selection.$head.depth >= 1 ? selection.$head.before(1) : selection.from;
            const node = doc.nodeAt(pos);
            if (!node) return null;
            return DecorationSet.create(doc, [Decoration.node(pos, pos + node.nodeSize, { class: "is-focus-block" })]);
          },
        },
      }),
    ];
  },
});
