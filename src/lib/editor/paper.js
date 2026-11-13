/*
 * Paper model for document notes. Sizes are in millimetres (what people
 * know from printers); rendering converts them to CSS pixels at 96 dpi.
 *
 * Settings live in the note's Yjs `settings` map, so every collaborator
 * sees the same paper. Missing keys fall back to DEFAULT_PAPER, which
 * means defaults are never written and a fresh note stays empty.
 */

export const PAPER_SIZES = {
  a4: { label: "A4", width: 210, height: 297 },
  a5: { label: "A5", width: 148, height: 210 },
  a6: { label: "A6", width: 105, height: 148 },
  letter: { label: "Letter", width: 215.9, height: 279.4 },
  legal: { label: "Legal", width: 215.9, height: 355.6 },
  custom: { label: "Custom" },
};

export const PATTERNS = [
  { value: "plain", label: "Plain", icon: "mdi:checkbox-blank-outline" },
  { value: "ruled", label: "Ruled", icon: "mdi:format-align-justify" },
  { value: "grid", label: "Grid", icon: "mdi:grid" },
  { value: "dotted", label: "Dotted", icon: "mdi:dots-grid" },
];

export const MARGIN_PRESETS = {
  narrow: { label: "Narrow", value: 12.7 },
  normal: { label: "Normal", value: 25.4 },
  wide: { label: "Wide", value: 38 },
};

export const DEFAULT_PAPER = {
  size: "a4",
  customWidth: 210,
  customHeight: 297,
  orientation: "portrait", // portrait | landscape
  layout: "paged", // paged | continuous
  pattern: "plain",
  margin: 25.4, // mm, all four sides
  lineHeight: 1.6,
  header: "",
  footer: "",
  pageNumbers: true,
};

export const PAGE_GAP_PX = 24;
const PX_PER_MM = 96 / 25.4;

export function mmToPx(mm) {
  return Math.round(mm * PX_PER_MM);
}

export function readPaper(settingsMap) {
  const paper = { ...DEFAULT_PAPER };
  for (const key of Object.keys(DEFAULT_PAPER)) {
    const value = settingsMap?.get(key);
    if (value !== undefined && value !== null) paper[key] = value;
  }
  return paper;
}

/*
 * Page box in CSS pixels.
 * Example: A4 portrait, 25.4 mm margin -> { width: 794, height: 1123, margin: 96, contentHeight: 931 }
 */
export function pageMetrics(paper) {
  const size = PAPER_SIZES[paper.size] ?? PAPER_SIZES.a4;
  let width = paper.size === "custom" ? clampMm(paper.customWidth) : size.width;
  let height = paper.size === "custom" ? clampMm(paper.customHeight) : size.height;
  if (paper.orientation === "landscape") [width, height] = [height, width];
  const widthPx = mmToPx(width);
  const heightPx = mmToPx(height);
  // Never let margins eat more than a third of the page.
  const margin = Math.min(mmToPx(paper.margin), Math.floor(Math.min(widthPx, heightPx) / 3));
  return {
    width: widthPx,
    height: heightPx,
    margin,
    contentWidth: widthPx - margin * 2,
    contentHeight: heightPx - margin * 2,
  };
}

function clampMm(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 210;
  return Math.min(Math.max(number, 50), 1000);
}

// Example: { size: "a4", orientation: "landscape" } -> "A4 · Landscape"
export function paperLabel(paper) {
  const size =
    paper.size === "custom"
      ? `${Math.round(paper.customWidth)}×${Math.round(paper.customHeight)} mm`
      : (PAPER_SIZES[paper.size] ?? PAPER_SIZES.a4).label;
  return `${size} · ${paper.orientation === "landscape" ? "Landscape" : "Portrait"}`;
}
