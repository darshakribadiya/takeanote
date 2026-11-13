import { pageMetrics, PAPER_SIZES } from "@/lib/editor/paper";

/*
 * Export and print for document notes. Print uses a hidden iframe with
 * the note's own paper size, margins, header, footer and page numbers
 * (CSS @page margin boxes), so the result matches the paper on screen.
 */

// Example: "Q3 plan: draft" -> "q3-plan-draft"
export function fileSlug(title) {
  return (title || "note").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "note";
}

export function downloadFile(name, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function toMarkdown(editor, title) {
  const body = editor?.getMarkdown?.() ?? editor?.getText() ?? "";
  return title ? `# ${title}\n\n${body}` : body;
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function cssString(text) {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function pageCss(paper) {
  const size = PAPER_SIZES[paper.size];
  const [width, height] =
    paper.size === "custom" ? [paper.customWidth, paper.customHeight] : [size?.width ?? 210, size?.height ?? 297];
  const [w, h] = paper.orientation === "landscape" ? [height, width] : [width, height];
  const boxes = [
    paper.header ? `@top-center { content: ${cssString(paper.header)}; font-size: 9pt; color: #78716c; }` : "",
    paper.footer ? `@bottom-left { content: ${cssString(paper.footer)}; font-size: 9pt; color: #78716c; }` : "",
    paper.pageNumbers ? `@bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #78716c; }` : "",
  ].join("\n");
  return `@page { size: ${w}mm ${h}mm; margin: ${paper.margin}mm; ${boxes} }`;
}

const DOCUMENT_CSS = `
  body { font: 11.5pt/var(--lh) ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1917; margin: 0; }
  h1.note-title { font-size: 2em; margin: 0 0 0.6em; }
  h1, h2, h3, h4 { line-height: 1.25; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  img { max-width: 100%; height: auto; break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; break-inside: auto; }
  th, td { border: 1px solid #d6d3d1; padding: 4px 8px; vertical-align: top; text-align: left; }
  th { background: #f5f5f4; }
  tr { break-inside: avoid; }
  blockquote { border-left: 3px solid #d6d3d1; margin: 0; padding-left: 1em; color: #57534e; }
  pre { background: #f5f5f4; padding: 0.75em 1em; border-radius: 6px; white-space: pre-wrap; font-size: 0.9em; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  hr { border: 0; border-top: 1px solid #d6d3d1; margin: 1.5em 0; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0.2em; }
  ul[data-type="taskList"] li { display: flex; gap: 0.5em; }
  ul[data-type="taskList"] li > label { flex: none; }
  .page-break { break-after: page; height: 0; }
  a { color: #2563eb; }
  .attachment-link::before { content: "📎 "; }
`;

// First non-empty block of the document. Example: ["", "Trip ideas", …] -> "Trip ideas"
function firstLine(editor) {
  let line = "";
  editor?.state.doc.forEach((node) => {
    if (!line) line = node.textContent.trim().slice(0, 80);
  });
  return line;
}

export function toHtmlDocument(editor, title, paper) {
  const body = editor?.getHTML() ?? "";
  // The page <title> falls back to the first line; the body already shows that line.
  const pageTitle = title || firstLine(editor) || "Untitled";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<base href="${window.location.origin}/">
<style>
  :root { --lh: ${paper.lineHeight}; }
  ${pageCss(paper)}
  ${DOCUMENT_CSS}
  @media screen { body { max-width: ${pageMetrics(paper).contentWidth}px; margin: 48px auto; padding: 0 16px; } }
</style>
</head>
<body>
${title ? `<h1 class="note-title">${escapeHtml(title)}</h1>` : ""}
${body}
</body>
</html>`;
}

export function printDocument(editor, title, paper) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.append(frame);
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.onload = () => {
    const win = frame.contentWindow;
    const images = [...win.document.images];
    // Print once images have loaded so they aren't blank on paper.
    Promise.all(images.map((image) => (image.complete ? null : new Promise((done) => (image.onload = image.onerror = done))))).then(() => {
      win.focus();
      win.addEventListener("afterprint", cleanup, { once: true });
      win.print();
    });
  };
  frame.srcdoc = toHtmlDocument(editor, title, paper);
}
