"use client";

import { Icon } from "@iconify/react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const STATUS = {
  loading: { label: "Loading…", spinner: true },
  saved: { label: "Saved", icon: "mdi:check-circle-outline", tone: "text-muted-foreground" },
  dirty: { label: "Editing…", icon: "mdi:circle-edit-outline", tone: "text-muted-foreground" },
  saving: { label: "Saving…", spinner: true },
  unsaved: { label: "Unsaved changes", icon: "mdi:content-save-alert-outline", tone: "text-warning-foreground" },
  offline: {
    label: "Offline · kept on this device",
    icon: "mdi:cloud-off-outline",
    tone: "text-warning-foreground",
  },
  error: { label: "Couldn't save · retrying", icon: "mdi:alert-circle-outline", tone: "text-destructive-foreground" },
  conflict: { label: "Needs review", icon: "mdi:source-branch", tone: "text-warning-foreground" },
};

export function SaveStatus({ status, className }) {
  const config = STATUS[status] ?? STATUS.saved;
  return (
    <span
      aria-live="polite"
      className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", config.tone, className)}
      role="status"
    >
      {config.spinner ? <Spinner className="size-3.5" /> : <Icon className="size-3.5" icon={config.icon} />}
      <span className="max-sm:sr-only">{config.label}</span>
    </span>
  );
}
