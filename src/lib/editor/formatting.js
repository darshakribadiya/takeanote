/*
 * Formatting actions shared by the selection bubble, the mobile toolbar
 * and keyboard help. `shortcut` uses "Mod" for Ctrl / ⌘.
 */
export const MARKS = [
  { id: "bold", label: "Bold", icon: "mdi:format-bold", shortcut: "Mod B", run: (c) => c.toggleBold() },
  { id: "italic", label: "Italic", icon: "mdi:format-italic", shortcut: "Mod I", run: (c) => c.toggleItalic() },
  {
    id: "underline",
    label: "Underline",
    icon: "mdi:format-underline",
    shortcut: "Mod U",
    run: (c) => c.toggleUnderline(),
  },
  {
    id: "strike",
    label: "Strikethrough",
    icon: "mdi:format-strikethrough-variant",
    shortcut: "Mod Shift S",
    run: (c) => c.toggleStrike(),
  },
  { id: "code", label: "Inline code", icon: "mdi:code-tags", shortcut: "Mod E", run: (c) => c.toggleCode() },
];

export const BLOCK_TYPES = [
  { id: "paragraph", label: "Text", icon: "mdi:format-paragraph", run: (c) => c.setParagraph() },
  { id: "h1", label: "Heading 1", icon: "mdi:format-header-1", run: (c) => c.toggleHeading({ level: 1 }) },
  { id: "h2", label: "Heading 2", icon: "mdi:format-header-2", run: (c) => c.toggleHeading({ level: 2 }) },
  { id: "h3", label: "Heading 3", icon: "mdi:format-header-3", run: (c) => c.toggleHeading({ level: 3 }) },
  { id: "bulletList", label: "Bulleted list", icon: "mdi:format-list-bulleted", run: (c) => c.toggleBulletList() },
  { id: "orderedList", label: "Numbered list", icon: "mdi:format-list-numbered", run: (c) => c.toggleOrderedList() },
  { id: "taskList", label: "Checklist", icon: "mdi:checkbox-marked-outline", run: (c) => c.toggleTaskList() },
  { id: "blockquote", label: "Quote", icon: "mdi:format-quote-open-outline", run: (c) => c.toggleBlockquote() },
  { id: "codeBlock", label: "Code block", icon: "mdi:code-braces", run: (c) => c.toggleCodeBlock() },
];

export const ALIGNMENTS = [
  { id: "left", label: "Align left", icon: "mdi:format-align-left", shortcut: "Mod Shift L" },
  { id: "center", label: "Align center", icon: "mdi:format-align-center", shortcut: "Mod Shift E" },
  { id: "right", label: "Align right", icon: "mdi:format-align-right", shortcut: "Mod Shift R" },
  { id: "justify", label: "Justify", icon: "mdi:format-align-justify", shortcut: "Mod Shift J" },
];

// Text colours read well on light and dark paper; null resets.
export const TEXT_COLORS = [
  { label: "Default", value: null },
  { label: "Gray", value: "#78716c" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#9333ea" },
];

export const HIGHLIGHTS = [
  { label: "None", value: null },
  { label: "Yellow", value: "rgb(250 204 21 / 0.35)" },
  { label: "Green", value: "rgb(74 222 128 / 0.3)" },
  { label: "Blue", value: "rgb(96 165 250 / 0.3)" },
  { label: "Pink", value: "rgb(244 114 182 / 0.3)" },
];

// Example: active block for a selection inside "## Plan" -> BLOCK_TYPES[2]
export function activeBlockType(editor) {
  if (!editor) return BLOCK_TYPES[0];
  for (const level of [1, 2, 3]) {
    if (editor.isActive("heading", { level })) return BLOCK_TYPES[level];
  }
  for (const type of BLOCK_TYPES.slice(4)) {
    if (editor.isActive(type.id)) return type;
  }
  return BLOCK_TYPES[0];
}

// "Mod Shift S" -> "Ctrl+Shift+S" or "⌘⇧S"
export function formatShortcut(shortcut, mac) {
  if (!shortcut) return "";
  const parts = shortcut.split(" ");
  if (mac) return parts.map((part) => ({ Mod: "⌘", Shift: "⇧", Alt: "⌥" })[part] ?? part).join("");
  return parts.map((part) => (part === "Mod" ? "Ctrl" : part)).join("+");
}
