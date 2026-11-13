"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { APP_NAME } from "@/constants";
import { createClient } from "@/lib/supabase/client";

function callbackUrl() {
  return `${process.env.NEXT_PUBLIC_SITE_URL || location.origin}/auth/callback`;
}

/*
 * mode "signin":  magic link into an existing (or new) account.
 * mode "upgrade": attach an email to the current guest account so the
 *                 same notes are reachable from any device.
 */
export function SignInPanel({ mode = "signin", onDone }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setState("sending");
    const auth = createClient().auth;
    const { error: requestError } =
      mode === "upgrade"
        ? await auth.updateUser({ email }, { emailRedirectTo: callbackUrl() })
        : await auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl() } });
    if (requestError) {
      setError(requestError.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-success/16 text-success-foreground">
          <Icon className="size-5" icon="mdi:email-check-outline" />
        </span>
        <p className="font-medium">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground">{email}</span>.{" "}
          {mode === "upgrade" ? "Confirm it to keep your notes on every device." : "Open it to sign in."}
        </p>
        {onDone && (
          <Button onClick={onDone} variant="outline">
            Done
          </Button>
        )}
      </div>
    );
  }

  return (
    <form className="flex w-full max-w-sm flex-col gap-4" onSubmit={submit}>
      {mode === "signin" && !onDone && (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold">Sign in to {APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">We’ll email you a one-click sign-in link. No password.</p>
        </div>
      )}
      <Input
        aria-label="Email"
        autoComplete="email"
        autoFocus
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
        type="email"
        value={email}
      />
      {state === "error" && <p className="text-sm text-destructive-foreground">{error}</p>}
      <Button disabled={state === "sending"} type="submit">
        {state === "sending" && <Spinner />}
        {mode === "upgrade" ? "Send confirmation link" : "Email me a link"}
      </Button>
    </form>
  );
}
