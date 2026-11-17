import { getMarkRange, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/*
 * Hidden text: a mark whose letters are drawn as Braille patterns
 * (U+2800–U+28FF) until the viewer turns on "Show hidden text". It is a
 * privacy screen against people looking over your shoulder, not
 * encryption: the text is stored and synced like any other text.
 */

const BRAILLE_BLANK = 0x2800;
const BRAILLE_PATTERNS = 255; // U+2801..U+28FF; the blank cell U+2800 is skipped

/*
 * One Braille cell per character, picked from the character and its
 * position, so the same letter looks different each time it appears and
 * the pattern is not readable as real Braille. Whitespace is kept so
 * lines still wrap at word boundaries.
 * Example: toBraille("pin 1234") -> "⡁⣳⠶ ⡮⢀⢒⢥" (stable for the same input)
 */
export function toBraille(text) {
  let result = "";
  let index = 0;
  for (const char of text) {
    if (/\s/.test(char)) {
      result += char;
    } else {
      // Small integer hash (Knuth multiplicative) of code point and position.
      const hash = Math.imul((char.codePointAt(0) + 1) * 31 + index * 17, 2654435761) >>> 0;
      result += String.fromCodePoint(BRAILLE_BLANK + 1 + (hash % BRAILLE_PATTERNS));
    }
    index += 1;
  }
  return result;
}

const brailleKey = new PluginKey("secretBraille");
// Press and hold this long on Braille to peek at that run.
const PEEK_HOLD_MS = 250;

/*
 * Each hidden run gets two decorations: the real letters are shrunk to
 * nothing (`.secret-src`, still in the document so editing, copy and undo
 * behave normally) and a Braille widget is drawn in front of them
 * (`.secret-braille`). CSS swaps them when "Show hidden text" is on.
 * The widget is marked `is-selected` while the selection covers its run,
 * because the shrunken letters can't show the selection themselves.
 * A run being peeked at (`peek`, a { from, to } range) shows its letters.
 */
function brailleDecorations(doc, markType, selection, peek) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !markType.isInSet(node.marks)) return;
    const end = pos + node.nodeSize;
    if (peek && peek.from < end && peek.to > pos) {
      decorations.push(Decoration.inline(pos, end, { class: "secret-peek" }));
      return;
    }
    decorations.push(Decoration.inline(pos, end, { class: "secret-src" }));
    const braille = toBraille(node.text);
    const selected = Boolean(selection) && !selection.empty && selection.from < end && selection.to > pos;
    decorations.push(
      Decoration.widget(
        pos,
        () => {
          const element = document.createElement("span");
          element.className = selected ? "secret-braille is-selected" : "secret-braille";
          element.setAttribute("aria-hidden", "true");
          element.textContent = braille;
          if (selection !== false) element.title = "Hidden text · click to select, hold to peek";
          return element;
        },
        { side: -1, ignoreSelection: true, key: `braille:${braille}:${selected ? 1 : 0}` },
      ),
    );
  });
  return DecorationSet.create(doc, decorations);
}

/*
 * Pressing on Braille:
 *   click            selects its whole hidden run (Shift extends the
 *                    selection), ready for the selection toolbar
 *   press and hold   shows just that run until the button is released
 */
function pressBraille(view, event, markType) {
  const widget = event.target instanceof Element ? event.target.closest(".secret-braille") : null;
  if (!widget || event.button !== 0 || secretsRevealed()) return false;
  const range = getMarkRange(view.state.doc.resolve(view.posAtDOM(widget, 0)), markType);
  if (!range) return false;
  event.preventDefault();
  const shiftKey = event.shiftKey;
  let peeking = false;

  const timer = setTimeout(() => {
    peeking = true;
    view.dispatch(view.state.tr.setMeta(brailleKey, { peek: range }));
  }, PEEK_HOLD_MS);

  const release = () => {
    clearTimeout(timer);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
    if (peeking) {
      view.dispatch(view.state.tr.setMeta(brailleKey, { peek: null }));
      return;
    }
    const { selection, doc } = view.state;
    const from = Math.max(0, shiftKey ? Math.min(selection.from, range.from) : range.from);
    const to = Math.min(doc.content.size, shiftKey ? Math.max(selection.to, range.to) : range.to);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, from, to)));
    view.focus();
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  return true;
}

export const SecretText = Mark.create({
  name: "secret",

  addOptions() {
    // Document notes turn this on: Braille highlights and selects on click.
    return { selectableBraille: false };
  },

  parseHTML() {
    return [{ tag: "span[data-secret]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-secret": "" }), 0];
  },

  addCommands() {
    return {
      toggleSecret:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },

  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => this.editor.commands.toggleSecret() };
  },

  addProseMirrorPlugins() {
    const markType = this.type;
    const selectable = this.options.selectableBraille;
    return [
      new Plugin({
        key: brailleKey,
        state: {
          init: (_config, state) => ({
            peek: null,
            decorations: brailleDecorations(state.doc, markType, selectable && state.selection, null),
          }),
          apply: (transaction, previous) => {
            const meta = transaction.getMeta(brailleKey);
            let peek = meta ? meta.peek : previous.peek;
            if (peek && transaction.docChanged) {
              peek = { from: transaction.mapping.map(peek.from), to: transaction.mapping.map(peek.to) };
            }
            const changed = meta || transaction.docChanged || (selectable && transaction.selectionSet);
            if (!changed) return previous;
            return {
              peek,
              decorations: brailleDecorations(transaction.doc, markType, selectable && transaction.selection, peek),
            };
          },
        },
        props: {
          decorations: (state) => brailleKey.getState(state).decorations,
          handleDOMEvents: {
            mousedown: (view, event) => selectable && pressBraille(view, event, markType),
          },
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// "Show hidden text": per tab and never saved, so a reload hides it again.
// ---------------------------------------------------------------------------

let revealed = false;
const listeners = new Set();

export function secretsRevealed() {
  return revealed;
}

export function setSecretsRevealed(value) {
  revealed = value;
  document.documentElement.toggleAttribute("data-secrets-shown", value);
  listeners.forEach((listener) => listener());
}

export function subscribeSecrets(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
