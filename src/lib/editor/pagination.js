import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/*
 * Visual pagination for one continuous ProseMirror document.
 *
 * The document is never split. After each change the plugin measures the
 * height of every top-level block and, where a block would cross the
 * bottom of the page, inserts a non-editable spacer widget in front of it.
 * The spacer covers the rest of the page, the bottom margin, the gap
 * between sheets and the next top margin, so the block lands at the top
 * of the next sheet. A `pageBreak` node forces a break.
 *
 * Measuring happens in an animation frame and only after the document or
 * the layout changed, so typing never waits for it.
 *
 * Plugin state:
 *   config   null (continuous) | { contentHeight, margin, gap, blockGap, firstPageOffset }
 *   breaks   [{ pos, fill }]      fill = unused px left on the page above
 *   pages    [{ used }]           content px used on each page
 */

export const paginationKey = new PluginKey("pagination");

const EMPTY = { config: null, breaks: [], pages: [{ used: 0 }], decorations: DecorationSet.empty };

function spacerHeight(config, fill) {
  return Math.max(0, fill) + config.margin * 2 + config.gap;
}

function buildDecorations(doc, config, breaks) {
  if (!config || !breaks.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    breaks.map(({ pos, fill }, index) => {
      const height = spacerHeight(config, fill);
      return Decoration.widget(
        pos,
        () => {
          const spacer = document.createElement("div");
          spacer.className = "page-spacer";
          spacer.contentEditable = "false";
          spacer.setAttribute("aria-hidden", "true");
          spacer.dataset.pageSpacer = String(index + 1);
          spacer.style.height = `${height}px`;
          return spacer;
        },
        { side: -1, key: `page-spacer-${index}-${height}`, ignoreSelection: true },
      );
    }),
  );
}

/*
 * Packs top-level blocks into pages.
 * Example: contentHeight 900, blocks of 500, 300, 200 -> break before the third (fill 100)
 */
function measure(view, config) {
  const breaks = [];
  const pages = [];
  let used = config.firstPageOffset;
  let startOfPage = true;
  let forceNext = false;

  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    const height = dom.offsetHeight;
    const gap = startOfPage ? 0 : config.blockGap;

    const overflows = !startOfPage && used + gap + height > config.contentHeight;
    if (forceNext || overflows) {
      breaks.push({ pos: offset, fill: config.contentHeight - used });
      pages.push({ used });
      used = height;
      startOfPage = false;
    } else {
      used += gap + height;
      startOfPage = false;
    }
    forceNext = node.type.name === "pageBreak";
    // A page break with nothing after it still opens an (empty) page.
    if (forceNext && offset + node.nodeSize === view.state.doc.content.size) {
      breaks.push({ pos: offset + node.nodeSize, fill: config.contentHeight - used });
      pages.push({ used });
      used = 0;
    }
  });
  pages.push({ used });
  return { breaks, pages };
}

function sameBreaks(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item.pos === b[index].pos && Math.round(item.fill) === Math.round(b[index].fill));
}

export const Pagination = Extension.create({
  name: "pagination",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paginationKey,

        state: {
          init: () => EMPTY,
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(paginationKey);
            if (meta) {
              const config = "config" in meta ? meta.config : value.config;
              if (!config) return { ...EMPTY };
              const breaks = meta.breaks ?? (meta.config ? [] : value.breaks);
              const pages = meta.pages ?? (meta.config ? [{ used: 0 }] : value.pages);
              return { config, breaks, pages, decorations: buildDecorations(newState.doc, config, breaks) };
            }
            if (!tr.docChanged || !value.config) return value;
            // Keep spacers in place while typing; the next measure corrects them.
            const breaks = value.breaks.map((item) => ({ ...item, pos: tr.mapping.map(item.pos, -1) }));
            return { ...value, breaks, decorations: value.decorations.map(tr.mapping, tr.doc) };
          },
        },

        props: {
          decorations(state) {
            return paginationKey.getState(state).decorations;
          },
        },

        view(view) {
          let frame = 0;
          const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              const current = paginationKey.getState(view.state);
              if (!current.config || view.isDestroyed) return;
              const { breaks, pages } = measure(view, current.config);
              const pagesChanged =
                pages.length !== current.pages.length ||
                pages.some((page, index) => Math.round(page.used) !== Math.round(current.pages[index]?.used ?? -1));
              if (sameBreaks(breaks, current.breaks) && !pagesChanged) return;
              view.dispatch(view.state.tr.setMeta(paginationKey, { breaks, pages }).setMeta("addToHistory", false));
            });
          };

          // Images loading, fonts swapping, window resizing: all change heights.
          const observer = new ResizeObserver(schedule);
          observer.observe(view.dom);
          schedule();

          return {
            update(updatedView, previousState) {
              const before = paginationKey.getState(previousState);
              const after = paginationKey.getState(updatedView.state);
              if (updatedView.state.doc !== previousState.doc || before.config !== after.config) schedule();
            },
            destroy() {
              cancelAnimationFrame(frame);
              observer.disconnect();
            },
          };
        },
      }),
    ];
  },
});

// Turns pagination on (config object) or off (null).
export function setPaginationConfig(editor, config) {
  // Before mount Tiptap reports isDestroyed = true, yet dispatch already
  // updates the state; the plugin view reads the config once it mounts.
  if (!editor || editor.editorView?.isDestroyed) return;
  const current = paginationKey.getState(editor.state)?.config;
  if (JSON.stringify(current) === JSON.stringify(config)) return;
  editor.view.dispatch(editor.state.tr.setMeta(paginationKey, { config }).setMeta("addToHistory", false));
}

export function getPages(state) {
  return paginationKey.getState(state)?.pages ?? [{ used: 0 }];
}
