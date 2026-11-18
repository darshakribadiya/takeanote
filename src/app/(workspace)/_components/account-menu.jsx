"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { NameDialog } from "@/components/name-dialog";
import { PersonAvatar } from "@/components/person-avatar";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { displayName } from "@/lib/notes/api";
import { setState } from "@/lib/notes/store";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/notes/store";
import { colorFor } from "@/hooks/use-note-sync";
import { useIsMobile } from "@/hooks/use-media-query";
import { getTheme, setTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace";

const THEMES = [
  { value: "light", label: "Light", icon: "mdi:white-balance-sunny" },
  { value: "dark", label: "Dark", icon: "mdi:weather-night" },
  { value: "system", label: "System", icon: "mdi:monitor" },
];

export function AccountMenu() {
  const { openShortcuts } = useWorkspace();
  const isMobile = useIsMobile();
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
            {/* Desktop opens beside the sidebar; phones keep it above the trigger. */}
            <MenuPopup
              align={isMobile ? "start" : "end"}
              className="w-64"
              side={isMobile ? "top" : "right"}
              sideOffset={isMobile ? 4 : 8}
            >
              <div className="flex items-center gap-2.5 px-2 py-1.5">
                <PersonAvatar className="size-9 ring-0" color={colorFor(user?.id)} name={label} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{fullName || label}</span>
                  {user?.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
                </span>
              </div>
              <MenuSeparator />
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="text-sm">Theme</span>
                <SegmentedControl aria-label="Theme" role="radiogroup" size="sm">
                  {THEMES.map((option) => (
                    <SegmentedControlItem
                      aria-checked={theme === option.value}
                      aria-label={option.label}
                      data-checked={theme === option.value ? "" : undefined}
                      key={option.value}
                      onClick={() => changeTheme(option.value)}
                      role="radio"
                      title={option.label}
                    >
                      <Icon icon={option.icon} />
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </div>
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
