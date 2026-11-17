import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { toBraille } from "@/lib/editor/secret-text";
import { COMMENTS, THREADS } from "@/lib/sync/doc-model";

/*
 * Comments on document text.
 *
 * The commented text carries a `comment` mark with the thread id; the
 * threads and their messages live in the note's Yjs document next to the
 * body, so they sync, save and work offline like everything else:
 *
 *   threads   Y.Map    id -> { id, quote, authorId, authorName, createdAt, resolved, resolvedBy }
 *   comments  Y.Array  { id, threadId, authorId, authorName, authorColor, text, createdAt }
 *
 * Messages are appended to one array (never rewritten), so two people
 * replying at the same time both keep their reply.
 */

export const commentsKey = new PluginKey("comments");

export const CommentMark = Mark.create({
  name: "comment",
  // Several threads may cover the same words.
  excludes: "",
  // Typing at the edge of commented text doesn't stretch the comment.
  inclusive: false,

  addOptions() {
    return { onActivate: null };
  },

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment"),
        renderHTML: (attributes) => ({ "data-comment": attributes.threadId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "comment-mark" }), 0];
  },

  addCommands() {
    return {
      setComment:
        (threadId) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId }),
      removeComment:
        (threadId) =>
        ({ tr, state, dispatch }) => {
          const ranges = commentRanges(state.doc, this.type).get(threadId);
          if (!ranges) return false;
          if (dispatch) {
            ranges.forEach(({ from, to }) => tr.removeMark(from, to, this.type.create({ threadId })));
            dispatch(tr);
          }
          return true;
        },
      // Which threads to highlight, and the one being looked at.
      setCommentView:
        (view) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(commentsKey, view));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const markType = this.type;
    const options = this.options;
    return [
      new Plugin({
        key: commentsKey,
        state: {
          init: () => ({ visible: new Set(), active: null, decorations: DecorationSet.empty }),
          apply(tr, previous) {
            const meta = tr.getMeta(commentsKey);
            if (!meta && !tr.docChanged) return previous;
            const visible = meta?.visible ?? previous.visible;
            const active = meta && "active" in meta ? meta.active : previous.active;
            return { visible, active, decorations: highlightDecorations(tr.doc, markType, visible, active) };
          },
        },
        props: {
          decorations: (state) => commentsKey.getState(state).decorations,
          handleClick(view, pos) {
            const { visible } = commentsKey.getState(view.state);
            const $pos = view.state.doc.resolve(pos);
            const marks = [...($pos.nodeAfter?.marks ?? []), ...($pos.nodeBefore?.marks ?? [])];
            const mark = marks.find((item) => item.type === markType && visible.has(item.attrs.threadId));
            if (mark) options.onActivate?.(mark.attrs.threadId);
            // Let the click place the caret as usual.
            return false;
          },
        },
      }),
    ];
  },
});

// threadId -> [{ from, to }] for every stretch of commented text.
export function commentRanges(doc, markType) {
  const ranges = new Map();
  doc.descendants((node, pos) => {
    if (!node.isInline) return;
    for (const mark of node.marks) {
      if (mark.type !== markType || !mark.attrs.threadId) continue;
      const list = ranges.get(mark.attrs.threadId) ?? [];
      const last = list.at(-1);
      if (last && last.to === pos) last.to = pos + node.nodeSize;
      else list.push({ from: pos, to: pos + node.nodeSize });
      ranges.set(mark.attrs.threadId, list);
    }
  });
  return ranges;
}

// threadId -> position of its first commented letter, for document order.
export function threadPositions(doc, markType) {
  const positions = new Map();
  for (const [id, list] of commentRanges(doc, markType)) positions.set(id, list[0].from);
  return positions;
}

function highlightDecorations(doc, markType, visible, active) {
  const decorations = [];
  for (const [id, list] of commentRanges(doc, markType)) {
    if (!visible.has(id)) continue;
    const className = id === active ? "comment-highlight is-active" : "comment-highlight";
    list.forEach(({ from, to }) => decorations.push(Decoration.inline(from, to, { class: className })));
  }
  return DecorationSet.create(doc, decorations);
}

const QUOTE_LENGTH = 140;

/*
 * The commented words as shown on the thread card. Hidden text is kept
 * as Braille, so a comment never gives away a hidden passage.
 * Example: "Call Sam on [hidden 0412…]" -> "Call Sam on ⡁⣳⠶⡮"
 */
export function quoteOf(state, from, to) {
  let text = "";
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isBlock && text && !text.endsWith(" ")) text += " ";
    if (!node.isText) return;
    const part = node.text.slice(Math.max(0, from - pos), to - pos);
    text += node.marks.some((mark) => mark.type.name === "secret") ? toBraille(part) : part;
  });
  text = text.replace(/\s+/g, " ").trim();
  return text.length > QUOTE_LENGTH ? `${text.slice(0, QUOTE_LENGTH - 1)}…` : text;
}

// ---- Yjs store ---------------------------------------------------------------

export function readThreads(doc) {
  const threads = new Map();
  doc.getMap(THREADS).forEach((value, id) => threads.set(id, { ...value, comments: [] }));
  doc.getArray(COMMENTS).forEach((comment) => threads.get(comment.threadId)?.comments.push(comment));
  return threads;
}

function author(user) {
  return { authorId: user?.id ?? null, authorName: user?.name || "Anonymous", authorColor: user?.color ?? null };
}

export function createThread(doc, { id, quote, text, user }) {
  const now = new Date().toISOString();
  const { authorId, authorName } = author(user);
  doc.transact(() => {
    doc.getMap(THREADS).set(id, { id, quote, authorId, authorName, createdAt: now, resolved: false, resolvedBy: null });
    doc.getArray(COMMENTS).push([{ id: crypto.randomUUID(), threadId: id, ...author(user), text, createdAt: now }]);
  });
}

export function addReply(doc, { threadId, text, user }) {
  doc.getArray(COMMENTS).push([
    { id: crypto.randomUUID(), threadId, ...author(user), text, createdAt: new Date().toISOString() },
  ]);
}

export function setResolved(doc, { threadId, resolved, user }) {
  const threads = doc.getMap(THREADS);
  const thread = threads.get(threadId);
  if (!thread) return;
  threads.set(threadId, { ...thread, resolved, resolvedBy: resolved ? (user?.name ?? null) : null });
}

export function deleteComment(doc, commentId) {
  const comments = doc.getArray(COMMENTS);
  const index = comments.toArray().findIndex((comment) => comment.id === commentId);
  if (index !== -1) comments.delete(index, 1);
}

export function deleteThread(doc, threadId) {
  doc.transact(() => {
    doc.getMap(THREADS).delete(threadId);
    const comments = doc.getArray(COMMENTS);
    // Back to front, so indexes stay valid while deleting.
    for (let index = comments.length - 1; index >= 0; index -= 1) {
      if (comments.get(index).threadId === threadId) comments.delete(index, 1);
    }
  });
}

export function observeThreads(doc, listener) {
  const threads = doc.getMap(THREADS);
  const comments = doc.getArray(COMMENTS);
  threads.observe(listener);
  comments.observe(listener);
  return () => {
    threads.unobserve(listener);
    comments.unobserve(listener);
  };
}
