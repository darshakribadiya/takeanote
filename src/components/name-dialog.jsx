"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MAX_NAME_LENGTH, normalizeName, updateFullName } from "@/lib/notes/api";

/*
 * Sets the name people see on shared notes and live cursors.
 * `intro` replaces the description, e.g. on a shared note's first visit.
 */
export function NameDialog({ open, onOpenChange, initialName = "", intro, onSaved }) {
  const [name, setName] = useState(initialName);
  const [state, setState] = useState("idle"); // idle | saving | error
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setState("saving");
    setError(null);
    try {
      const user = await updateFullName(name);
      setState("idle");
      onSaved?.(user);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError?.message ?? "Couldn't save your name.");
      setState("error");
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup className="sm:max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Your name</DialogTitle>
            <DialogDescription>
              {intro ?? "Shown to people you share notes with."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel scrollFade={false}>
            <Field>
              <FieldLabel>Full name</FieldLabel>
              <Input
                autoComplete="name"
                autoFocus
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder="John Doe"
                required
                value={name}
              />
            </Field>
            {state === "error" && (
              <p className="mt-2 text-sm text-destructive-foreground" role="alert">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              {intro ? "Skip" : "Cancel"}
            </Button>
            <Button disabled={state === "saving" || !normalizeName(name)} type="submit">
              {state === "saving" && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
