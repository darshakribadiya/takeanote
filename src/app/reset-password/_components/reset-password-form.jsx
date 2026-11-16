"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MIN_PASSWORD_LENGTH } from "@/constants";
import { ensureSession, updatePassword } from "@/lib/notes/api";

export function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState("loading"); // loading | ready | expired | saving | error
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);

  // The reset link signs the user in; without a session the link was used or expired.
  useEffect(() => {
    ensureSession()
      .then((user) => setStatus(user ? "ready" : "expired"))
      .catch(() => setStatus("expired"));
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The passwords don't match.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      await updatePassword(password);
      router.replace("/");
    } catch (saveError) {
      setError(saveError?.message ?? "Couldn't save the password. Try again.");
      setStatus("error");
    }
  }

  if (status === "loading") return <Spinner />;

  if (status === "expired") {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Icon className="size-8 text-muted-foreground" icon="mdi:link-variant-off" />
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold">Reset link expired</h1>
          <p className="text-sm text-muted-foreground">
            Reset links work once and only for a short time. Request a new one from the sign-in screen.
          </p>
        </div>
        <Button render={<Link href="/login" />}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <form className="flex w-full max-w-sm flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-600 text-white">
          <Icon className="size-5" icon="mdi:lock-reset" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
        </div>
      </div>
      <Field>
        <FieldLabel>New password</FieldLabel>
        <Input
          autoComplete="new-password"
          autoFocus
          minLength={MIN_PASSWORD_LENGTH}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </Field>
      <Field>
        <FieldLabel>Confirm password</FieldLabel>
        <Input
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          onChange={(event) => setConfirm(event.target.value)}
          required
          type="password"
          value={confirm}
        />
      </Field>
      {status === "error" && (
        <p className="text-sm text-destructive-foreground" role="alert">
          {error}
        </p>
      )}
      <Button disabled={status === "saving"} type="submit">
        {status === "saving" && <Spinner />}
        Save password
      </Button>
    </form>
  );
}
