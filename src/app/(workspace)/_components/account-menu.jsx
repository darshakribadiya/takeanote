"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { NameDialog } from "@/components/name-dialog";
import { PersonAvatar } from "@/components/person-avatar";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { displayName } from "@/lib/notes/api";
import { setState } from "@/lib/notes/store";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/notes/store";
import { colorFor } from "@/hooks/use-note-sync";
import { getTheme, setTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace";

export function AccountMenu() {
  const { openShortcuts } = useWorkspace();
  const user = useStore((s) => s.user);
  const sync = useStore((s) => s.sync);
  const online = useStore((s) => s.online);
  const [theme, setThemeState] = useState(getTheme);
  const [nameOpen, setNameOpen] = useState(false);
  const fullName = user?.user_metadata?.full_name ?? "";
  // The workspace only opens with an email account, so a label always exists.
  const label = user ? displayName(user) : "Account";
  const syncLabel = !online ? "Offline" : sync === "live" ? "Synced" : "Connecting…";

  function changeTheme(value) {
    setThemeState(value);
    setTheme(value);
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <Menu>
            <MenuTrigger render={<SidebarMenuButton className="h-auto py-2" size="lg" />}>
              <PersonAvatar className="size-8 ring-0" color={colorFor(user?.id)} name={label} />
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-sm font-medium">{label}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      !online ? "bg-warning" : sync === "live" ? "bg-success" : "animate-pulse bg-muted-foreground",
                    )}
                  />
                  {syncLabel}
                </span>
              </span>
              <Icon className="text-muted-foreground" icon="mdi:unfold-more-horizontal" />
            </MenuTrigger>
            <MenuPopup align="start" className="w-64" side="top">
              <MenuGroup>
                <MenuGroupLabel>Theme</MenuGroupLabel>
                <MenuRadioGroup onValueChange={changeTheme} value={theme}>
                  <MenuRadioItem value="system">System</MenuRadioItem>
                  <MenuRadioItem value="light">Light</MenuRadioItem>
                  <MenuRadioItem value="dark">Dark</MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
              <MenuSeparator />
              <MenuItem onClick={() => setNameOpen(true)}>
                <Icon icon="mdi:account-edit-outline" />
                {fullName ? "Change your name" : "Add your name"}
              </MenuItem>
              <MenuItem onClick={openShortcuts}>
                <Icon icon="mdi:keyboard-outline" />
                Keyboard shortcuts
              </MenuItem>
              <MenuItem onClick={() => createClient().auth.signOut()}>
                <Icon icon="mdi:logout" />
                Sign out
              </MenuItem>
            </MenuPopup>
          </Menu>
        </SidebarMenuItem>
      </SidebarMenu>
      {nameOpen && (
        <NameDialog
          initialName={fullName}
          onOpenChange={setNameOpen}
          onSaved={(updated) => updated && setState({ user: updated })}
          open
        />
      )}
    </>
  );
}
