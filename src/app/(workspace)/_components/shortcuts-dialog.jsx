"use client";

import { Fragment } from "react";
import { Icon } from "@iconify/react";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { altKey, modKey } from "@/lib/format";

/*
 * Every shortcut the app registers, in three areas (one column each on
 * desktop), each split into small groups. An item is [label, ...combos];
 * a combo is a list of keys, and several combos mean "either works".
 * Example: ["Next / previous note", ["J", "K"], ["↓", "↑"]]
 */
function shortcutAreas() {
  const mod = modKey();
  const alt = altKey();
  return [
    {
      title: "General",
      icon: "mdi:keyboard-outline",
      groups: [
        {
          title: "Find & move around",
          items: [
            ["Search & commands", [mod, "K"], ["/"]],
            ["Next / previous note in the list", ["J", "K"], ["↓", "↑"]],
            ["Toggle sidebar", [mod, "B"]],
            ["Leave a field or the editor", ["Esc"]],
            ["Show these shortcuts", ["?"]],
          ],
        },
        {
          title: "Create",
          items: [
            ["New note", [alt, "N"], ["N"]],
            ["New canvas", [alt, "Shift", "N"]],
          ],
        },
        {
          title: "Open note",
          items: [
            ["Save now", [mod, "S"]],
            ["Read-only / edit", [mod, "E"]],
            ["Favorite", [alt, "F"]],
            ["Share", [alt, "S"]],
            ["Print or save as PDF", [mod, "P"]],
            ["Move to Trash", [mod, "Shift", "⌫"]],
          ],
        },
      ],
    },
    {
      title: "Writing",
      icon: "mdi:file-document-outline",
      groups: [
        {
          title: "Text style",
          items: [
            ["Bold", [mod, "B"]],
            ["Italic", [mod, "I"]],
            ["Underline", [mod, "U"]],
            ["Strikethrough", [mod, "Shift", "S"]],
            ["Inline code", [mod, "E"]],
            ["Hidden text", [mod, "Shift", "H"]],
          ],
        },
        {
          title: "Blocks",
          items: [
            ["Insert a block", ["/"]],
            ["Indent / outdent", ["Tab"], ["Shift", "Tab"]],
            ["Page break", [mod, "Enter"]],
            ["Undo / redo", [mod, "Z"], [mod, "Shift", "Z"]],
          ],
        },
        {
          title: "Paper",
          items: [
            ["Zoom in / out", [mod, "+"], [mod, "−"]],
            ["Fit to window", [mod, "0"]],
          ],
        },
      ],
    },
    {
      title: "Canvas",
      icon: "mdi:vector-square",
      groups: [
        {
          title: "Add",
          items: [
            ["Text box", ["T"]],
            ["Sticky note", ["S"]],
            ["Group", ["G"]],
            ["Process / decision shape", ["R"], ["D"]],
            ["Text where you click", ["Double-click"]],
          ],
        },
        {
          title: "Selection",
          items: [
            ["Edit text", ["Enter"]],
            ["Duplicate", [mod, "D"]],
            ["Group / ungroup", [mod, "G"], [mod, "Shift", "G"]],
            ["Lock / unlock", [mod, "Shift", "L"]],
            ["Delete", ["⌫"]],
            ["Undo / redo", [mod, "Z"], [mod, "Shift", "Z"]],
          ],
        },
        {
          title: "Layers",
          items: [
            ["Bring forward / send backward", [mod, "]"], [mod, "["]],
            ["Bring to front / send to back", [mod, "Shift", "]"], [mod, "Shift", "["]],
          ],
        },
      ],
    },
  ];
}

export function ShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup className="sm:max-w-2xl lg:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press ? anywhere outside a text field to open this list.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {open && (
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
              {shortcutAreas().map((area) => (
                <section className="flex flex-col gap-4" key={area.title}>
                  <h3 className="flex items-center gap-2 border-b pb-2 font-heading text-sm font-semibold">
                    <Icon className="size-4.5 text-muted-foreground" icon={area.icon} />
                    {area.title}
                  </h3>
                  {area.groups.map((group) => (
                    <div className="flex flex-col gap-1.5" key={group.title}>
                      <h4 className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h4>
                      <ul className="flex flex-col gap-1">
                        {group.items.map(([label, ...combos]) => (
                          <li className="flex min-h-7 items-center justify-between gap-3 text-sm" key={label}>
                            <span className="min-w-0">{label}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {combos.map((keys, index) => (
                                <Fragment key={keys.join("+")}>
                                  {index > 0 && <span className="text-xs text-muted-foreground">or</span>}
                                  <KbdGroup>
                                    {keys.map((key) => (
                                      <Kbd key={key}>{key}</Kbd>
                                    ))}
                                  </KbdGroup>
                                </Fragment>
                              ))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
