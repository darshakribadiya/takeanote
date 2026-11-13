"use client";

import { Icon } from "@iconify/react";
import { SaveStatus } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import { MenuCheckboxItem } from "@/components/ui/menu";
import { modKey } from "@/lib/format";

/*
 * Save state for an open note: the status and, when autosave is off,
 * a Save button (same as Ctrl+S). The autosave switch itself lives in
 * the note's "More actions" menu (AutosaveMenuItem).
 */
export function SaveControls({ status, autosave, onSave, canEdit = true }) {
  const unsaved = status === "unsaved";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <SaveStatus status={status} />
      {canEdit && !autosave && (
        <Button
          disabled={!unsaved}
          onClick={onSave}
          size="xs"
          title={`Save (${modKey()} S)`}
          variant={unsaved ? "default" : "outline"}
        >
          <Icon icon="mdi:content-save-outline" />
          Save
        </Button>
      )}
    </div>
  );
}

// Switch row for a note's "More actions" menu. Autosave is on by default.
export function AutosaveMenuItem({ autosave, onChange }) {
  return (
    <MenuCheckboxItem checked={autosave} closeOnClick={false} onCheckedChange={onChange} variant="switch">
      <span className="flex flex-col">
        <span>Autosave</span>
        <span className="text-xs text-muted-foreground">
          {autosave ? "Saves as you type" : `Saves on ${modKey()} S only`}
        </span>
      </span>
    </MenuCheckboxItem>
  );
}
