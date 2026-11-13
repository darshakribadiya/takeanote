"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
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
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/notes/store";
import { getTheme, setTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SignInPanel } from "./sign-in-panel";
import { useWorkspace } from "./workspace";

export function AccountMenu() {
  const { openShortcuts } = useWorkspace();
  const user = useStore((s) => s.user);
  const sync = useStore((s) => s.sync);
  const online = useStore((s) => s.online);
  const [theme, setThemeState] = useState(getTheme);
  const [dialog, setDialog] = useState(null); // "upgrade" | "signin" | null

  const isGuest = !user || user.is_anonymous;
  const pendingEmail = user?.new_email;
  const label = isGuest ? "Guest" : user.email;
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
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-100 font-medium text-primary-700 dark:bg-primary-900 dark:text-primary-200">
                {isGuest ? <Icon className="size-4" icon="mdi:account-outline" /> : label[0].toUpperCase()}
              </span>
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
              {isGuest && (
                <>
                  <MenuItem onClick={() => setDialog("upgrade")}>
                    <Icon icon="mdi:email-outline" />
                    {pendingEmail ? "Resend confirmation" : "Keep notes on all devices"}
                  </MenuItem>
                  <MenuItem onClick={() => setDialog("signin")}>
                    <Icon icon="mdi:login" />
                    Sign in to an account
                  </MenuItem>
                  <MenuSeparator />
                </>
              )}
              <MenuGroup>
                <MenuGroupLabel>Theme</MenuGroupLabel>
                <MenuRadioGroup onValueChange={changeTheme} value={theme}>
                  <MenuRadioItem value="system">System</MenuRadioItem>
                  <MenuRadioItem value="light">Light</MenuRadioItem>
                  <MenuRadioItem value="dark">Dark</MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
              <MenuSeparator />
              <MenuItem onClick={openShortcuts}>
                <Icon icon="mdi:keyboard-outline" />
                Keyboard shortcuts
              </MenuItem>
              {!isGuest && (
                <MenuItem onClick={() => createClient().auth.signOut()}>
                  <Icon icon="mdi:logout" />
                  Sign out
                </MenuItem>
              )}
            </MenuPopup>
          </Menu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog onOpenChange={(open) => !open && setDialog(null)} open={Boolean(dialog)}>
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialog === "upgrade" ? "Keep your notes everywhere" : "Sign in to an account"}</DialogTitle>
            <DialogDescription>
              {dialog === "upgrade"
                ? "Add your email to this guest account. Every note stays exactly where it is."
                : "Notes written as a guest stay with the guest account. Add your email first to keep them."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {dialog && <SignInPanel key={dialog} mode={dialog} onDone={() => setDialog(null)} />}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
