import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const searchKey = new PluginKey("search");

const EMPTY = { query: "", caseSensitive: false, includeHidden: false, matches: [], current: -1, decorations: DecorationSet.empty };
// Stand-in for a hidden letter, so it can never match a typed query.
const HIDDEN_CHAR = "\u0000";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Every match of `query` as { from, to } document positions. Matches stay
 * inside one paragraph (or heading, cell…). Hidden text is skipped unless
 * `includeHidden`, so searching never gives away what it says.
 * Example: "the" in "The cat. the end" (case-insensitive) -> 2 matches
 */
export function findMatches(doc, { query, caseSensitive, includeHidden }) {
  if (!query) return [];
  const pattern = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");
  const matches = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    const offsets = [];
    node.forEach((child, childOffset) => {
      const start = pos + 1 + childOffset;
      if (child.isText) {
        const hidden = !includeHidden && child.marks.some((mark) => mark.type.name === "secret");
        text += hidden ? HIDDEN_CHAR.repeat(child.text.length) : child.text;
        for (let index = 0; index < child.text.length; index += 1) offsets.push(start + index);
      } else {
        // Inline images and breaks take one position and never match.
        text += HIDDEN_CHAR;
        offsets.push(start);
      }
    });
    for (const match of text.matchAll(pattern)) {
      if (!match[0].length) continue;
      const from = offsets[match.index];
      const to = offsets[match.index + match[0].length - 1] + 1;
      matches.push({ from, to });
    }
    return false;
  });
  return matches;
}

function buildState(doc, options, current) {
  const matches = findMatches(doc, options);
  const index = matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : -1;
  const decorations = DecorationSet.create(
    doc,
    matches.map((match, i) =>
      Decoration.inline(match.from, match.to, { class: i === index ? "search-match is-current" : "search-match" }),
    ),
  );
  return { ...options, matches, current: index, decorations };
}

// First match at or after `pos`, wrapping to the top.
function matchFrom(matches, pos) {
  const index = matches.findIndex((match) => match.from >= pos);
  return index === -1 ? 0 : index;
}

/*
 * Find & replace for the document editor. The find bar drives it with
 * `setSearch`, `findNext` / `findPrevious` and `replaceMatch` /
 * `replaceAllMatches`; matches are highlighted with decorations only, so
 * collaborators never see someone else's search.
 */
export const Search = Extension.create({
  name: "search",

  addCommands() {
    const state = (editorState) => searchKey.getState(editorState);

    return {
      setSearch:
        (options) =>
        ({ tr, state: editorState, dispatch }) => {
          if (dispatch) {
            const previous = state(editorState);
            const next = { ...previous, ...options };
            // A new query starts at the caret, like a browser's find.
            const start = next.query !== previous.query ? matchFrom(findMatches(tr.doc, next), editorState.selection.from) : previous.current;
            tr.setMeta(searchKey, { ...next, current: start });
            dispatch(tr);
          }
          return true;
        },
      // `selectCurrent` leaves the caret on the match the find bar was on.
      clearSearch:
        ({ selectCurrent = false } = {}) =>
        ({ tr, state: editorState, dispatch }) => {
          if (dispatch) {
            const { matches, current } = state(editorState);
            const match = selectCurrent ? matches[current] : null;
            if (match) tr.setSelection(TextSelection.create(tr.doc, match.from, match.to));
            dispatch(tr.setMeta(searchKey, { query: "", current: -1 }));
          }
          return true;
        },
      findNext:
        (direction = 1) =>
        ({ tr, state: editorState, dispatch }) => {
          const { matches, current } = state(editorState);
          if (!matches.length) return false;
          const index = (current + direction + matches.length) % matches.length;
          // The caret stays put while stepping; the find bar scrolls the match into view.
          if (dispatch) dispatch(tr.setMeta(searchKey, { current: index }));
          return true;
        },
      findPrevious:
        () =>
        ({ commands }) =>
          commands.findNext(-1),
      replaceMatch:
        (replacement) =>
        ({ tr, state: editorState, dispatch }) => {
          const { matches, current } = state(editorState);
          const match = matches[current];
          if (!match) return false;
          if (dispatch) {
            tr.insertText(replacement, match.from, match.to);
            // Stay on the same index: the next match has moved into it.
            tr.setMeta(searchKey, { current });
            dispatch(tr);
          }
          return true;
        },
      replaceAllMatches:
        (replacement) =>
        ({ tr, state: editorState, dispatch }) => {
          const { matches } = state(editorState);
          if (!matches.length) return false;
          if (dispatch) {
            // Back to front, so earlier positions stay valid.
            [...matches].reverse().forEach((match) => tr.insertText(replacement, match.from, match.to));
            dispatch(tr.setMeta(searchKey, { current: 0 }));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => EMPTY,
          apply(tr, previous) {
            const meta = tr.getMeta(searchKey);
            if (!meta && !tr.docChanged) return previous;
            const options = {
              query: meta?.query ?? previous.query,
              caseSensitive: meta?.caseSensitive ?? previous.caseSensitive,
              includeHidden: meta?.includeHidden ?? previous.includeHidden,
            };
            if (!options.query) return { ...EMPTY, ...options };
            return buildState(tr.doc, options, meta?.current ?? previous.current);
          },
        },
        props: {
          decorations: (editorState) => searchKey.getState(editorState).decorations,
        },
      }),
    ];
  },
});
