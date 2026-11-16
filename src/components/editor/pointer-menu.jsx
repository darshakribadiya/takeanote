"use client";

import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "@/components/ui/menu";
import { useSecretsRevealed } from "@/hooks/use-secrets-revealed";
import { formatShortcut } from "@/lib/editor/formatting";
import { setSecretsRevealed } from "@/lib/editor/secret-text";
import { isMac } from "@/lib/format";

/*
 * A right-click menu opened by hand at the pointer, instead of Base UI's
 * ContextMenu.Trigger, which blocks the browser menu everywhere inside it.
 * Opening by hand lets each editor decide when the browser menu is better
 * (Shift + right-click, typing inside a canvas box, phones).
 *
 * `menu.target` is whatever the editor recorded at right-click time. It is
 * kept while the popup closes so the content doesn't vanish mid-animation.
 */
export function usePointerMenu() {
  const [menu, setMenu] = useState({ open: false, x: 0, y: 0, target: null });
  return {
    menu,
    openAt(event, target = null) {
      event.preventDefault();
      setMenu({ open: true, x: event.clientX, y: event.clientY, target });
    },
    close() {
      setMenu((current) => ({ ...current, open: false }));
    },
  };
}

export function PointerMenu({ menu, onClose, children }) {
  const anchor = useMemo(
    () => ({ getBoundingClientRect: () => DOMRect.fromRect({ x: menu.x, y: menu.y, width: 0, height: 0 }) }),
    [menu.x, menu.y],
  );

  return (
    <Menu modal={false} onOpenChange={(open) => !open && onClose()} open={menu.open}>
      <MenuPopup align="start" anchor={anchor} className="min-w-56" side="bottom" sideOffset={2}>
        {children}
        <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground max-md:hidden">Shift + right-click for the browser menu</p>
      </MenuPopup>
    </Menu>
  );
}

// One row: icon, label, optional shortcut ("Mod Shift Z" style).
export function PointerMenuItem({ icon, label, shortcut, onClick, disabled, destructive }) {
  return (
    <MenuItem disabled={disabled} onClick={onClick} variant={destructive ? "destructive" : "default"}>
      {icon ? <Icon icon={icon} /> : <span className="size-4" />}
      {label}
      {shortcut && <MenuShortcut>{formatShortcut(shortcut, isMac())}</MenuShortcut>}
    </MenuItem>
  );
}

export function PointerSubMenu({ icon, label, children }) {
  return (
    <MenuSub>
      <MenuSubTrigger>
        <Icon icon={icon} />
        {label}
      </MenuSubTrigger>
      <MenuSubPopup>{children}</MenuSubPopup>
    </MenuSub>
  );
}

// Per-tab switch for text marked hidden; kept plain on purpose.
export function ShowHiddenTextItem() {
  const revealed = useSecretsRevealed();
  return (
    <MenuCheckboxItem checked={revealed} onCheckedChange={setSecretsRevealed}>
      Show hidden text
    </MenuCheckboxItem>
  );
}
