/*
 * Blocks offered by the "/" menu. `run` receives the editor, the range of
 * the typed "/query" (deleted first) and actions provided by the page,
 * such as opening the file picker.
 */
export const SLASH_COMMANDS = [
  {
    id: "text",
    label: "Text",
    description: "Plain paragraph",
    icon: "mdi:format-paragraph",
    keywords: ["paragraph", "p"],
    run: (chain) => chain.setParagraph(),
  },
  {
    id: "h1",
    label: "Heading 1",
    description: "Large section title",
    icon: "mdi:format-header-1",
    keywords: ["title", "h1", "#"],
    run: (chain) => chain.setHeading({ level: 1 }),
  },
  {
    id: "h2",
    label: "Heading 2",
    description: "Medium section title",
    icon: "mdi:format-header-2",
    keywords: ["subtitle", "h2", "##"],
    run: (chain) => chain.setHeading({ level: 2 }),
  },
  {
    id: "h3",
    label: "Heading 3",
    description: "Small section title",
    icon: "mdi:format-header-3",
    keywords: ["h3", "###"],
    run: (chain) => chain.setHeading({ level: 3 }),
  },
  {
    id: "bullet",
    label: "Bulleted list",
    description: "Simple list",
    icon: "mdi:format-list-bulleted",
    keywords: ["ul", "unordered", "-"],
    run: (chain) => chain.toggleBulletList(),
  },
  {
    id: "numbered",
    label: "Numbered list",
    description: "List with numbers",
    icon: "mdi:format-list-numbered",
    keywords: ["ol", "ordered", "1."],
    run: (chain) => chain.toggleOrderedList(),
  },
  {
    id: "todo",
    label: "Checklist",
    description: "Track tasks",
    icon: "mdi:checkbox-marked-outline",
    keywords: ["todo", "task", "check", "[]"],
    run: (chain) => chain.toggleTaskList(),
  },
  {
    id: "quote",
    label: "Quote",
    description: "Highlighted quotation",
    icon: "mdi:format-quote-open-outline",
    keywords: ["blockquote", "citation", ">"],
    run: (chain) => chain.setBlockquote(),
  },
  {
    id: "code",
    label: "Code block",
    description: "Monospaced code",
    icon: "mdi:code-braces",
    keywords: ["snippet", "pre", "```"],
    run: (chain) => chain.setCodeBlock(),
  },
  {
    id: "table",
    label: "Table",
    description: "3 × 3 grid",
    icon: "mdi:table",
    keywords: ["grid", "rows", "columns"],
    run: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  },
  {
    id: "divider",
    label: "Divider",
    description: "Horizontal line",
    icon: "mdi:minus",
    keywords: ["hr", "rule", "separator", "---"],
    run: (chain) => chain.setHorizontalRule(),
  },
  {
    id: "page-break",
    label: "Page break",
    description: "Continue on a new page",
    icon: "mdi:file-document-multiple-outline",
    keywords: ["new page", "break", "pagination"],
    run: (chain) => chain.setPageBreak(),
  },
  {
    id: "image",
    label: "Image",
    description: "Upload a picture",
    icon: "mdi:image-outline",
    keywords: ["photo", "picture", "img"],
    run: (chain, actions) => {
      chain.run();
      actions.pickFile?.("image/*");
      return null;
    },
  },
  {
    id: "file",
    label: "File",
    description: "Attach any file",
    icon: "mdi:paperclip",
    keywords: ["attachment", "upload", "pdf"],
    run: (chain, actions) => {
      chain.run();
      actions.pickFile?.("*/*");
      return null;
    },
  },
  {
    id: "date",
    label: "Today's date",
    description: "Insert the current date",
    icon: "mdi:calendar-outline",
    keywords: ["today", "now", "time"],
    run: (chain) =>
      chain.insertContent(new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date())),
  },
];

/*
 * Ranks commands for the typed query: label prefix first, then any
 * keyword or label match.
 * Example: "num" -> [Numbered list]
 */
export function filterSlashCommands(query) {
  const term = query.trim().toLowerCase();
  if (!term) return SLASH_COMMANDS;
  const scored = [];
  for (const command of SLASH_COMMANDS) {
    const label = command.label.toLowerCase();
    let score = -1;
    if (label.startsWith(term)) score = 0;
    else if (command.keywords.some((keyword) => keyword.startsWith(term))) score = 1;
    else if (label.includes(term)) score = 2;
    if (score >= 0) scored.push({ command, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((item) => item.command);
}

export function runSlashCommand(editor, range, command, actions = {}) {
  const chain = editor.chain().focus().deleteRange(range);
  const result = command.run(chain, actions);
  if (result) result.run();
}
