"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { colorFor } from "@/hooks/use-note-sync";
import { relativeTime } from "@/lib/format";
import { inviteUrl, isValidEmail, listInvites, normalizeEmail, revokeInvite, shareWithEmail } from "@/lib/notes/api";

export const PERMISSIONS = [
  { value: "view", label: "Can view" },
  { value: "edit", label: "Can edit" },
];

export const EXPIRY = [
  { value: "never", label: "Never expires" },
  { value: "1", label: "Expires in 1 day" },
  { value: "7", label: "Expires in 7 days" },
  { value: "30", label: "Expires in 30 days" },
];

// "7" -> ISO date 7 days from now; "never" -> null
export function expiryDate(value) {
  if (value === "never") return null;
  return new Date(Date.now() + Number(value) * 86400000).toISOString();
}

function isExpired(invite) {
  return Boolean(invite.expires_at) && new Date(invite.expires_at) < new Date();
}

/*
 * One line describing where an invite stands, most telling first.
 * Example: opened 2h ago and edited 5m ago -> { label: "Edited 5 minutes ago", tone: "edited" }
 */
function inviteStatus(invite, isOnline) {
  if (isExpired(invite)) return { label: "Expired", tone: "muted" };
  if (isOnline) return { label: "Here now", tone: "online" };
  if (invite.last_edited_at) return { label: `Edited ${relativeTime(invite.last_edited_at)}`, tone: "edited" };
  if (invite.last_opened_at) return { label: `Opened ${relativeTime(invite.last_opened_at)}`, tone: "opened" };
  return { label: `Invited ${relativeTime(invite.created_at)} · not opened yet`, tone: "muted" };
}

const TONE_ICONS = {
  online: "mdi:circle-medium",
  edited: "mdi:pencil-outline",
  opened: "mdi:eye-outline",
  muted: "mdi:clock-outline",
};

/*
 * "Invite by email" in the share popover: give one person access with a
 * permission and optional expiry, then follow whether they opened or
 * edited the note. No email is sent; the personal link is copied for the
 * owner to send, and the note also appears under "Shared with me" for
 * that person once they sign in with the invited email.
 */
export function InviteByEmail({ note, open, onlineIds, toast }) {
  const [invites, setInvites] = useState(null);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("view");
  const [expiry, setExpiry] = useState("never");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      setInvites(await listInvites(note.id));
    } catch (error) {
      setInvites((current) => current ?? []);
      toast.add({ title: "Couldn't load invites", description: error.message, type: "error" });
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listInvites(note.id)
      .then((rows) => !cancelled && setInvites(rows))
      .catch((error) => {
        if (cancelled) return;
        setInvites((current) => current ?? []);
        toast.add({ title: "Couldn't load invites", description: error.message, type: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, note.id, toast]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl(note.id));
      return true;
    } catch {
      return false;
    }
  }

  async function invite(event) {
    event.preventDefault();
    const target = normalizeEmail(email);
    if (!isValidEmail(target)) {
      toast.add({ title: "Enter a valid email address", type: "error" });
      return;
    }
    const already = invites?.find((item) => item.email === target);
    setBusy(true);
    try {
      await shareWithEmail(note.id, { email: target, permission, expiresAt: expiryDate(expiry) });
      setEmail("");
      await reload();
      const copied = await copyLink();
      toast.add({
        title: already ? `Updated access for ${target}` : `Shared with ${target}`,
        description: copied
          ? "Their personal link is copied. Send it to them, or they'll find it under “Shared with me”."
          : "They'll find it under “Shared with me” after signing in with this email.",
        type: "success",
      });
    } catch (error) {
      toast.add({ title: "Couldn't share", description: error.message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function changePermission(item, value) {
    setInvites((current) => current.map((row) => (row.id === item.id ? { ...row, permission: value } : row)));
    try {
      await shareWithEmail(note.id, { email: item.email, permission: value, expiresAt: item.expires_at });
    } catch (error) {
      toast.add({ title: "Couldn't change access", description: error.message, type: "error" });
      reload();
    }
  }

  async function remove(item) {
    setInvites((current) => current.filter((row) => row.id !== item.id));
    try {
      await revokeInvite(item.id);
      toast.add({ title: `Removed ${item.email}`, description: "They lose access immediately.", timeout: 2500 });
    } catch (error) {
      toast.add({ title: "Couldn't remove access", description: error.message, type: "error" });
      reload();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form className="flex flex-col gap-2" onSubmit={invite}>
        <div className="flex gap-2">
          <Input
            aria-label="Email to share with"
            autoComplete="off"
            className="min-w-0 flex-1"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
            size="sm"
            type="email"
            value={email}
          />
          <Button disabled={busy || !email.trim()} size="sm" type="submit">
            {busy ? <Spinner /> : <Icon icon="mdi:account-plus-outline" />}
            Invite
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceSelect items={PERMISSIONS} label="Permission" onChange={setPermission} value={permission} />
          <ChoiceSelect items={EXPIRY} label="Expiry" onChange={setExpiry} value={expiry} />
        </div>
      </form>

      {invites === null ? (
        <div className="flex justify-center py-2">
          <Spinner className="text-muted-foreground" />
        </div>
      ) : (
        invites.length > 0 && (
          <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto pt-1">
            {invites.map((item) => {
              const isOnline = Boolean(item.invitee_id) && onlineIds.has(item.invitee_id);
              const status = inviteStatus(item, isOnline);
              const name = item.full_name || item.email;
              return (
                <li className="flex items-center gap-2" key={item.id}>
                  <PersonAvatar color={colorFor(item.invitee_id ?? item.email)} name={name} online={isOnline} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" title={item.email}>
                      {name}
                    </p>
                    <p
                      className={
                        status.tone === "online"
                          ? "flex items-center gap-1 truncate text-xs text-success-foreground"
                          : "flex items-center gap-1 truncate text-xs text-muted-foreground"
                      }
                    >
                      <Icon className="size-3.5 shrink-0" icon={TONE_ICONS[status.tone]} />
                      <span className="truncate">
                        {status.label}
                        {item.expires_at && !isExpired(item) ? ` · expires ${relativeTime(item.expires_at)}` : ""}
                      </span>
                    </p>
                  </div>
                  <ChoiceSelect
                    className="w-24 shrink-0"
                    items={PERMISSIONS}
                    label={`Access for ${item.email}`}
                    onChange={(value) => changePermission(item, value)}
                    value={item.permission}
                  />
                  <Button
                    aria-label={`Copy personal link for ${item.email}`}
                    onClick={async () => {
                      const copied = await copyLink();
                      toast.add({
                        title: copied ? "Personal link copied" : "Couldn't copy",
                        description: copied ? `It opens only for ${item.email}.` : inviteUrl(note.id),
                        type: copied ? "success" : "error",
                        timeout: 2500,
                      });
                    }}
                    size="icon-sm"
                    title="Copy personal link"
                    variant="ghost"
                  >
                    <Icon icon="mdi:content-copy" />
                  </Button>
                  <Button
                    aria-label={`Remove ${item.email}`}
                    onClick={() => remove(item)}
                    size="icon-sm"
                    title="Remove access"
                    variant="ghost"
                  >
                    <Icon icon="mdi:account-remove-outline" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}

function ChoiceSelect({ items, value, onChange, label, className }) {
  return (
    <Select items={items} onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={label} className={className ?? "min-w-0"} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
