"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { colorFor } from "@/hooks/use-note-sync";
import { usePresence } from "@/hooks/use-presence";
import { relativeTime } from "@/lib/format";
import { createShare, findShare, listNotePeople, listShares, revokeShare, shareUrl } from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { useWorkspace } from "./workspace";

const PERMISSIONS = [
  { value: "view", label: "Can view" },
  { value: "edit", label: "Can edit" },
];

const EXPIRY = [
  { value: "never", label: "Never expires" },
  { value: "1", label: "Expires in 1 day" },
  { value: "7", label: "Expires in 7 days" },
  { value: "30", label: "Expires in 30 days" },
];

function expiryDate(value) {
  if (value === "never") return null;
  return new Date(Date.now() + Number(value) * 86400000).toISOString();
}

function isExpired(share) {
  return share.expires_at && new Date(share.expires_at) < new Date();
}

const ROLE_LABELS = { owner: "Owner", edit: "Can edit", view: "Can view" };

export function SharePopover({ note, open, onOpenChange, awareness }) {
  const { toast } = useWorkspace();
  const me = useStore((s) => s.user);
  const [shares, setShares] = useState(null);
  const [people, setPeople] = useState(null);
  const online = usePresence(awareness);
  const onlineIds = new Set(online.map((person) => person.id));
  // Someone who just joined through a link shows up without reopening the popover.
  const onlineKey = online.map((person) => person.id).sort().join(",");
  const [permission, setPermission] = useState("view");
  const [expiry, setExpiry] = useState("never");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listShares(note.id)
      .then((rows) => !cancelled && setShares(rows))
      .catch((error) => {
        if (cancelled) return;
        setShares([]);
        toast.add({ title: "Couldn't load share links", description: error.message, type: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, note.id, toast]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listNotePeople(note.id)
      .then((rows) => !cancelled && setPeople(rows))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, [open, note.id, onlineKey]);

  // One link per access level: picking an access that already has a link copies it.
  const existing = findShare(shares, permission);

  async function copy(share) {
    try {
      await navigator.clipboard.writeText(shareUrl(share.token));
      toast.add({ id: "share-copied", title: "Link copied", type: "success", timeout: 2000 });
    } catch {
      toast.add({ title: "Couldn't copy", description: shareUrl(share.token), type: "error" });
    }
  }

  async function create() {
    if (existing) {
      await copy(existing);
      return;
    }
    setBusy(true);
    try {
      const { share, reused } = await createShare(note.id, { permission, expiresAt: expiryDate(expiry) });
      if (!reused) setShares((current) => [share, ...(current ?? [])]);
      await copy(share);
    } catch (error) {
      toast.add({ title: "Couldn't create link", description: error.message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(share) {
    setShares((current) => current.filter((item) => item.id !== share.id));
    try {
      await revokeShare(share.id);
      toast.add({ title: "Link revoked", description: "It stops working immediately.", timeout: 2500 });
    } catch (error) {
      setShares((current) => [share, ...current]);
      toast.add({ title: "Couldn't revoke link", description: error.message, type: "error" });
    }
  }

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger render={<Button size="sm" variant="ghost" />}>
        <Icon icon="mdi:share-variant-outline" />
        <span className="max-sm:hidden">Share</span>
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-80">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <PopoverTitle className="text-base">Share this note</PopoverTitle>
            <p className="text-sm text-muted-foreground">Anyone with the link can open it after signing in.</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Select items={PERMISSIONS} onValueChange={setPermission} value={permission}>
                <SelectTrigger aria-label="Permission" className="min-w-0" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {PERMISSIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Select disabled={Boolean(existing)} items={EXPIRY} onValueChange={setExpiry} value={expiry}>
                <SelectTrigger aria-label="Expiry" className="min-w-0" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {EXPIRY.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <Button disabled={busy || shares === null} onClick={create}>
              {busy ? <Spinner /> : <Icon icon={existing ? "mdi:content-copy" : "mdi:link-variant"} />}
              {existing ? "Copy link" : "Create & copy link"}
            </Button>
            {existing && (
              <p className="text-xs text-muted-foreground">
                A “{existing.permission === "edit" ? "Can edit" : "Can view"}” link already exists, so it is copied
                instead of making a new one. Revoke it below to make a fresh link.
              </p>
            )}
          </div>

          {shares === null ? (
            <div className="flex justify-center py-2">
              <Spinner className="text-muted-foreground" />
            </div>
          ) : shares.length > 0 ? (
            <ul className="-mx-1 flex flex-col gap-1 border-t pt-3">
              {shares.map((share) => (
                <li className="flex items-center gap-2 rounded-lg px-1 py-1" key={share.id}>
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    icon={share.permission === "edit" ? "mdi:pencil-outline" : "mdi:eye-outline"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{share.permission === "edit" ? "Can edit" : "Can view"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {isExpired(share)
                        ? "Expired"
                        : share.expires_at
                          ? `Expires ${relativeTime(share.expires_at)}`
                          : `Created ${relativeTime(share.created_at)}`}
                    </p>
                  </div>
                  <Button aria-label="Copy link" onClick={() => copy(share)} size="icon-sm" variant="ghost">
                    <Icon icon="mdi:content-copy" />
                  </Button>
                  <Button aria-label="Revoke link" onClick={() => revoke(share)} size="icon-sm" variant="ghost">
                    <Icon icon="mdi:link-variant-off" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <PeopleList me={me} onlineIds={onlineIds} people={people} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/*
 * Everyone with access, people who have the note open right now first.
 * Names come from profiles (full_name); the email is the fallback.
 */
function PeopleList({ people, onlineIds, me }) {
  if (!people?.length) return null;
  const sorted = [...people].sort(
    (a, b) => Number(onlineIds.has(b.user_id)) - Number(onlineIds.has(a.user_id)) || a.joined_at.localeCompare(b.joined_at),
  );

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">People with access</p>
      <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto">
        {sorted.map((person) => {
          const isMe = person.user_id === me?.id;
          const isOnline = isMe || onlineIds.has(person.user_id);
          const name = person.full_name || person.email || "Unknown";
          return (
            <li className="flex items-center gap-2" key={person.user_id}>
              <PersonAvatar color={colorFor(person.user_id)} name={name} online={isOnline} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {name}
                  {isMe && <span className="text-muted-foreground"> (you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {isOnline ? "Here now" : person.role === "owner" ? "Owner" : `Joined ${relativeTime(person.joined_at)}`}
                  {person.full_name && person.email ? ` · ${person.email}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABELS[person.role] ?? person.role}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
