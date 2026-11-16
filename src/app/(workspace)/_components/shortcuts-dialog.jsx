"use client";

import { Dialog, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { altKey, modKey } from "@/lib/format";

function shortcutGroups() {
  const mod = modKey();
  const alt = altKey();
  return [
    {
      title: "Capture",
      items: [
        ["New note", [alt, "N"]],
        ["New canvas", [alt, "Shift", "N"]],
        ["New note (outside a text field)", ["N"]],
        ["Save now", [mod, "S"]],
        ["Next field / list item", ["Enter"]],
      ],
    },
    {
      title: "Navigate",
      items: [
        ["Search & commands", [mod, "K"]],
        ["Search notes", ["/"]],
        ["Next / previous note", ["J", "K"]],
        ["Leave the editor", ["Esc"]],
        ["Toggle sidebar (outside the editor)", [mod, "B"]],
      ],
    },
    {
      title: "Note",
      items: [
        ["Read-only / edit (outside the editor)", [mod, "E"]],
        ["Favorite", [alt, "F"]],
        ["Share", [alt, "S"]],
        ["Move to Trash", [mod, "Shift", "⌫"]],
        ["Print or save as PDF", [mod, "P"]],
      ],
    },
    {
      title: "Writing",
      items: [
        ["Insert a block", ["/"]],
        ["Bold / italic / underline", [mod, "B / I / U"]],
        ["Strikethrough", [mod, "Shift", "S"]],
        ["Inline code", [mod, "E"]],
        ["Indent / outdent", ["Tab / Shift Tab"]],
        ["Page break", [mod, "Enter"]],
        ["Undo / redo", [mod, "Z / Shift Z"]],
        ["Zoom paper in / out / fit", [mod, "+ / − / 0"]],
      ],
    },
    {
      title: "Canvas",
      items: [
        ["Text / sticky / group", ["T / S / G"]],
        ["New text block", ["Double-click"]],
        ["Edit selected block", ["Enter"]],
        ["Duplicate", [mod, "D"]],
        ["Delete", ["⌫"]],
      ],
    },
  ];
}

export function ShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-5">
          {open &&
            shortcutGroups().map((group) => (
              <section className="flex flex-col gap-2" key={group.title}>
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h3>
                <ul className="flex flex-col gap-1.5">
                  {group.items.map(([label, keys]) => (
                    <li className="flex items-center justify-between gap-4 text-sm" key={label}>
                      <span>{label}</span>
                      <KbdGroup>
                        {keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
