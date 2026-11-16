import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
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

/*
 * Each hidden run gets two decorations: the real letters are shrunk to
 * nothing (`.secret-src`, still in the document so editing, copy and undo
 * behave normally) and a Braille widget is drawn in front of them
 * (`.secret-braille`). CSS swaps them when "Show hidden text" is on.
 */
function brailleDecorations(doc, markType) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !markType.isInSet(node.marks)) return;
    const end = pos + node.nodeSize;
    decorations.push(Decoration.inline(pos, end, { class: "secret-src" }));
    const braille = toBraille(node.text);
    decorations.push(
      Decoration.widget(
        pos,
        () => {
          const element = document.createElement("span");
          element.className = "secret-braille";
          element.setAttribute("aria-hidden", "true");
          element.textContent = braille;
          return element;
        },
        { side: -1, ignoreSelection: true, key: `braille:${braille}` },
      ),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export const SecretText = Mark.create({
  name: "secret",

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
    return [
      new Plugin({
        key: brailleKey,
        state: {
          init: (_config, state) => brailleDecorations(state.doc, markType),
          apply: (transaction, previous) =>
            transaction.docChanged ? brailleDecorations(transaction.doc, markType) : previous,
        },
        props: {
          decorations: (state) => brailleKey.getState(state),
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
